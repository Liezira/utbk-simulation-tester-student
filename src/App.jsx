import React, { useState, useEffect, useRef } from 'react';
import { Clock, Ticket, AlertCircle, CheckCircle, XCircle, ShieldAlert, Timer, Trophy, Copyright, CheckSquare, AlignLeft, List, Activity, TrendingUp, BookOpen, PieChart, Target, Lightbulb, LayoutDashboard, MapPin, AlertOctagon, AlertTriangle, Shield, Eye, Camera } from 'lucide-react';
import { db } from './firebase'; 
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

// --- CONFIGURATION ---
const SUBTEST_GROUPS = {
  TPS: { title: "Tes Potensi Skolastik (TPS)", ids: ['pu', 'ppu', 'pbm', 'pk'], color: "#3b82f6" },
  LITERASI: { title: "Tes Literasi & Penalaran", ids: ['lbi', 'lbe', 'pm'], color: "#f97316" }
};

const SUBTESTS = [
  { id: 'pu', name: 'Penalaran Umum', questions: 30, time: 30 },
  { id: 'ppu', name: 'Pengetahuan & Pemahaman Umum', questions: 20, time: 15 },
  { id: 'pbm', name: 'Pemahaman Bacaan & Menulis', questions: 20, time: 25 },
  { id: 'pk', name: 'Pengetahuan Kuantitatif', questions: 20, time: 20 },
  { id: 'lbi', name: 'Literasi Bahasa Indonesia', questions: 30, time: 45 },
  { id: 'lbe', name: 'Literasi Bahasa Inggris', questions: 20, time: 30 },
  { id: 'pm', name: 'Penalaran Matematika', questions: 20, time: 30 },
];

// --- SECURITY CONFIGURATION (FROM SOURCE 1) ---
const SECURITY_CONFIG = {
  MAX_VIOLATIONS: 2, 
  MAX_BLUR_COUNT: 3, 
  MAX_VISIBILITY_CHANGE: 2, 
  SCREENSHOT_CHECK_INTERVAL: 2000, 
  PASTE_BLOCKED: true, 
  COPY_BLOCKED: true, 
  DEVTOOLS_BLOCKED: true, 
  RIGHT_CLICK_BLOCKED: true, 
};

// --- IRT HELPER FUNCTIONS (FROM SOURCE 2 - UPDATED LOGIC) ---
const getQuestionDifficulty = (question, index) => {
    if (question.difficulty) {
        if (question.difficulty === 'hard') return 3;
        if (question.difficulty === 'medium') return 2;
        return 1;
    }
    // Pola: Kelipatan 3 = Hard, Genap = Medium, Ganjil = Easy
    if ((index + 1) % 3 === 0) return 3; 
    if ((index + 1) % 2 === 0) return 2; 
    return 1; 
};

const getWeight = (difficultyLevel) => {
    switch (difficultyLevel) {
        case 3: return 2.0; // Hard
        case 2: return 1.5; // Medium
        default: return 1.0; // Easy
    }
};

