import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import {
  doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  SUBTESTS, VIOLATION_SCORING, VIOLATION_TYPE_MAP, SECURITY_CONFIG, PAUSE_CONFIG
} from '../constants/config';
import { getQuestionDifficulty, getWeight } from '../utils/helpers';
import useWakeLock from './useWakeLock';

const useExamState = () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // --- Screens & Identity ---
  const [screen, setScreen] = useState('landing');
  const [studentName, setStudentName] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [currentTokenCode, setCurrentTokenCode] = useState('');

  // --- Exam State ---
  const [currentSubtestIndex, setCurrentSubtestIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [endTime, setEndTime] = useState(null);
  const [answers, setAnswers] = useState({});
  const [doubtful, setDoubtful] = useState({});
  const [testOrder, setTestOrder] = useState([]);
  const [questionOrder, setQuestionOrder] = useState({});
  const [breakTime, setBreakTime] = useState(10);
  const [countdownTime, setCountdownTime] = useState(5);
  const [bankSoal, setBankSoal] = useState({});
  const [globalStartTime, setGlobalStartTime] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);

  // --- Security States ---
  const [violationCount, setViolationCount] = useState(0);
  const [violationScore, setViolationScore] = useState(0);
  const [violationCounts, setViolationCounts] = useState({});
  const [violationReason, setViolationReason] = useState(null);
  const [securityActive, setSecurityActive] = useState(false);
  const [sp1Data, setSp1Data] = useState(null);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [lastViolationMsg, setLastViolationMsg] = useState('');
  const [currentViolationScore, setCurrentViolationScore] = useState(0);

  // --- Pause States ---
  const [isPaused, setIsPaused] = useState(false);
  const [pauseCount, setPauseCount] = useState(0);
  const [pauseTimeLeft, setPauseTimeLeft] = useState(PAUSE_CONFIG.MAX_PAUSE_DURATION);
  const pauseEndTimeRef = useRef(null);

  // --- Orientation ---
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);

  // --- Refs ---
  const timerRef = useRef(null);
  const pauseTimerRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  useWakeLock(securityActive && !isPaused);

  // --- 1. CORE VIOLATION LOGIC ---
  const handleViolationLogic = useCallback(async (type, message) => {
    if (isPaused || violationReason || showViolationWarning) return;

    const category = VIOLATION_TYPE_MAP[type];
    if (!category) return;

    const config = VIOLATION_SCORING.types[category];
    if (!config) return;

    const prevCount = (violationCounts[category] || 0);
    const newCountForCategory = prevCount + 1;
    const isInGrace = newCountForCategory <= config.grace;
    const deduction = isInGrace ? 0 : config.deduction;

    const newViolationCounts = { ...violationCounts, [category]: newCountForCategory };
    setViolationCounts(newViolationCounts);

    const newViolationScore = violationScore + deduction;
    setViolationScore(newViolationScore);
    setCurrentViolationScore(newViolationScore);

    if (currentTokenCode) {
      try {
        await updateDoc(doc(db, 'tokens', currentTokenCode), {
          violationScore: newViolationScore,
          [`violations.${category}`]: newCountForCategory,
          lastViolation: { type, message, category, deduction, timestamp: new Date().toISOString() }
        });
      } catch (e) { console.warn("Violation log failed", e); }
    }

    if (isInGrace) {
      console.warn(`[GRACE] ${type}: ${message} (grace ${newCountForCategory}/${config.grace})`);
      return;
    }

    if (newViolationScore >= VIOLATION_SCORING.maxTotalDeduction) {
      forceSubmitExam(`Total poin pelanggaran mencapai ${newViolationScore}. Auto-submit.`);
      return;
    }

    setLastViolationMsg(message);
    setShowViolationWarning(true);

    if (newViolationScore >= VIOLATION_SCORING.warningThreshold) {
      const newLegacyCount = violationCount + 1;
      setViolationCount(newLegacyCount);
      if (newLegacyCount >= SECURITY_CONFIG.MAX_VIOLATIONS) {
        forceSubmitExam(`Pelanggaran berat berulang: ${message}`);
      }
    }
  }, [isPaused, violationReason, showViolationWarning, violationCounts, violationScore, violationCount, currentTokenCode]);

  // --- 2. HELPERS ---
  const forceSubmitExam = useCallback((reason) => {
    setViolationReason(reason);
    setSecurityActive(false);
    setSp1Data(null);
    setShowViolationWarning(false);
    setIsPaused(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setScreen('result');
  }, []);

  const forceFullscreen = async () => {
    if (isIOS) return;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch (err) { console.warn('Fullscreen failed:', err); }
  };

  // --- 3. PAUSE LOGIC ---
  const handlePause = useCallback(() => {
    if (pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT) {
      alert(`Maksimal ${PAUSE_CONFIG.MAX_PAUSE_COUNT}x jeda per subtes sudah habis.`);
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setPauseCount((p) => p + 1);
    setPauseTimeLeft(PAUSE_CONFIG.MAX_PAUSE_DURATION);
    pauseEndTimeRef.current = Date.now() + (PAUSE_CONFIG.MAX_PAUSE_DURATION * 1000);
    setIsPaused(true);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [pauseCount]);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    const newEndTime = Date.now() + (timeLeft * 1000);
    setEndTime(newEndTime);
    forceFullscreen();
  }, [timeLeft]);

  // Pause countdown
  useEffect(() => {
    if (!isPaused) {
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
      return;
    }
    pauseTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((pauseEndTimeRef.current - Date.now()) / 1000));
      setPauseTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(pauseTimerRef.current);
        handleResume();
      }
    }, 1000);
    return () => { if (pauseTimerRef.current) clearInterval(pauseTimerRef.current); };
  }, [isPaused, handleResume]);

  // --- 4. ORIENTATION CHECK ---
  useEffect(() => {
    const checkOrientation = () => {
      const isMobileSize = window.innerWidth < 1024;
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isMobileSize && isLandscape) {
        setIsLandscapeMobile(true);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } else {
        setIsLandscapeMobile(false);
      }
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // --- 5. SESSION RESTORE ---
  useEffect(() => {
    const restoreSession = async () => {
      const savedToken = localStorage.getItem('utbk_student_token');
      if (!savedToken) return;
      try {
        const docSnap = await getDoc(doc(db, 'tokens', savedToken));
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const createdTime = new Date(data.createdAt).getTime();
        const now = Date.now();
        const sixtyDays = 60 * 24 * 60 * 60 * 1000;

        if (data.status === 'used' && data.score !== undefined) {
          if ((now - createdTime) > sixtyDays) {
            ['utbk_student_token', `answers_${savedToken}`, `questionOrder_${savedToken}`, `testOrder_${savedToken}`]
              .forEach((k) => localStorage.removeItem(k));
          } else {
            setStudentName(data.studentName);
            setCurrentTokenCode(savedToken);
            setAnswers(data.answers || {});
            if (data.historyQuestions) setQuestionOrder(data.historyQuestions);
            if (testOrder.length === 0) setTestOrder(SUBTESTS);
            setScreen('result');
          }
          return;
        }

        if (data.historyQuestions && Object.keys(data.historyQuestions).length > 0 && !data.score) {
          setStudentName(data.studentName);
          setCurrentTokenCode(savedToken);
          setQuestionOrder(data.historyQuestions);
          localStorage.setItem(`questionOrder_${savedToken}`, JSON.stringify(data.historyQuestions));
          setAnswers(data.answers || {});

          if (data.testOrder) {
            const restoredTestOrder = data.testOrder.map((id) => SUBTESTS.find((s) => s.id === id)).filter(Boolean);
            setTestOrder(restoredTestOrder);
            localStorage.setItem(`testOrder_${savedToken}`, JSON.stringify(restoredTestOrder));
          } else {
            const localTestOrder = localStorage.getItem(`testOrder_${savedToken}`);
            setTestOrder(localTestOrder ? JSON.parse(localTestOrder) : SUBTESTS);
          }

          if (data.currentProgress) {
            setCurrentSubtestIndex(data.currentProgress.subtestIndex || 0);
            setCurrentQuestion(data.currentProgress.questionIndex || 0);
          }
          if (data.violationScore) setViolationScore(data.violationScore);
          if (data.violations) setViolationCounts(data.violations);

          setSecurityActive(true);
          setGlobalStartTime(data.startedAt ? new Date(data.startedAt).getTime() : Date.now());
          setCountdownTime(3);
          setScreen('countdown');
        } else {
          localStorage.removeItem('utbk_student_token');
        }
      } catch (error) { console.error(error); }
    };
    restoreSession();
  }, []);

  // --- 6. APP CHECK & SOAL ---
  useEffect(() => {
    const initAppCheck = async () => {
      try {
        const siteKey = import.meta.env.VITE_RECAPTCHA;
        if (siteKey) {
          if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
            window.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          }
          initializeAppCheck(getApp(), {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true,
          });
        }
      } catch (error) { console.error("App Check init failed:", error); }
    };
    initAppCheck();
  }, []);

  useEffect(() => {
    const loadBankSoal = async () => {
      const loaded = {};
      await Promise.all(SUBTESTS.map(async (subtest) => {
        try {
          const docSnap = await getDoc(doc(db, 'bank_soal', subtest.id));
          loaded[subtest.id] = docSnap.exists() ? docSnap.data().questions : [];
        } catch { loaded[subtest.id] = []; }
      }));
      setBankSoal(loaded);
    };
    loadBankSoal();
  }, []);

  // --- 7. IRT SCORE CALCULATION ---
  const calculateScore = useCallback(() => {
    const details = {};
    let totalIrtScore = 0;
    const mapelOrder = ['pu', 'ppu', 'pk', 'pbm', 'lbi', 'lbe', 'pm'];

    mapelOrder.forEach((id) => {
      const s = SUBTESTS.find((item) => item.id === id);
      if (!s) return;
      let rawScore = 0, maxRaw = 0, correctCount = 0;
      const questions = questionOrder[s.id] || [];

      questions.forEach((q, i) => {
        const k = `${s.id}_${i}`;
        const ans = answers[k];
        const weight = getWeight(getQuestionDifficulty(q, i));
        const typeMultiplier = q.type === 'isian' ? 1.5 : q.type === 'pilihan_majemuk' ? 1.2 : 1;
        const itemValue = weight * typeMultiplier;
        maxRaw += itemValue;

        let isCorrect = false;
        if (ans) {
          if (q.type === 'pilihan_majemuk') {
            if (Array.isArray(ans) && Array.isArray(q.correct)) {
              isCorrect = [...ans].sort().join(',') === [...q.correct].sort().join(',');
            }
          } else if (q.type === 'isian') {
            isCorrect = ans.toString().toLowerCase().trim() === q.correct.toString().toLowerCase().trim();
          } else {
            isCorrect = ans === q.correct;
          }
        }
        if (isCorrect) { correctCount++; rawScore += itemValue; }
      });

      const ratio = maxRaw > 0 ? (rawScore / maxRaw) : 0;
      const irtScore = Math.round(200 + (ratio * 800));
      totalIrtScore += irtScore;
      details[id] = { b: correctCount, skor: irtScore };
    });

    return {
      totalScore: Math.round(totalIrtScore / mapelOrder.length),
      details,
      scores: Object.fromEntries(mapelOrder.map((id) => [id, details[id]?.skor || 0])),
      correctCounts: Object.fromEntries(mapelOrder.map((id) => [id, details[id]?.b || 0])),
    };
  }, [answers, questionOrder]);

  // --- 8. FINISH EXAM ---
  useEffect(() => {
    if (screen === 'result' && currentTokenCode) {
      if (timerRef.current) clearInterval(timerRef.current);
      setSecurityActive(false);

      const finishExamProcess = async () => {
        const { totalScore, details } = calculateScore();
        const totalAllocatedMS = SUBTESTS.reduce((acc, curr) => acc + curr.time, 0) * 60 * 1000;
        const usedTimeMS = globalStartTime ? (Date.now() - globalStartTime) : totalAllocatedMS;
        const globalTimeLeftSeconds = Math.max(0, Math.floor((totalAllocatedMS - usedTimeMS) / 1000));

        try {
          await updateDoc(doc(db, 'tokens', currentTokenCode), {
            status: 'used', score: totalScore, scoreDetails: details,
            finalTimeLeft: globalTimeLeftSeconds, finishedAt: new Date().toISOString(),
            violation: violationReason || null, answers, historyQuestions: questionOrder,
            violationScore,
          });
          ['answers_', 'questionOrder_', 'testOrder_'].forEach((prefix) =>
            localStorage.removeItem(`${prefix}${currentTokenCode}`)
          );

          const snap = await getDocs(query(
            collection(db, 'tokens'),
            where('score', '!=', null),
            orderBy('score', 'desc'),
            limit(10)
          ));
          const top10 = [];
          let rank = 1, userRank = null;
          snap.forEach((d) => {
            const dt = d.data();
            top10.push({ rank, name: dt.studentName, school: dt.studentSchool || '-', score: dt.score, details: dt.scoreDetails || {} });
            if (dt.tokenCode === currentTokenCode) userRank = rank;
            rank++;
          });
          setLeaderboard(top10);
          setMyRank(userRank);
        } catch (error) { console.error("Save Error:", error); }
      };

      if (globalStartTime) {
        finishExamProcess();
      } else {
        const loadLeaderboardOnly = async () => {
          const snap = await getDocs(query(
            collection(db, 'tokens'),
            where('score', '!=', null),
            orderBy('score', 'desc'),
            limit(10)
          ));
          const top10 = [];
          let rank = 1, userRank = null;
          snap.forEach((d) => {
            const dt = d.data();
            top10.push({ rank, name: dt.studentName, school: dt.studentSchool || '-', score: dt.score, details: dt.scoreDetails || {} });
            if (dt.tokenCode === currentTokenCode) userRank = rank;
            rank++;
          });
          setLeaderboard(top10);
          setMyRank(userRank);
        };
        loadLeaderboardOnly();
      }
    }
  }, [screen]);

  // --- 9. TOKEN LOGIN ---
  const handleTokenLogin = async () => {
    if (!inputToken.trim()) { alert('Masukkan Kode Token!'); return; }
    const tokenCode = inputToken.trim().toUpperCase().replace(/\s/g, '');

    try {
      const docSnap = await getDoc(doc(db, 'tokens', tokenCode));
      if (!docSnap.exists()) { alert('Token TIDAK DITEMUKAN.'); return; }

      const data = docSnap.data();
      const createdTime = new Date(data.createdAt).getTime();
      const now = Date.now();

      if (data.status === 'used') {
        if ((now - createdTime) > 60 * 24 * 60 * 60 * 1000) { alert('Token kadaluarsa.'); return; }
        localStorage.setItem('utbk_student_token', tokenCode);
        setStudentName(data.studentName);
        setCurrentTokenCode(tokenCode);
        setAnswers(data.answers || {});
        if (data.historyQuestions) setQuestionOrder(data.historyQuestions);
        if (testOrder.length === 0) setTestOrder(SUBTESTS);
        setScreen('result');
        return;
      }

      if ((now - createdTime) > 24 * 60 * 60 * 1000) { alert('Token Expired (>24 Jam).'); return; }

      if (confirm(`Login sebagai ${data.studentName}?`)) {
        await updateDoc(doc(db, 'tokens', tokenCode), { loginAt: new Date().toISOString() });
        localStorage.setItem('utbk_student_token', tokenCode);
        setStudentName(data.studentName);
        setCurrentTokenCode(tokenCode);
        setViolationReason(null); setSp1Data(null); setViolationCount(0);
        setViolationScore(0); setViolationCounts({});
        setSecurityActive(true);
        await forceFullscreen();
        setCountdownTime(5);
        setScreen('countdown');
      }
    } catch (error) { alert(`Error: ${error.message}`); }
  };

  // --- 10. START TEST ---
  const startTest = useCallback((bypass = false) => {
    if (!bypass) return;
    if (!globalStartTime) setGlobalStartTime(Date.now());

    for (const s of SUBTESTS) {
      if ((bankSoal[s.id]?.length || 0) < s.questions) { alert(`Soal ${s.name} belum siap.`); return; }
    }

    const savedQO = localStorage.getItem(`questionOrder_${currentTokenCode}`);
    const savedTO = localStorage.getItem(`testOrder_${currentTokenCode}`);

    let shuffledSubtests, qOrder;

    if (savedQO && savedTO) {
      qOrder = JSON.parse(savedQO);
      shuffledSubtests = JSON.parse(savedTO);
    } else {
      shuffledSubtests = [...SUBTESTS].sort(() => Math.random() - 0.5);
      qOrder = {};
      shuffledSubtests.forEach((subtest) => {
        const bank = [...(bankSoal[subtest.id] || [])];
        qOrder[subtest.id] = bank.sort(() => Math.random() - 0.5).slice(0, subtest.questions);
      });
      localStorage.setItem(`questionOrder_${currentTokenCode}`, JSON.stringify(qOrder));
      localStorage.setItem(`testOrder_${currentTokenCode}`, JSON.stringify(shuffledSubtests));

      if (currentTokenCode) {
        updateDoc(doc(db, 'tokens', currentTokenCode), {
          historyQuestions: qOrder,
          testOrder: shuffledSubtests.map((s) => s.id),
          startedAt: new Date().toISOString(),
        }).catch((e) => console.error("Firebase backup error:", e));
      }
    }

    setTestOrder(shuffledSubtests);
    setQuestionOrder(qOrder);
    setCurrentSubtestIndex(0);
    setCurrentQuestion(0);
    const saved = localStorage.getItem(`answers_${currentTokenCode}`);
    setAnswers(saved ? JSON.parse(saved) : {});
    setDoubtful({});
    setPauseCount(0);

    const durationSec = shuffledSubtests[0].time * 60;
    setEndTime(Date.now() + (durationSec * 1000));
    setTimeLeft(durationSec);
    setSecurityActive(true);
    setScreen('test');
  }, [globalStartTime, bankSoal, currentTokenCode]);

  // --- 11. TIMER & TRANSITION ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (screen === 'test' && endTime && !isPaused) {
      timerRef.current = setInterval(() => {
        const delta = Math.floor((endTime - Date.now()) / 1000);
        if (delta <= 0) {
          clearInterval(timerRef.current);
          setTimeLeft(0);
          if (currentSubtestIndex < testOrder.length - 1) {
            setScreen('break');
            setBreakTime(10);
            setPauseCount(0);
          } else {
            setSecurityActive(false);
            setScreen('result');
          }
        } else {
          setTimeLeft(delta);
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, endTime, currentSubtestIndex, testOrder, isPaused]);

  useEffect(() => {
    if (screen === 'countdown' && countdownTime > 0) {
      const t = setTimeout(() => setCountdownTime((p) => p - 1), 1000);
      return () => clearTimeout(t);
    }
    if (screen === 'countdown' && countdownTime === 0) startTest(true);
  }, [countdownTime, screen]);

  useEffect(() => {
    if (screen === 'break' && breakTime > 0) {
      const t = setTimeout(() => setBreakTime((p) => p - 1), 1000);
      return () => clearTimeout(t);
    }
    if (screen === 'break' && breakTime === 0) {
      const n = currentSubtestIndex + 1;
      setCurrentSubtestIndex(n);
      setCurrentQuestion(0);
      setPauseCount(0);
      const durationSec = testOrder[n].time * 60;
      setEndTime(Date.now() + (durationSec * 1000));
      setTimeLeft(durationSec);
      setScreen('test');
    }
  }, [breakTime, screen]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentQuestion, currentSubtestIndex, screen]);

  // --- 12. ANSWER & NAVIGATION ---
  const handleAnswer = useCallback((val, type) => {
    const k = `${testOrder[currentSubtestIndex].id}_${currentQuestion}`;
    setAnswers((prev) => {
      let newAnswers = { ...prev };
      if (type === 'pilihan_majemuk') {
        let current = newAnswers[k] || [];
        newAnswers[k] = current.includes(val) ? current.filter((x) => x !== val) : [...current, val];
      } else {
        newAnswers[k] = val;
      }
      localStorage.setItem(`answers_${currentTokenCode}`, JSON.stringify(newAnswers));
      if (currentTokenCode) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          updateDoc(doc(db, 'tokens', currentTokenCode), {
            answers: newAnswers, historyQuestions: questionOrder,
            lastAnsweredAt: new Date().toISOString(),
            currentProgress: { subtestIndex: currentSubtestIndex, questionIndex: currentQuestion },
          }).catch((e) => console.error("Firebase backup error:", e));
        }, 2000);
      }
      return newAnswers;
    });
  }, [testOrder, currentSubtestIndex, currentQuestion, currentTokenCode, questionOrder]);

  const handleNextQuestion = useCallback(() => {
    const currentSubtest = testOrder[currentSubtestIndex];
    if (currentQuestion < currentSubtest.questions - 1) {
      setCurrentQuestion((p) => p + 1);
    } else {
      if (currentSubtestIndex < testOrder.length - 1) {
        setScreen('break');
        setBreakTime(10);
      } else {
        setSecurityActive(false);
        setScreen('result');
      }
    }
  }, [currentQuestion, currentSubtestIndex, testOrder]);

  const handleSetDoubtful = useCallback((key) => {
    setDoubtful((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const handleLogout = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    localStorage.removeItem('utbk_student_token');
    setScreen('landing');
    setInputToken('');
    setStudentName('');
  };

  const handleCloseViolationWarning = useCallback(() => {
    setShowViolationWarning(false);
    forceFullscreen();
  }, []);

  // --- Expose ---
  return {
    // State
    isIOS,
    screen,
    studentName,
    inputToken, setInputToken,
    currentTokenCode,
    currentSubtestIndex,
    currentQuestion,
    timeLeft,
    answers,
    doubtful,
    testOrder,
    questionOrder,
    breakTime,
    countdownTime,
    globalStartTime,
    leaderboard,
    myRank,
    violationScore,
    violationReason,
    securityActive,
    sp1Data,
    showViolationWarning,
    lastViolationMsg,
    currentViolationScore,
    isPaused,
    pauseCount,
    pauseTimeLeft,
    isLandscapeMobile,
    // Computed
    calculateScore,
    // Handlers
    handleTokenLogin,
    handleViolationLogic,
    handlePause,
    handleResume,
    handleAnswer,
    handleNextQuestion,
    handleSetDoubtful,
    handleLogout,
    handleCloseViolationWarning,
    setCurrentQuestion,
  };
};

export default useExamState;