// --- ADVANCED SECURITY COMPONENT (FROM SOURCE 1 + SP1 Logic) ---
const AdvancedSecurityMonitor = ({ onViolation, isActive, studentName, tokenCode, onForceSubmit, onWarning }) => {
  const [violations, setViolations] = useState({ blur: 0, visibility: 0, fullscreen: 0, devtools: 0, copy: 0, paste: 0, rightClick: 0, screenshot: 0, systemKey: 0 });
  const lastActivityRef = useRef(Date.now());
  const screenshotCheckRef = useRef(null);
  const devtoolsCheckRef = useRef(null);

  const handleViolation = async (type, message) => {
    setViolations(prev => {
      const newViolations = { ...prev, [type]: (prev[type] || 0) + 1 };
      const totalViolations = Object.values(newViolations).reduce((a, b) => a + b, 0);
      logViolationToFirebase(type, message, totalViolations);
      onViolation(type, message, totalViolations);

      if (totalViolations === 1) { onWarning(type, message); } 
      else if (totalViolations >= SECURITY_CONFIG.MAX_VIOLATIONS) { onForceSubmit(`DISKUALIFIKASI: Total ${totalViolations} pelanggaran terdeteksi.`); }
      return newViolations;
    });
  };

  const logViolationToFirebase = async (type, message, totalCount) => {
    try {
      const docRef = doc(db, 'tokens', tokenCode);
      updateDoc(docRef, { [`violations.${type}`]: totalCount, lastViolation: { type, message, timestamp: new Date().toISOString() } }).catch(e => {});
    } catch (e) {}
  };

  // 1. CSS INJECTION (ANTI SELECT)
  useEffect(() => {
    if (!isActive) return;
    const style = document.createElement('style');
    style.innerHTML = `body { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; } @media print { html, body { display: none !important; } }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [isActive]);

  // 2. DETEKSI SCREENSHOT & LAYAR
  useEffect(() => {
    if (!isActive) return;
    const detectScreenAnomalies = () => {
      const currentTime = Date.now();
      if (document.hidden && (currentTime - lastActivityRef.current < 100)) { handleViolation('screenshot', '⚠️ Terdeteksi kedipan layar (Indikasi Screenshot)'); }
    };
    screenshotCheckRef.current = setInterval(detectScreenAnomalies, 1000);
    return () => clearInterval(screenshotCheckRef.current);
  }, [isActive]);

  // 3. DETEKSI DEVTOOLS
  useEffect(() => {
    if (!isActive || !SECURITY_CONFIG.DEVTOOLS_BLOCKED) return;
    const detectDevTools = () => {
      const threshold = 160; 
      if ((window.outerWidth - window.innerWidth > threshold) || (window.outerHeight - window.innerHeight > threshold)) { handleViolation('devtools', '🚫 DevTools terdeteksi terbuka!'); }
    };
    devtoolsCheckRef.current = setInterval(detectDevTools, 1500);
    return () => clearInterval(devtoolsCheckRef.current);
  }, [isActive]);

  // 4. EVENT LISTENER GLOBAL
  useEffect(() => {
    if (!isActive) return;
    const handleBlur = () => handleViolation('blur', '⚠️ Dilarang pindah aplikasi!');
    const handleVisibilityChange = () => { if (document.hidden) handleViolation('visibility', '⚠️ Terdeteksi pindah tab!'); };
    const handleFullscreenChange = () => { if (!document.fullscreenElement) handleViolation('fullscreen', '🚫 Dilarang keluar fullscreen!'); };
    const preventDefault = (e) => e.preventDefault();
    const handleCopy = (e) => { e.preventDefault(); if (navigator.clipboard) navigator.clipboard.writeText("CHEAT DETECTED"); handleViolation('copy', '🚫 Copy diblokir!'); };
    const handlePaste = (e) => { e.preventDefault(); handleViolation('paste', '🚫 Paste diblokir!'); };
    const handleContextMenu = (e) => { e.preventDefault(); handleViolation('rightClick', '🚫 Klik kanan diblokir!'); };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('dragstart', preventDefault);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', preventDefault);
    };
  }, [isActive]);

  // 5. KEYBOARD SECURITY (WINDOWS KEY & PRINTSCREEN)
  useEffect(() => {
    if (!isActive) return;
    const nukeClipboard = () => { try { if (navigator.clipboard) navigator.clipboard.writeText(" "); } catch (e) {} };
    const handleKeyDown = (e) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) { e.preventDefault(); nukeClipboard(); handleViolation('screenshot', '🚫 Screenshot dilarang!'); return false; }
      if (e.key === 'Meta' || e.key === 'OS' || e.keyCode === 91 || e.keyCode === 92) { e.preventDefault(); handleViolation('systemKey', '🚫 Dilarang menekan tombol Windows/System!'); return false; }
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C','S'].includes(e.key.toUpperCase())) || (e.ctrlKey && ['U','S','P'].includes(e.key.toUpperCase())) || (e.altKey && e.key === 'Tab')) { e.preventDefault(); handleViolation('devtools', '🚫 Shortcut terlarang!'); return false; }
    };
    const handleKeyUp = (e) => { if (e.key === 'PrintScreen' || e.keyCode === 44) nukeClipboard(); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isActive]);

  return null;
};

// --- SP1 MODAL COMPONENT (FROM SOURCE 1) ---
const SP1Modal = ({ data, onClose }) => (
  <div className="fixed inset-0 z-[9999] bg-red-900/90 flex items-center justify-center p-4 animate-in zoom-in duration-300 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-4 border-red-600">
      <div className="bg-red-600 p-6 text-center">
        <ShieldAlert size={64} className="text-white mx-auto mb-2 animate-bounce" />
        <h2 className="text-3xl font-black text-white uppercase tracking-wider">PERINGATAN KERAS!</h2>
        <div className="inline-block bg-red-800 text-red-100 px-3 py-1 rounded-full text-xs font-bold mt-2 border border-red-400">SURAT PERINGATAN 1 (SP1)</div>
      </div>
      <div className="p-8 text-center space-y-4">
        <div><p className="text-gray-500 text-xs font-bold uppercase mb-1">Jenis Pelanggaran Terdeteksi:</p><p className="text-xl font-bold text-red-600 bg-red-50 py-3 rounded-lg border border-red-100">"{data?.message || 'Aktivitas Mencurigakan'}"</p></div>
        <p className="text-gray-700 text-sm leading-relaxed">Sistem mendeteksi aktivitas yang melanggar aturan ujian. Ini adalah <b>PERINGATAN TERAKHIR</b>.</p>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 text-left text-xs text-yellow-800"><b>⚠️ Konsekuensi Selanjutnya:</b><br/>Jika Anda melakukan pelanggaran satu kali lagi, ujian akan <b>OTOMATIS TERKUNCI</b> dan Anda dinyatakan <b>DISKUALIFIKASI</b>.</div>
      </div>
      <div className="p-4 bg-gray-50 border-t border-gray-200"><button onClick={onClose} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl transition shadow-lg transform hover:-translate-y-1 active:scale-95">SAYA MENGERTI & BERJANJI TIDAK MENGULANGI</button></div>
    </div>
  </div>
);

// --- WATERMARK COMPONENT ---
const SecurityWatermark = ({ studentName, tokenCode }) => {
  const watermarkText = `${studentName} • ${tokenCode} • ${new Date().toLocaleString('id-ID')}`;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9998, opacity: 0.08, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', alignItems: 'center', overflow: 'hidden' }}>
      {Array(30).fill(watermarkText).map((text, i) => (<span key={i} style={{ transform: 'rotate(-45deg)', fontSize: '16px', fontWeight: 'bold', color: '#000', margin: '40px', whiteSpace: 'nowrap' }}>{text}</span>))}
    </div>
  );
};

// --- MAIN APP COMPONENT ---
const UTBKStudentApp = () => {
  const [screen, setScreen] = useState('landing');
  const [studentName, setStudentName] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [currentTokenCode, setCurrentTokenCode] = useState('');
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
  const [violationReason, setViolationReason] = useState(null);
  
  // Security State (Source 1)
  const [securityActive, setSecurityActive] = useState(false);
  const [sp1Data, setSp1Data] = useState(null);

  const timerRef = useRef(null);

  const forceFullscreen = async () => {
    try { if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); } } catch (err) { console.error('Fullscreen failed:', err); alert('⚠️ Gagal masuk fullscreen. Ujian memerlukan mode fullscreen!'); }
  };

  const handleSecurityViolation = (type, message, totalCount) => {
    console.warn(`Security Violation [${type}]:`, message, 'Total:', totalCount);
    if (type === 'fullscreen') { forceFullscreen(); }
  };

  const forceSubmitExam = (reason) => {
    setViolationReason(reason);
    setSecurityActive(false);
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
    setScreen('result');
  };

  const handleSecurityWarning = (type, message) => {
    setSp1Data({ type, message });
    if (document.activeElement) document.activeElement.blur();
  };

  const closeSP1 = () => {
    setSp1Data(null);
    forceFullscreen();
  };

  // --- SESSION RESTORE (Source 2 Logic - Better expiration handling) ---
  useEffect(() => {
    const restoreSession = async () => {
        const savedToken = localStorage.getItem('utbk_student_token');
        if (savedToken) {
            try {
                const docRef = doc(db, 'tokens', savedToken);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const createdTime = new Date(data.createdAt).getTime();
                    const now = Date.now();
                    const oneDay = 24 * 60 * 60 * 1000;
                    const sixtyDays = 60 * 24 * 60 * 60 * 1000;
                    if (data.status === 'used' && data.score !== undefined) {
                        if ((now - createdTime) > sixtyDays) {
                            localStorage.removeItem('utbk_student_token');
                            localStorage.removeItem(`answers_${savedToken}`);
                        } else {
                            setStudentName(data.studentName);
                            setCurrentTokenCode(savedToken);
                            setAnswers(data.answers || {});
                            if (data.historyQuestions) setQuestionOrder(data.historyQuestions);
                            if (testOrder.length === 0) setTestOrder(SUBTESTS); 
                            setScreen('result');
                        }
                    } else {
                        if ((now - createdTime) < oneDay) {
                            setStudentName(data.studentName);
                            setCurrentTokenCode(savedToken);
                            const savedAnswers = localStorage.getItem(`answers_${savedToken}`);
                            if (savedAnswers) { setAnswers(JSON.parse(savedAnswers)); }
                        } else {
                            localStorage.removeItem('utbk_student_token');
                            localStorage.removeItem(`answers_${savedToken}`);
                        }
                    }
                }
            } catch (error) { console.error(error); }
        }
    };
    restoreSession();
  }, []);

  // --- APP CHECK ---
  useEffect(() => {
    const initAppCheck = async () => {
        try {
            const siteKey = import.meta.env.VITE_RECAPTCHA;
            if (siteKey) {
                if (typeof window !== 'undefined' && window.location.hostname === 'localhost') { window.FIREBASE_APPCHECK_DEBUG_TOKEN = true; }
                const app = getApp(); 
                initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
            }
        } catch (error) { console.error("App Check init failed:", error); }
    };
    initAppCheck();
  }, []);

  // --- LOAD SOAL ---
  useEffect(() => {
    const loadBankSoal = async () => {
      const loaded = {};
      for (const subtest of SUBTESTS) {
        try {
          const docRef = doc(db, 'bank_soal', subtest.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) loaded[subtest.id] = docSnap.data().questions;
          else loaded[subtest.id] = [];
        } catch (error) { loaded[subtest.id] = []; }
      }
      setBankSoal(loaded);
    };
    loadBankSoal();
  }, []);

  // --- IRT CALCULATION (Source 2 Logic - 200 to 1000 Scale) ---
  const calculateScore = () => { 
    const details = {}; 
    const correctCounts = {};
    let totalIrtScore = 0;
    const mapelOrder = ['pu', 'ppu', 'pk', 'pbm', 'lbi', 'lbe', 'pm']; 

    mapelOrder.forEach(id => {
        const s = SUBTESTS.find(item => item.id === id);
        if(!s) return;
        let rawScore = 0; 
        let maxRaw = 0;
        let correctCount = 0; 
        const questions = questionOrder[s.id] || [];

        questions.forEach((q, i) => { 
            const k = `${s.id}_${i}`; 
            const ans = answers[k];
            const difficulty = getQuestionDifficulty(q, i);
            const weight = getWeight(difficulty);
            let typeMultiplier = 1;
            if (q.type === 'isian') typeMultiplier = 1.5;
            if (q.type === 'pilihan_majemuk') typeMultiplier = 1.2;
            const itemValue = weight * typeMultiplier;
            maxRaw += itemValue;

            let isCorrect = false;
            if (ans) {
                if (q.type === 'pilihan_majemuk') {
                    if (Array.isArray(ans) && Array.isArray(q.correct)) {
                        const sortedAns = [...ans].sort().join(',');
                        const sortedKey = [...q.correct].sort().join(',');
                        isCorrect = (sortedAns === sortedKey);
                    }
                } else if (q.type === 'isian') {
                    if (ans.toString().toLowerCase().trim() === q.correct.toString().toLowerCase().trim()) isCorrect = true;
                } else { isCorrect = (ans === q.correct); }
            }
            if (isCorrect) { correctCount++; rawScore += itemValue; }
        }); 

        const ratio = maxRaw > 0 ? (rawScore / maxRaw) : 0;
        const irtScore = Math.round(200 + (ratio * 800)); 
        totalIrtScore += irtScore;
        correctCounts[id] = correctCount;
        details[id] = { b: correctCount, skor: irtScore };
    }); 

    const finalAverageScore = Math.round(totalIrtScore / mapelOrder.length);
    const scoresForDashboard = {};
    mapelOrder.forEach(id => { scoresForDashboard[id] = details[id].skor; });

    return { totalScore: finalAverageScore, details: details, scores: scoresForDashboard, correctCounts: correctCounts }; 
  };

  // --- FINISH EXAM & LEADERBOARD (Source 2 Logic) ---
  useEffect(() => {
    if (screen === 'result' && currentTokenCode) {
        if (timerRef.current) clearInterval(timerRef.current);
        setSecurityActive(false);

        const finishExamProcess = async () => {
            const { totalScore, details } = calculateScore();
            const totalAllocatedMinutes = SUBTESTS.reduce((acc, curr) => acc + curr.time, 0);
            const totalAllocatedMS = totalAllocatedMinutes * 60 * 1000;
            const usedTimeMS = globalStartTime ? (Date.now() - globalStartTime) : totalAllocatedMS;
            const globalTimeLeftSeconds = Math.max(0, Math.floor((totalAllocatedMS - usedTimeMS) / 1000));

            try {
                const tokenRef = doc(db, 'tokens', currentTokenCode);
                await updateDoc(tokenRef, { 
                    status: 'used', score: totalScore, scoreDetails: details, 
                    finalTimeLeft: globalTimeLeftSeconds, finishedAt: new Date().toISOString(), 
                    violation: violationReason || null, answers: answers, historyQuestions: questionOrder 
                });
                localStorage.removeItem(`answers_${currentTokenCode}`);

                const q = query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), orderBy('finalTimeLeft', 'desc'), limit(10));
                const querySnapshot = await getDocs(q);
                const top10 = [];
                let rank = 1; let userRank = null;
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    top10.push({ rank, name: data.studentName, school: data.studentSchool || '-', score: data.score, details: data.scoreDetails || {}, timeLeft: data.finalTimeLeft });
                    if (data.tokenCode === currentTokenCode) userRank = rank;
                    rank++;
                });
                setLeaderboard(top10);
                setMyRank(userRank);
            } catch (error) { console.error("Leaderboard Error:", error); }
        };
        
        if (globalStartTime) { finishExamProcess(); } 
        else {
             const loadLeaderboardOnly = async () => {
                 const q = query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), limit(10));
                 const snap = await getDocs(q);
                 const top10 = [];
                 let rank = 1; let userRank = null;
                 snap.forEach(d => {
                     const dt = d.data();
                     top10.push({ rank, name: dt.studentName, school: dt.studentSchool||'-', score: dt.score, details: dt.scoreDetails || {}, timeLeft: dt.finalTimeLeft });
                     if (dt.tokenCode === currentTokenCode) userRank = rank;
                     rank++;
                 });
                 setLeaderboard(top10);
                 setMyRank(userRank);
             }
             loadLeaderboardOnly();
        }
    }
  }, [screen]);

  // --- TOKEN LOGIN ---
  const handleTokenLogin = async () => {
    if (!inputToken.trim()) { alert('Masukkan Kode Token!'); return; }
    const tokenCode = inputToken.trim().toUpperCase();
    const docRef = doc(db, 'tokens', tokenCode);
    try {
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) { alert('Token TIDAK DITEMUKAN.'); return; }
      const data = docSnap.data();
      const createdTime = new Date(data.createdAt).getTime();
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const sixtyDays = 60 * 24 * 60 * 60 * 1000;

      if (data.status === 'used') {
          if ((now - createdTime) > sixtyDays) { alert(`Maaf, Token ini sudah melewati batas penyimpanan 60 hari.`); return; }
          localStorage.setItem('utbk_student_token', tokenCode);
          setStudentName(data.studentName);
          setCurrentTokenCode(tokenCode);
          setAnswers(data.answers || {});
          if (data.historyQuestions) setQuestionOrder(data.historyQuestions);
          if (testOrder.length === 0) setTestOrder(SUBTESTS); 
          setScreen('result');
          return;
      }
      if ((now - createdTime) > oneDay) { alert('Token SUDAH KADALUARSA (Expired > 24 Jam). Anda tidak bisa memulai ujian.'); return; }

      if (confirm(`Login sebagai ${data.studentName}?\n\n⚠️ PERINGATAN:\n- Ujian menggunakan sistem anti-cheat KETAT\n- Screenshot, split screen, pindah tab akan terdeteksi\n- Maksimal ${SECURITY_CONFIG.MAX_VIOLATIONS} pelanggaran sebelum auto-submit\n\nLanjutkan?`)) {
        await forceFullscreen();
        await updateDoc(docRef, { loginAt: new Date().toISOString() }); 
        localStorage.setItem('utbk_student_token', tokenCode);
        setStudentName(data.studentName);
        setCurrentTokenCode(tokenCode);
        setViolationReason(null);
        setCountdownTime(5); 
        setScreen('countdown'); 
      }
    } catch (error) { console.error(error); alert('Koneksi Error.'); }
  };

  const startTest = (bypass = false) => {
    if (!bypass) return;
    if (!globalStartTime) setGlobalStartTime(Date.now()); 
    for (const s of SUBTESTS) { if ((bankSoal[s.id]?.length || 0) < s.questions) { alert(`Soal ${s.name} belum siap.`); return; } }
    const shuffledSubtests = [...SUBTESTS].sort(() => Math.random() - 0.5);
    setTestOrder(shuffledSubtests);
    const qOrder = {};
    shuffledSubtests.forEach((subtest) => {
      const bank = [...(bankSoal[subtest.id] || [])];
      qOrder[subtest.id] = bank.sort(() => Math.random() - 0.5).slice(0, subtest.questions);
    });
    setQuestionOrder(qOrder);
    setCurrentSubtestIndex(0); setCurrentQuestion(0); 
    const saved = localStorage.getItem(`answers_${currentTokenCode}`);
    if(saved) setAnswers(JSON.parse(saved));
    else setAnswers({}); 
    setDoubtful({}); 
    const durationSec = shuffledSubtests[0].time * 60;
    const targetTime = Date.now() + (durationSec * 1000);
    setEndTime(targetTime);
    setTimeLeft(durationSec);
    setSecurityActive(true);
    setScreen('test');
  };

  // --- TIMING LOGIC ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (screen === 'test' && endTime) {
        timerRef.current = setInterval(() => {
            const now = Date.now();
            const delta = Math.floor((endTime - now) / 1000); 
            if (delta <= 0) {
                clearInterval(timerRef.current);
                setTimeLeft(0);
                if (currentSubtestIndex < testOrder.length - 1) { setSecurityActive(false); setScreen('break'); setBreakTime(10); } 
                else { setSecurityActive(false); setScreen('result'); }
            } else { setTimeLeft(delta); }
        }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, endTime, currentSubtestIndex, testOrder]);

  useEffect(() => { if (screen === 'countdown' && countdownTime > 0) { const t = setTimeout(() => setCountdownTime(countdownTime - 1), 1000); return () => clearTimeout(t); } else if (screen === 'countdown' && countdownTime === 0) { startTest(true); } }, [countdownTime, screen]);
  useEffect(() => { if (screen === 'break' && breakTime > 0) { const t = setTimeout(() => setBreakTime(breakTime - 1), 1000); return () => clearTimeout(t); } else if (screen === 'break' && breakTime === 0) { const n = currentSubtestIndex + 1; setCurrentSubtestIndex(n); setCurrentQuestion(0); const durationSec = testOrder[n].time * 60; setEndTime(Date.now() + (durationSec * 1000)); setTimeLeft(durationSec); setSecurityActive(true); setScreen('test'); } }, [breakTime, screen]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentQuestion, currentSubtestIndex, screen]);
  
  const handleAnswer = (val, type) => { 
      const k = `${testOrder[currentSubtestIndex].id}_${currentQuestion}`;
      setAnswers(prev => {
          let newAnswers = { ...prev };
          if (type === 'pilihan_majemuk') {
              let current = newAnswers[k] || [];
              if (current.includes(val)) current = current.filter(x => x !== val);
              else current.push(val);
              newAnswers[k] = current;
          } else { newAnswers[k] = val; }
          localStorage.setItem(`answers_${currentTokenCode}`, JSON.stringify(newAnswers));
          return newAnswers;
      });
  };
  
  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
  const handleNextQuestion = () => { if (currentQuestion < currentSubtest.questions - 1) { setCurrentQuestion(currentQuestion + 1); } else { if (currentSubtestIndex < testOrder.length - 1) { setSecurityActive(false); setScreen('break'); setBreakTime(10); } else { setSecurityActive(false); setScreen('result'); } } };
  const FooterLiezira = () => (<div className="mt-8 py-4 border-t border-gray-200 w-full text-center"><p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1"><Copyright size={12} /> {new Date().getFullYear()} Created by <span className="font-bold text-indigo-400">RuangSimulasi</span></p></div>);

  // --- ANALYSIS DASHBOARD (Source 1 Style with Source 2 Data) ---
  const AnalysisDashboard = () => {
      const { scores, totalScore, correctCounts } = calculateScore();
      const tpsIds = SUBTEST_GROUPS.TPS.ids;
      const litIds = SUBTEST_GROUPS.LITERASI.ids;
      const tpsTotal = tpsIds.reduce((acc, id) => acc + (scores[id] || 0), 0);
      const litTotal = litIds.reduce((acc, id) => acc + (scores[id] || 0), 0);
      const tpsAvg = Math.round(tpsTotal / tpsIds.length);
      const litAvg = Math.round(litTotal / litIds.length);
      const grandTotal = tpsAvg + litAvg || 1; 
      const tpsPercent = Math.round((tpsAvg / grandTotal) * 100);
      const litPercent = 100 - tpsPercent;
      const isWeakTPS = tpsAvg < litAvg;
      const mitigationText = isWeakTPS ? "Rata-rata TPS kamu lebih rendah. Fokus perbaiki logika dasar, kuantitatif, dan penalaran umum." : "Kemampuan logikamu kuat, tapi Literasi perlu ditingkatkan. Perbanyak latihan membaca cepat (skimming).";
      let motivation = "Terus berjuang!"; let badgeColor = "bg-gray-500"; let prediction = "Perlu Peningkatan";
      if (totalScore >= 700) { motivation = "LUAR BIASA! Skor ini sangat kompetitif untuk PTN Favorit."; badgeColor = "bg-emerald-500"; prediction = "Sangat Kompetitif"; } 
      else if (totalScore >= 600) { motivation = "KERJA BAGUS! Kamu di atas rata-rata nasional."; badgeColor = "bg-blue-500"; prediction = "Kompetitif"; } 
      else if (totalScore >= 500) { motivation = "RATA-RATA. Nilai aman untuk PTN menengah."; badgeColor = "bg-yellow-500"; prediction = "Cukup Baik"; } 
      else { motivation = "JANGAN MENYERAH! Skor masih di bawah 500. Evaluasi strategi."; badgeColor = "bg-orange-500"; prediction = "Butuh Latihan Ekstra"; }

      const totalAllocatedMinutes = SUBTESTS.reduce((acc, curr) => acc + curr.time, 0);
      const totalAllocatedSeconds = totalAllocatedMinutes * 60;
      const usedTimeMS = globalStartTime ? (Date.now() - globalStartTime) : (totalAllocatedSeconds * 1000);
      const remainingSeconds = Math.max(0, totalAllocatedSeconds - Math.floor(usedTimeMS / 1000));
      let tempoStatus = "Tempo Ideal"; let tempoDesc = "Ritme pengerjaanmu sudah pas dengan standar UTBK.";
      if (remainingSeconds > 3600) { if (totalScore < 500) { tempoStatus = "Terlalu Cepat"; tempoDesc = "Sisa waktu banyak tapi skor rendah. Kurang teliti."; } else { tempoStatus = "Sangat Efisien"; tempoDesc = "Cepat dan skor bagus! Pertahankan."; } } 
      else if (remainingSeconds < 600 && remainingSeconds > 0) { tempoStatus = "Hampir Habis"; tempoDesc = "Waktu mepet. Perbaiki manajemen waktu di soal sulit."; }

      return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500 text-left">
              <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden border border-slate-700/50">
                  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] -mr-20 -mt-20 pointer-events-none"></div>
                  <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-6 md:gap-8">
                      <div className="text-center lg:text-left flex-1 space-y-4">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md"><span className={`w-2 h-2 rounded-full ${badgeColor} shadow-[0_0_10px_currentColor]`}></span><span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Status: {prediction}</span></div>
                          <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-100">{motivation}</h2>
                          <p className="text-indigo-200 text-xs md:text-sm lg:text-base max-w-xl opacity-90">Hasil ini adalah cerminan pemahamanmu saat ini. Gunakan data di bawah untuk strategi belajar selanjutnya.</p>
                      </div>
                      <div className="relative group">
                          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full group-hover:opacity-30 transition duration-1000"></div>
                          <div className="bg-white/5 p-6 md:p-8 rounded-3xl shadow-2xl border border-white/10 backdrop-blur-xl text-center min-w-[200px] md:min-w-[240px] relative z-10">
                              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Skor Rata-Rata</span>
                              <div className="text-6xl md:text-8xl font-black text-white tracking-tighter drop-shadow-2xl">{totalScore}</div>
                              <div className="mt-2 text-xs text-indigo-300 font-medium bg-indigo-900/50 py-1 px-3 rounded-full inline-block">Simulasi IRT</div>
                          </div>
                      </div>
                  </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                      <div className="w-full flex justify-between items-center mb-6 border-b border-slate-100 pb-4"><h4 className="font-bold text-slate-700 flex items-center gap-2"><PieChart size={18}/> Komposisi Rata-Rata</h4></div>
                      <div className="flex flex-col md:flex-row items-center gap-8 w-full justify-center">
                          <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full flex-shrink-0 flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]" style={{ background: `conic-gradient(#3b82f6 0% ${tpsPercent}%, #f97316 ${tpsPercent}% 100%)` }}>
                              <div className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full flex flex-col items-center justify-center shadow-lg z-10">
                                  <span className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">DOMINASI</span>
                                  <span className={`text-lg md:text-xl font-black ${tpsPercent > litPercent ? 'text-blue-600' : 'text-orange-600'}`}>{tpsPercent > litPercent ? 'TPS' : 'LITERASI'}</span>
                              </div>
                          </div>
                          <div className="space-y-4 w-full max-w-xs">
                              <div><div className="flex justify-between text-xs font-bold text-slate-500 mb-1"><span>TPS (Logika)</span> <span>{tpsPercent}%</span></div><div className="w-full bg-slate-100 rounded-full h-2"><div style={{width: `${tpsPercent}%`}} className="h-full bg-blue-600 rounded-full"></div></div><div className="text-right text-xs font-mono font-bold text-blue-600 mt-1">Avg: {tpsAvg}</div></div>
                              <div><div className="flex justify-between text-xs font-bold text-slate-500 mb-1"><span>Literasi (Bahasa)</span> <span>{litPercent}%</span></div><div className="w-full bg-slate-100 rounded-full h-2"><div style={{width: `${litPercent}%`}} className="h-full bg-orange-500 rounded-full"></div></div><div className="text-right text-xs font-mono font-bold text-orange-600 mt-1">Avg: {litAvg}</div></div>
                          </div>
                      </div>
                  </div>
                  <div className="flex flex-col gap-6">
                      <div className="bg-orange-50 border border-orange-200 p-6 rounded-2xl flex gap-4 items-start shadow-sm flex-1">
                          <div className="bg-orange-500 text-white p-3 rounded-xl shadow-lg shadow-orange-200 shrink-0"><Lightbulb size={24}/></div>
                          <div><h4 className="font-bold text-orange-900 text-lg mb-1 flex items-center gap-2">Rekomendasi AI</h4><p className="text-orange-800 text-sm leading-relaxed opacity-90">{mitigationText}</p></div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-3"><div className="bg-slate-200 p-2 rounded-lg text-slate-600"><Activity size={20}/></div><div><h4 className="font-bold text-slate-700 text-sm">{tempoStatus}</h4><p className="text-xs text-slate-500 max-w-[200px]">{tempoDesc}</p></div></div>
                          <div className="text-right"><span className="text-2xl font-mono font-bold text-slate-800">{formatTime(remainingSeconds)}</span><span className="text-xs text-slate-400 block">Sisa Waktu Global</span></div>
                      </div>
                  </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h4 className="font-bold text-slate-700 flex items-center gap-2"><LayoutDashboard size={18}/> Rincian Performa Subtes</h4><span className="text-xs font-medium text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">Deep Dive Analysis</span></div>
                  <div className="divide-y divide-slate-100">
                      {SUBTESTS.map((s, idx) => {
                          const score = scores[s.id] || 0; const correct = correctCounts[s.id] || 0; const totalQ = s.questions; const accuracy = Math.round((correct / totalQ) * 100);
                          let colorClass = "bg-slate-400"; let textClass = "text-slate-600";
                          if(accuracy >= 75) { colorClass = "bg-emerald-500"; textClass="text-emerald-600"; } else if(accuracy >= 50) { colorClass = "bg-blue-500"; textClass="text-blue-600"; } else if(accuracy >= 30) { colorClass = "bg-yellow-500"; textClass="text-yellow-600"; } else { colorClass = "bg-red-500"; textClass="text-red-600"; }
                          return (
                              <div key={s.id} className="p-5 hover:bg-slate-50 transition group">
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                      <div className="flex items-center gap-4">
                                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-md ${colorClass}`}>{accuracy}%</div>
                                          <div><h5 className="font-bold text-slate-800 text-sm md:text-base">{s.name}</h5><div className="flex items-center gap-3 mt-1"><span className="text-xs font-medium text-slate-500">Benar: <strong className={textClass}>{correct}</strong> / {totalQ} Soal</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span className="text-xs text-slate-400">Akurasi Jawaban</span></div></div>
                                      </div>
                                      <div className="flex items-center gap-6 w-full md:w-auto"><div className="flex-1 md:w-48"><div className="flex justify-between text-xs mb-1.5 font-bold text-slate-400"><span>Progress Skor (Max 1000)</span></div><div className="w-full bg-slate-100 rounded-full h-2"><div className={`h-full rounded-full transition-all duration-1000 ${colorClass}`} style={{ width: `${Math.min(100, Math.abs(score/10))}%` }}></div></div></div><div className="text-right min-w-[60px]"><span className="block text-[10px] uppercase font-bold text-slate-400">Skor</span><span className="text-xl font-black text-slate-800">{score}</span></div></div>
                                  </div>
                              </div>
                          )
                      })}
                  </div>
              </div>
          </div>
      );
  };

  // --- SCREENS ---
  if (screen === 'countdown') {
    return (
      <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white select-none">
        <div className="mb-8 animate-pulse"><Timer size={64} /></div>
        <h2 className="text-2xl font-bold mb-4 uppercase tracking-widest">Persiapan Ujian</h2>
        <div className="text-[120px] font-bold leading-none mb-4 text-yellow-400 font-mono">{countdownTime}</div>
        <p className="text-indigo-200 text-sm max-w-md text-center px-4">Pastikan posisi nyaman. Dilarang keluar fullscreen.</p>
        <div className="mt-8 bg-red-900/50 border-2 border-red-400 rounded-xl p-4 max-w-md">
          <p className="text-red-200 text-xs font-bold flex items-center gap-2 mb-2"><Shield size={16}/> SISTEM KEAMANAN AKTIF</p>
          <ul className="text-red-100 text-xs space-y-1"><li>• Max {SECURITY_CONFIG.MAX_VIOLATIONS} pelanggaran = Auto Submit</li><li>• Screenshot, Split Screen, DevTools terdeteksi</li><li>• Watermark aktif di setiap halaman</li></ul>
        </div>
      </div>
    );
  }

  if (screen === 'landing') {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full relative text-center my-8">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          <h1 className="text-2xl font-bold text-indigo-900 mb-1">Sistem Simulasi Test UTBK SNBT</h1>
          <p className="text-gray-500 mb-6 text-sm">Platform Ujian Berbasis Token Online</p>
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4 text-left text-xs text-red-800">
            <div className="font-bold flex items-center gap-2 mb-2 text-red-900"><ShieldAlert size={18}/>ADVANCED ANTI-CHEAT SYSTEM:</div>
            <ul className="list-disc pl-4 space-y-1 font-semibold"><li>✓ Real-time Screenshot Detection</li><li>✓ DevTools Auto-Block</li><li>✓ Split Screen Monitor</li><li>✓ Tab Switch Prevention</li><li>✓ Copy/Paste Disabled</li><li>✓ Watermark Tracking</li><li className="text-red-600 font-black">⚠️ MAX {SECURITY_CONFIG.MAX_VIOLATIONS} VIOLATIONS = DISKUALIFIKASI</li></ul>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl mb-6">
            <label className="block text-indigo-900 font-bold mb-2 text-sm flex items-center justify-center gap-2"><Ticket size={18}/> Kode Token:</label>
            <input type="text" value={inputToken} onChange={e => setInputToken(e.target.value.toUpperCase())} className="w-full px-4 py-3 border-2 border-indigo-200 rounded-lg text-xl font-mono text-center tracking-widest uppercase outline-none focus:ring-4 focus:ring-indigo-100 bg-white" placeholder="UTBK-XXXXXX" />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 text-left shadow-sm">
            <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2"><AlertCircle size={16} className="text-indigo-600"/> Poin Penilaian (Metode IRT):</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex justify-between bg-green-50 px-2 py-1 rounded border border-green-100"><span className="flex gap-2 items-center"><CheckCircle size={16} className="text-green-600"/>Bobot Soal</span><span className="font-bold text-green-700">Dinamis</span></li>
              <li className="text-xs text-gray-400 mt-2 italic">*Nilai ditentukan berdasarkan tingkat kesulitan soal dan tipe soal.</li>
            </ul>
          </div>
          <button onClick={handleTokenLogin} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-indigo-700 transition shadow-lg transform hover:-translate-y-1">Mulai Ujian Sekarang</button>
          <FooterLiezira />
        </div>
      </div>
    );
  }

  if (screen === 'break') {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-indigo-50 to-white flex flex-col items-center justify-center p-4 select-none">
        <div className="relative flex items-center justify-center mb-8">
          <div className="absolute w-64 h-64 rounded-full border-4 border-indigo-100"></div>
          <div className="absolute w-60 h-60 rounded-full border-8 border-indigo-500 animate-pulse opacity-20"></div>
          <div className="w-56 h-56 bg-white rounded-full shadow-2xl flex items-center justify-center border-8 border-indigo-600 relative z-10">
            <div className="text-center"><span className="block text-7xl font-bold text-indigo-700">{breakTime}</span><span className="text-indigo-400 text-sm font-bold uppercase tracking-wider">Detik</span></div>
          </div>
        </div>
        <p className="text-sm text-gray-400 font-medium tracking-wide">LANJUT OTOMATIS...</p>
      </div>
    );
  }

  if (screen === 'result') {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center items-center select-none overflow-y-auto">
        <div className="bg-white p-4 md:p-8 rounded-xl shadow-2xl max-w-[95%] w-full text-center my-8">
          <h1 className="text-3xl font-bold mb-2 text-indigo-900 hidden">Hasil Ujian</h1>
          <h2 className="text-xl text-gray-600 mb-4 font-medium">{studentName}</h2>
          {violationReason && (<div className="bg-red-100 border-2 border-red-400 text-red-800 p-4 rounded-lg mb-6 font-bold animate-pulse"><div className="flex items-center justify-center gap-2 text-lg"><ShieldAlert size={24} /> UJIAN DIHENTIKAN OTOMATIS</div><p className="text-sm font-normal mt-1">Alasan: {violationReason}</p></div>)}
          
          {/* Dashboard Analisis dari Source 1 */}
          <AnalysisDashboard />

          {/* Tabel Skor dari Source 2 */}
          <div className="w-full bg-white p-0 md:p-4 overflow-hidden mt-8 mb-8">
            <div className="text-center font-extrabold text-lg md:text-xl mb-4 uppercase text-gray-800 tracking-tight">SKOR TRYOUT AKBAR UTBK SNBT 2026</div>
            <div className="overflow-x-auto border border-gray-800 shadow-md">
              <table className="min-w-full text-[10px] md:text-xs border-collapse">
                <thead>
                  <tr className="bg-teal-700 text-white font-bold text-center uppercase tracking-wider">
                    <th rowSpan="2" className="border border-white p-2 w-8">No</th><th rowSpan="2" className="border border-white p-2 min-w-[120px]">Nama</th><th rowSpan="2" className="border border-white p-2 min-w-[100px]">Sekolah</th>
                    <th colSpan="2" className="border border-white p-1">PU</th><th colSpan="2" className="border border-white p-1">PPU</th><th colSpan="2" className="border border-white p-1">PK</th><th colSpan="2" className="border border-white p-1">PBM</th><th colSpan="2" className="border border-white p-1">Lit. B. Indo</th><th colSpan="2" className="border border-white p-1">Lit. B. Ing</th><th colSpan="2" className="border border-white p-1">PM</th>
                    <th rowSpan="2" className="border border-white p-2 w-16 bg-teal-800">Rata-rata</th>
                  </tr>
                  <tr className="bg-teal-600 text-white font-bold text-center text-[9px] uppercase">
                    {Array(7).fill(null).map((_, i) => (<React.Fragment key={i}><th className="border border-white px-1 py-1 min-w-[25px]">B</th><th className="border border-white px-1 py-1 min-w-[35px]">Skor</th></React.Fragment>))}
                  </tr>
                </thead>
                <tbody className="text-gray-900 bg-white font-medium">
                  {leaderboard.length === 0 ? (<tr><td colSpan="18" className="p-6 text-center text-gray-500 italic">Memuat data peringkat...</td></tr>) : leaderboard.map((row, idx) => {
                    const getVal = (id, type) => row.details?.[id]?.[type] || 0;
                    const isMe = row.name === studentName;
                    return (
                      <tr key={idx} className={`text-center transition-colors ${isMe ? 'bg-yellow-100 font-bold border-2 border-yellow-400' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-100')} hover:bg-yellow-50`}>
                        <td className="border border-gray-400 p-2">{row.rank}</td>
                        <td className="border border-gray-400 p-2 text-left truncate max-w-[150px]" title={row.name}>{row.name} {isMe && '(Kamu)'}</td>
                        <td className="border border-gray-400 p-2 text-left truncate max-w-[120px]" title={row.school}>{row.school}</td>
                        {['pu', 'ppu', 'pk', 'pbm', 'lbi', 'lbe', 'pm'].map(id => (<React.Fragment key={id}><td className="border border-gray-400 p-1">{getVal(id, 'b')}</td><td className="border border-gray-400 p-1 text-teal-800">{getVal(id, 'skor')}</td></React.Fragment>))}
                        <td className="border border-gray-400 p-2 font-bold bg-teal-50 text-teal-900">{row.score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-center">
              {myRank ? (<div className="inline-block bg-teal-100 text-teal-800 px-4 py-2 rounded-full font-bold text-sm border border-teal-200 shadow-sm">🎉 Selamat! Kamu peringkat <span className="text-lg">{myRank}</span> dari seluruh peserta.</div>) : (<div className="inline-block bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm border border-gray-200">Kamu belum masuk Top 10. Terus tingkatkan performamu!</div>)}
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <button onClick={() => { if (document.fullscreenElement) { document.exitFullscreen().catch(()=>{}); } localStorage.removeItem('utbk_student_token'); setScreen('landing'); setInputToken(''); setStudentName(''); }} className="w-full bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-xl font-bold hover:bg-red-100 transition">Selesai / Logout</button>
            <FooterLiezira />
          </div>
        </div>
      </div>
    );
  }
  
  // --- TEST SCREEN ---
  const currentSubtest = testOrder[currentSubtestIndex];
  if (!currentSubtest || !questionOrder[currentSubtest.id]) { return (<div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div><p>Memuat soal...</p></div>); }
  const currentQ = questionOrder[currentSubtest.id][currentQuestion];
  const key = `${currentSubtest.id}_${currentQuestion}`;
  const qType = currentQ.type || 'pilihan_ganda'; 

  return (
    <div className="min-h-screen w-full bg-gray-50 select-none pb-10" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      {/* --- SECURITY COMPONENTS (SOURCE 1) --- */}
      <AdvancedSecurityMonitor onViolation={handleSecurityViolation} isActive={securityActive && !sp1Data} studentName={studentName} tokenCode={currentTokenCode} onForceSubmit={forceSubmitExam} onWarning={handleSecurityWarning} />
      {sp1Data && <SP1Modal data={sp1Data} onClose={closeSP1} />}
      <SecurityWatermark studentName={studentName} tokenCode={currentTokenCode} />

      <div className="sticky top-0 z-40 bg-indigo-700 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div><h2 className="text-xl font-bold">{currentSubtest.name}</h2><p className="text-sm text-indigo-200">Soal {currentQuestion + 1} / {currentSubtest.questions}</p></div>
          <div className="flex items-center gap-3"><div className="flex items-center gap-2 bg-indigo-800 px-4 py-2 rounded-lg"><Shield size={18} className="text-green-400"/><span className="text-xs font-bold">PROTECTED</span></div><div className="flex items-center gap-3 bg-indigo-800 px-6 py-3 rounded-lg"><Clock size={24} /><span className="text-2xl font-bold">{formatTime(timeLeft)}</span></div></div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h3 className="font-semibold text-gray-700 mb-3">Navigasi</h3>
              <div className="grid grid-cols-5 gap-2">{Array.from({ length: currentSubtest.questions }).map((_, idx) => { const qKey = `${currentSubtest.id}_${idx}`; const isAnswered = answers[qKey] && (Array.isArray(answers[qKey]) ? answers[qKey].length > 0 : true); return (<button key={idx} onClick={() => setCurrentQuestion(idx)} className={`w-10 h-10 rounded font-semibold ${idx === currentQuestion ? 'bg-indigo-600 text-white' : isAnswered ? (doubtful[qKey] ? 'bg-yellow-400 text-white' : 'bg-green-500 text-white') : 'bg-gray-200'}`}>{idx + 1}</button>); })}</div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
              <div className="mb-8">
                <div className="mb-2"><span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex w-fit items-center gap-1">{qType === 'pilihan_majemuk' ? <CheckSquare size={12}/> : qType === 'isian' ? <AlignLeft size={12}/> : <List size={12}/>} {qType.replace('_', ' ')}</span></div>
                <div className="text-lg text-gray-800 leading-loose whitespace-pre-wrap font-medium mb-6 text-left text-justify"><Latex>{currentQ?.question}</Latex></div>
                {currentQ?.image && (<div className="flex justify-center my-6"><img src={currentQ.image} alt="Soal Visual" className="w-full h-auto my-6 select-none object-contain" onContextMenu={e=>e.preventDefault()} draggable="false" /></div>)}
              </div>
              <div className="mb-8">
                  {qType === 'isian' ? (
                      <div className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300"><label className="block text-sm font-bold text-gray-600 mb-2">Jawaban Singkat (Angka/Kata):</label><input type="text" value={answers[key] || ''} onChange={(e) => handleAnswer(e.target.value, 'isian')} className="w-full p-4 text-xl font-mono border-2 border-indigo-200 rounded-lg focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition" placeholder="Ketik jawaban kamu di sini..." /></div>
                  ) : (
                      <div className="space-y-3">
                        {['A', 'B', 'C', 'D', 'E'].map((l, idx) => {
                            const isSelected = qType === 'pilihan_majemuk' ? (answers[key] || []).includes(l) : answers[key] === l;
                            return (
                              <button key={l} onClick={() => handleAnswer(l, qType)} className={`w-full text-left p-4 rounded-lg border-2 flex items-center gap-3 transition ${isSelected ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <div className={`w-8 h-8 flex items-center justify-center font-bold rounded transition ${isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>{qType === 'pilihan_majemuk' ? (isSelected ? <CheckSquare size={18}/> : <span className="w-4 h-4 border-2 border-indigo-400 rounded-sm"></span>) : l}</div>
                                <span className="flex-1 font-medium text-gray-700"><Latex>{currentQ?.options[idx] || ''}</Latex></span>
                              </button>
                            );
                        })}
                      </div>
                  )}
              </div>
              <div className="flex items-center gap-3 mb-6"><input type="checkbox" id="doubt" checked={doubtful[key]||false} onChange={()=>setDoubtful(p=>({...p,[key]:!p[key]}))} className="w-5 h-5 cursor-pointer" /><label htmlFor="doubt" className="cursor-pointer font-medium text-gray-600">Ragu-ragu</label></div>
              <div className="flex gap-3"><button onClick={() => setCurrentQuestion(currentQuestion - 1)} disabled={currentQuestion === 0} className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold disabled:bg-gray-300">Kembali</button><button onClick={handleNextQuestion} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Selanjutnya</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UTBKStudentApp;
