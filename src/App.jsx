import React, { useState, useEffect, useRef } from 'react';
import { Clock, Ticket, AlertCircle, CheckCircle, XCircle, ShieldAlert, Timer, Trophy, Copyright, CheckSquare, AlignLeft, List, Activity, TrendingUp, BookOpen, PieChart, Target, Lightbulb, LayoutDashboard, MapPin } from 'lucide-react';
import { db } from './firebase'; 
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

// --- CONFIGURATION ---
const SUBTEST_GROUPS = {
  TPS: {
    title: "Tes Potensi Skolastik (TPS)",
    ids: ['pu', 'ppu', 'pbm', 'pk'],
    color: "#3b82f6", 
  },
  LITERASI: {
    title: "Tes Literasi & Penalaran",
    ids: ['lbi', 'lbe', 'pm'],
    color: "#f97316", 
  }
};

const SUBTESTS = [
  { id: 'pu', name: 'Penalaran Umum', questions: 30, time: 30 },
  { id: 'ppu', name: 'Pengetahuan & Pemahaman Umum', questions: 20, time: 15 },
  { id: 'pbm', name: 'Pemahaman Bacaan & Menulis', questions: 20, time: 25 },
  { id: 'pk', name: 'Pengetahuan Kuantitatif', questions: 15, time: 20 },
  { id: 'lbi', name: 'Literasi Bahasa Indonesia', questions: 30, time: 45 },
  { id: 'lbe', name: 'Literasi Bahasa Inggris', questions: 20, time: 30 },
  { id: 'pm', name: 'Penalaran Matematika', questions: 20, time: 30 },
];

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
  const [countdownTime, setCountdownTime] = useState(5); // CHANGED TO 5 SECONDS
  const [bankSoal, setBankSoal] = useState({});
  
  const [globalStartTime, setGlobalStartTime] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [violationReason, setViolationReason] = useState(null);

  const screenRef = useRef(screen); 
  const timerRef = useRef(null);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // --- SESSION RESTORE ---
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
                    const oneDay = 24 * 60 * 60 * 1000;
                    
                    if ((Date.now() - createdTime) < oneDay) {
                        setStudentName(data.studentName);
                        setCurrentTokenCode(savedToken);
                        
                        if (data.status === 'used' && data.score !== undefined) {
                            setAnswers(data.answers || {});
                            if (data.historyQuestions) setQuestionOrder(data.historyQuestions);
                            if (testOrder.length === 0) setTestOrder(SUBTESTS); 
                            setScreen('result');
                        } 
                    } else {
                        localStorage.removeItem('utbk_student_token');
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
                if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
                    window.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
                }
                const app = getApp(); 
                initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
            }
        } catch (error) { console.error("App Check init failed:", error); }
    };
    initAppCheck();
  }, []);

  // --- SECURITY (OPTIMIZED FOR MOBILE) ---
  useEffect(() => {
    const forceSubmit = (reason) => {
        // Active on test, countdown, and break screens
        if (screenRef.current === 'test' || screenRef.current === 'countdown' || screenRef.current === 'break') {
            setViolationReason(reason);
            setScreen('result');
            if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
        }
    };

    const handleVisibilityChange = () => { if (document.hidden) forceSubmit("DISKUALIFIKASI: Pindah Tab / Minimize Terdeteksi."); };
    
    const handleFullscreenChange = () => { 
        if (!document.fullscreenElement && (screenRef.current === 'test' || screenRef.current === 'countdown' || screenRef.current === 'break')) {
            forceSubmit("DISKUALIFIKASI: Keluar dari Mode Fullscreen."); 
        }
    };
    
    // NOTE: 'blur' listener REMOVED to make it less sensitive on Mobile.
    // Mobile users trigger 'blur' easily (e.g., pulling down notification bar), which shouldn't immediately disqualify them.

    const handleKeyDown = (e) => {
      if (
          e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || e.key === 'PrintScreen' || 
          (e.altKey && e.key === 'Tab') || (e.metaKey) || (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        alert('⚠️ PERINGATAN: Tombol Dilarang!');
      }
    };

    const handleContextMenu = (e) => e.preventDefault();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
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

  // --- FINISH EXAM & LEADERBOARD LOGIC ---
  useEffect(() => {
    if (screen === 'result' && currentTokenCode) {
        if (timerRef.current) clearInterval(timerRef.current);

        const finishExamProcess = async () => {
            const { totalScore } = calculateScore();
            
            const totalAllocatedMinutes = SUBTESTS.reduce((acc, curr) => acc + curr.time, 0);
            const totalAllocatedMS = totalAllocatedMinutes * 60 * 1000;
            
            // Global Time Calculation
            const usedTimeMS = globalStartTime ? (Date.now() - globalStartTime) : totalAllocatedMS;
            const globalTimeLeftSeconds = Math.max(0, Math.floor((totalAllocatedMS - usedTimeMS) / 1000));

            try {
                const tokenRef = doc(db, 'tokens', currentTokenCode);
                await updateDoc(tokenRef, { 
                    status: 'used',
                    score: totalScore,
                    finalTimeLeft: globalTimeLeftSeconds,
                    finishedAt: new Date().toISOString(),
                    violation: violationReason || null,
                    answers: answers,
                    historyQuestions: questionOrder 
                });

                const q = query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), orderBy('finalTimeLeft', 'desc'), limit(10));
                const querySnapshot = await getDocs(q);
                const top10 = [];
                let rank = 1; let userRank = null;

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    top10.push({ rank, name: data.studentName, school: data.studentSchool || '-', score: data.score, timeLeft: data.finalTimeLeft });
                    if (data.tokenCode === currentTokenCode) userRank = rank;
                    rank++;
                });
                setLeaderboard(top10);
                setMyRank(userRank);
            } catch (error) { console.error("Leaderboard Error:", error); }
        };
        
        if (globalStartTime) {
            finishExamProcess();
        } else {
             const loadLeaderboardOnly = async () => {
                 const q = query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), limit(10));
                 const snap = await getDocs(q);
                 const top10 = [];
                 let rank = 1; let userRank = null;
                 snap.forEach(d => {
                     const dt = d.data();
                     top10.push({ rank, name: dt.studentName, school: dt.studentSchool||'-', score: dt.score, timeLeft: dt.finalTimeLeft });
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
      const oneDay = 24 * 60 * 60 * 1000;
      if ((Date.now() - createdTime) > oneDay) { 
          alert('Token SUDAH KADALUARSA (Expired > 24 Jam).'); return; 
      }

      if (data.status === 'used') {
          alert(`Halo ${data.studentName}, Anda sudah menyelesaikan ujian ini.`);
          localStorage.setItem('utbk_student_token', tokenCode);
          setStudentName(data.studentName);
          setCurrentTokenCode(tokenCode);
          setAnswers(data.answers || {});
          if (data.historyQuestions) setQuestionOrder(data.historyQuestions);
          if (testOrder.length === 0) setTestOrder(SUBTESTS); 
          setScreen('result');
          return;
      }

      if (confirm(`Login sebagai ${data.studentName}?`)) {
        await updateDoc(docRef, { loginAt: new Date().toISOString() }); 
        localStorage.setItem('utbk_student_token', tokenCode);
        setStudentName(data.studentName);
        setCurrentTokenCode(tokenCode);
        setViolationReason(null);
        try { await document.documentElement.requestFullscreen(); } catch (err) {}
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
    
    setCurrentSubtestIndex(0); 
    setCurrentQuestion(0); 
    setAnswers({}); 
    setDoubtful({}); 
    
    const durationSec = shuffledSubtests[0].time * 60;
    const targetTime = Date.now() + (durationSec * 1000);
    setEndTime(targetTime);
    setTimeLeft(durationSec);
    
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
                if (currentSubtestIndex < testOrder.length - 1) { setScreen('break'); setBreakTime(10); } 
                else { setScreen('result'); }
            } else { setTimeLeft(delta); }
        }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, endTime, currentSubtestIndex, testOrder]);

  useEffect(() => { 
      if (screen === 'countdown' && countdownTime > 0) { const t = setTimeout(() => setCountdownTime(countdownTime - 1), 1000); return () => clearTimeout(t); } 
      else if (screen === 'countdown' && countdownTime === 0) { startTest(true); } 
  }, [countdownTime, screen]);

  useEffect(() => { 
      if (screen === 'break' && breakTime > 0) { const t = setTimeout(() => setBreakTime(breakTime - 1), 1000); return () => clearTimeout(t); } 
      else if (screen === 'break' && breakTime === 0) { 
          const n = currentSubtestIndex + 1; 
          setCurrentSubtestIndex(n); setCurrentQuestion(0); 
          const durationSec = testOrder[n].time * 60;
          setEndTime(Date.now() + (durationSec * 1000));
          setTimeLeft(durationSec);
          setScreen('test'); 
      } 
  }, [breakTime, screen]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentQuestion, currentSubtestIndex, screen]);
  
  const handleAnswer = (val, type) => { 
      const k = `${testOrder[currentSubtestIndex].id}_${currentQuestion}`;
      if (type === 'pilihan_majemuk') {
          let current = answers[k] || [];
          if (current.includes(val)) current = current.filter(x => x !== val);
          else current.push(val);
          setAnswers(p => ({ ...p, [k]: current }));
      } else {
          setAnswers(p => ({ ...p, [k]: val })); 
      }
  };

  const calculateScore = () => { 
      const sc = {}; 
      const cc = {}; 
      let tot = 0; 
      const orderToUse = testOrder.length > 0 ? testOrder : SUBTESTS;

      orderToUse.forEach(s => { 
          let sub = 0; 
          let correctCount = 0; 
          const questions = questionOrder[s.id] || [];

          questions.forEach((q, i) => { 
              const k = `${s.id}_${i}`; 
              const ans = answers[k];
              if (!ans || (Array.isArray(ans) && ans.length === 0) || (typeof ans === 'string' && ans.trim() === '')) {
                  sub -= 1; 
              } else {
                  let isCorrect = false;
                  if (q.type === 'pilihan_majemuk') {
                      if (Array.isArray(ans) && Array.isArray(q.correct)) {
                          const sortedAns = [...ans].sort().join(',');
                          const sortedKey = [...q.correct].sort().join(',');
                          isCorrect = (sortedAns === sortedKey);
                      }
                  } else if (q.type === 'isian') {
                      if (ans.toString().toLowerCase().trim() === q.correct.toString().toLowerCase().trim()) isCorrect = true;
                  } else { isCorrect = (ans === q.correct); }

                  if (isCorrect) {
                      correctCount++;
                      if (q.type === 'isian') sub += 6; 
                      else if (q.type === 'pilihan_majemuk') sub += 5; 
                      else sub += 3; 
                  } else { sub += 0; }
              }
          }); 
          sc[s.id] = sub; 
          cc[s.id] = correctCount;
          tot += sub; 
      }); 
      return { scores: sc, totalScore: tot, correctCounts: cc }; 
  };
  
  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
  
  const handleNextQuestion = () => {
    if (currentQuestion < currentSubtest.questions - 1) { setCurrentQuestion(currentQuestion + 1); } 
    else { if (currentSubtestIndex < testOrder.length - 1) { setScreen('break'); setBreakTime(10); } else { setScreen('result'); } }
  };

  const FooterLiezira = () => (<div className="mt-8 py-4 border-t border-gray-200 w-full text-center"><p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1"><Copyright size={12} /> {new Date().getFullYear()} Created by <span className="font-bold text-indigo-400">Liezira</span></p></div>);

  // --- ANALYSIS DASHBOARD (Responsive & Optimized for Mobile) ---
  const AnalysisDashboard = () => {
      const { scores, totalScore, correctCounts } = calculateScore();
      
      const tpsTotal = SUBTEST_GROUPS.TPS.ids.reduce((acc, id) => acc + (scores[id] || 0), 0);
      const litTotal = SUBTEST_GROUPS.LITERASI.ids.reduce((acc, id) => acc + (scores[id] || 0), 0);
      
      const grandTotal = Math.abs(tpsTotal) + Math.abs(litTotal) || 1; 
      const tpsPercent = Math.round((Math.max(0, tpsTotal) / grandTotal) * 100);
      const litPercent = 100 - tpsPercent;

      const isWeakTPS = tpsTotal < litTotal;
      const mitigationText = isWeakTPS 
          ? "Skor TPS kamu tertinggal. Ini menandakan perlunya penguatan di logika dasar, pola bilangan, dan pemahaman frasa. Fokuskan latihan pada soal-soal penalaran analitik."
          : "Logika kamu kuat, namun aspek Literasi perlu didongkrak. Tingkatkan kecepatan membaca (skimming) dan perbanyak latihan soal bacaan panjang bahasa Indonesia & Inggris.";

      let motivation = "Terus berjuang!";
      let badgeColor = "bg-gray-500";
      let prediction = "Perlu Peningkatan";

      if (totalScore > 720) {
          motivation = "LUAR BIASA! Skor ini sangat kompetitif untuk persaingan di level tertinggi.";
          badgeColor = "bg-emerald-500";
          prediction = "Sangat Kompetitif";
      } else if (totalScore > 600) {
          motivation = "KERJA BAGUS! Kamu sudah di atas rata-rata nasional. Sedikit lagi menuju Top Tier.";
          badgeColor = "bg-blue-500";
          prediction = "Kompetitif";
      } else if (totalScore > 500) {
          motivation = "PROGRES BAIK. Fokus tingkatkan di subtes terlemahmu untuk hasil maksimal.";
          badgeColor = "bg-yellow-500";
          prediction = "Cukup Baik";
      } else {
          motivation = "JANGAN MENYERAH! Analisis kelemahan di bawah dan lipatgandakan latihan.";
          badgeColor = "bg-orange-500";
          prediction = "Butuh Latihan Ekstra";
      }

      // --- LOGIC TEMPO IDEAL (SAME AS LEADERBOARD GLOBAL TIME) ---
      const totalAllocatedMinutes = SUBTESTS.reduce((acc, curr) => acc + curr.time, 0);
      const totalAllocatedSeconds = totalAllocatedMinutes * 60;
      
      const usedTimeMS = globalStartTime ? (Date.now() - globalStartTime) : (totalAllocatedSeconds * 1000);
      const remainingSeconds = Math.max(0, totalAllocatedSeconds - Math.floor(usedTimeMS / 1000));
      
      // Analyze Tempo based on Remaining Time + Score
      let tempoStatus = "Tempo Ideal";
      let tempoDesc = "Ritme pengerjaanmu sudah pas dengan standar UTBK.";
      
      if (remainingSeconds > 3600) { // Lebih dari 1 jam sisa
          if (totalScore < 300) {
              tempoStatus = "Terlalu Cepat";
              tempoDesc = "Sisa waktu banyak tapi skor rendah. Kurang teliti.";
          } else {
              tempoStatus = "Sangat Efisien";
              tempoDesc = "Cepat dan skor bagus! Pertahankan.";
          }
      } else if (remainingSeconds < 600 && remainingSeconds > 0) { // Kurang dari 10 menit
          tempoStatus = "Hampir Habis";
          tempoDesc = "Waktu mepet. Perbaiki manajemen waktu di soal sulit.";
      }

      return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500 text-left">
              
              {/* HERO CARD - Responsive Flex */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden border border-slate-700/50">
                  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] -mr-20 -mt-20 pointer-events-none"></div>
                  
                  <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-6 md:gap-8">
                      <div className="text-center lg:text-left flex-1 space-y-4">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                              <span className={`w-2 h-2 rounded-full ${badgeColor} shadow-[0_0_10px_currentColor]`}></span>
                              <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Status: {prediction}</span>
                          </div>
                          
                          <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-100">
                              {motivation}
                          </h2>
                          <p className="text-indigo-200 text-xs md:text-sm lg:text-base max-w-xl opacity-90">
                              Hasil ini adalah cerminan pemahamanmu saat ini. Gunakan data di bawah untuk strategi belajar selanjutnya.
                          </p>
                      </div>

                      <div className="relative group">
                          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full group-hover:opacity-30 transition duration-1000"></div>
                          <div className="bg-white/5 p-6 md:p-8 rounded-3xl shadow-2xl border border-white/10 backdrop-blur-xl text-center min-w-[200px] md:min-w-[240px] relative z-10">
                              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Total Skor Akhir</span>
                              <div className="text-6xl md:text-8xl font-black text-white tracking-tighter drop-shadow-2xl">
                                  {totalScore}
                              </div>
                              <div className="mt-2 text-xs text-indigo-300 font-medium bg-indigo-900/50 py-1 px-3 rounded-full inline-block">
                                  Analisis AI Terverifikasi
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT: DONUT CHART */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                      <div className="w-full flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                          <h4 className="font-bold text-slate-700 flex items-center gap-2"><PieChart size={18}/> Komposisi Kemampuan</h4>
                      </div>
                      
                      <div className="flex flex-col md:flex-row items-center gap-8 w-full justify-center">
                          <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full flex-shrink-0 flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]"
                               style={{ background: `conic-gradient(#3b82f6 0% ${tpsPercent}%, #f97316 ${tpsPercent}% 100%)` }}>
                              <div className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full flex flex-col items-center justify-center shadow-lg z-10">
                                  <span className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">DOMINASI</span>
                                  <span className={`text-lg md:text-xl font-black ${tpsPercent > litPercent ? 'text-blue-600' : 'text-orange-600'}`}>
                                      {tpsPercent > litPercent ? 'TPS' : 'LITERASI'}
                                  </span>
                              </div>
                          </div>
                          
                          <div className="space-y-4 w-full max-w-xs">
                              <div>
                                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-1"><span>TPS (Logika)</span> <span>{tpsPercent}%</span></div>
                                  <div className="w-full bg-slate-100 rounded-full h-2"><div style={{width: `${tpsPercent}%`}} className="h-full bg-blue-600 rounded-full"></div></div>
                                  <div className="text-right text-xs font-mono font-bold text-blue-600 mt-1">{tpsTotal} Poin</div>
                              </div>
                              <div>
                                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-1"><span>Literasi (Bahasa)</span> <span>{litPercent}%</span></div>
                                  <div className="w-full bg-slate-100 rounded-full h-2"><div style={{width: `${litPercent}%`}} className="h-full bg-orange-500 rounded-full"></div></div>
                                  <div className="text-right text-xs font-mono font-bold text-orange-600 mt-1">{litTotal} Poin</div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* RIGHT: RECOMMENDATION & TEMPO */}
                  <div className="flex flex-col gap-6">
                      <div className="bg-orange-50 border border-orange-200 p-6 rounded-2xl flex gap-4 items-start shadow-sm flex-1">
                          <div className="bg-orange-500 text-white p-3 rounded-xl shadow-lg shadow-orange-200 shrink-0">
                              <Lightbulb size={24}/>
                          </div>
                          <div>
                              <h4 className="font-bold text-orange-900 text-lg mb-1 flex items-center gap-2">
                                  Rekomendasi AI
                              </h4>
                              <p className="text-orange-800 text-sm leading-relaxed opacity-90">
                                  {mitigationText}
                              </p>
                          </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-3">
                              <div className="bg-slate-200 p-2 rounded-lg text-slate-600"><Activity size={20}/></div>
                              <div>
                                  <h4 className="font-bold text-slate-700 text-sm">{tempoStatus}</h4>
                                  <p className="text-xs text-slate-500 max-w-[200px]">{tempoDesc}</p>
                              </div>
                          </div>
                          <div className="text-right">
                              <span className="text-2xl font-mono font-bold text-slate-800">{formatTime(remainingSeconds)}</span>
                              <span className="text-xs text-slate-400 block">Sisa Waktu Global</span>
                          </div>
                      </div>
                  </div>
              </div>

              {/* DETAILED SUBTEST PERFORMANCE */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h4 className="font-bold text-slate-700 flex items-center gap-2"><LayoutDashboard size={18}/> Rincian Performa Subtes</h4>
                      <span className="text-xs font-medium text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">Deep Dive Analysis</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                      {SUBTESTS.map((s, idx) => {
                          const score = scores[s.id] || 0;
                          const correct = correctCounts[s.id] || 0;
                          const totalQ = s.questions;
                          const accuracy = Math.round((correct / totalQ) * 100);
                          
                          let colorClass = "bg-slate-400";
                          let textClass = "text-slate-600";
                          if(accuracy >= 75) { colorClass = "bg-emerald-500"; textClass="text-emerald-600"; }
                          else if(accuracy >= 50) { colorClass = "bg-blue-500"; textClass="text-blue-600"; }
                          else if(accuracy >= 30) { colorClass = "bg-yellow-500"; textClass="text-yellow-600"; }
                          else { colorClass = "bg-red-500"; textClass="text-red-600"; }

                          return (
                              <div key={s.id} className="p-5 hover:bg-slate-50 transition group">
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                      <div className="flex items-center gap-4">
                                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-md ${colorClass}`}>
                                              {accuracy}%
                                          </div>
                                          <div>
                                              <h5 className="font-bold text-slate-800 text-sm md:text-base">{s.name}</h5>
                                              <div className="flex items-center gap-3 mt-1">
                                                  <span className="text-xs font-medium text-slate-500">
                                                      Benar: <strong className={textClass}>{correct}</strong> / {totalQ} Soal
                                                  </span>
                                                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                  <span className="text-xs text-slate-400">
                                                      Akurasi Jawaban
                                                  </span>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="flex items-center gap-6 w-full md:w-auto">
                                          <div className="flex-1 md:w-48">
                                              <div className="flex justify-between text-xs mb-1.5 font-bold text-slate-400">
                                                  <span>Progress Nilai</span>
                                              </div>
                                              <div className="w-full bg-slate-100 rounded-full h-2">
                                                  <div 
                                                      className={`h-full rounded-full transition-all duration-1000 ${colorClass}`} 
                                                      style={{ width: `${Math.min(100, Math.abs(score/3))}%` }}
                                                  ></div>
                                              </div>
                                          </div>
                                          <div className="text-right min-w-[60px]">
                                              <span className="block text-[10px] uppercase font-bold text-slate-400">Skor</span>
                                              <span className="text-xl font-black text-slate-800">{score}</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          )
                      })}
                  </div>
              </div>

          </div>
      );
  };

  if (screen === 'countdown') {
    return (
      <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white select-none">
        <div className="mb-8 animate-pulse"><Timer size={64} /></div>
        <h2 className="text-2xl font-bold mb-4 uppercase tracking-widest">Persiapan Ujian</h2>
        <div className="text-[120px] font-bold leading-none mb-4 text-yellow-400 font-mono">{countdownTime}</div>
        <p className="text-indigo-200 text-sm max-w-md text-center px-4">Pastikan posisi nyaman. Dilarang keluar fullscreen.</p>
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
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-left text-xs text-red-800">
            <div className="font-bold flex items-center gap-2 mb-2 text-red-900"><ShieldAlert size={16}/> STRICT MODE:</div>
            <ul className="list-disc pl-4 space-y-1 font-semibold"><li>DILARANG PINDAH TAB.</li><li>DILARANG KELUAR FULLSCREEN.</li><li>Pelanggaran = <span className="underline">AUTO SUBMIT</span>.</li></ul>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl mb-6">
            <label className="block text-indigo-900 font-bold mb-2 text-sm flex items-center justify-center gap-2"><Ticket size={18}/> Kode Token:</label>
            <input type="text" value={inputToken} onChange={e => setInputToken(e.target.value.toUpperCase())} className="w-full px-4 py-3 border-2 border-indigo-200 rounded-lg text-xl font-mono text-center tracking-widest uppercase outline-none focus:ring-4 focus:ring-indigo-100 bg-white" placeholder="UTBK-XXXXXX" />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 text-left shadow-sm">
            <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2"><AlertCircle size={16} className="text-indigo-600"/> Poin Penilaian:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex justify-between bg-green-50 px-2 py-1 rounded border border-green-100"><span className="flex gap-2 items-center"><CheckCircle size={16} className="text-green-600"/>Isian Benar</span><span className="font-bold text-green-700">+6</span></li>
              <li className="flex justify-between bg-green-50 px-2 py-1 rounded border border-green-100"><span className="flex gap-2 items-center"><CheckCircle size={16} className="text-green-600"/>Pilihan Majemuk</span><span className="font-bold text-green-700">+5</span></li>
              <li className="flex justify-between bg-green-50 px-2 py-1 rounded border border-green-100"><span className="flex gap-2 items-center"><CheckCircle size={16} className="text-green-600"/>Pilihan Ganda</span><span className="font-bold text-green-700">+3</span></li>
              <li className="flex justify-between bg-red-50 px-2 py-1 rounded border border-red-100"><span className="flex gap-2 items-center"><XCircle size={16} className="text-red-500"/>Salah</span><span className="font-bold text-red-700">0</span></li>
              <li className="flex justify-between bg-orange-50 px-2 py-1 rounded border border-orange-100"><span className="flex gap-2 items-center"><AlertCircle size={16} className="text-orange-500"/>Kosong</span><span className="font-bold text-orange-700">-1</span></li>
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
      <div className="min-h-screen bg-gray-50 p-8 flex justify-center items-center select-none overflow-y-auto">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-4xl w-full text-center my-8">
          <h1 className="text-3xl font-bold mb-2 text-indigo-900 hidden">Hasil Ujian</h1>
          <h2 className="text-xl text-gray-600 mb-4 font-medium">{studentName}</h2>
          {violationReason && (
            <div className="bg-red-100 border-2 border-red-400 text-red-800 p-4 rounded-lg mb-6 font-bold animate-pulse">
               <div className="flex items-center justify-center gap-2 text-lg"><ShieldAlert size={24} /> UJIAN DIHENTIKAN OTOMATIS</div>
               <p className="text-sm font-normal mt-1">Alasan: {violationReason}</p>
            </div>
          )}
          
          <AnalysisDashboard />

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-4"><Trophy className="text-yellow-600" size={24} /><h3 className="text-lg font-bold text-indigo-900">🏆 Top 10 Leaderboard</h3></div>
            {leaderboard.length === 0 ? (<p className="text-gray-500 text-center italic py-4">Memuat peringkat...</p>) : (
                <div className="overflow-x-auto rounded-lg border border-indigo-100 shadow-sm"><table className="min-w-full bg-white text-sm"><thead className="bg-indigo-100 text-indigo-700 whitespace-nowrap"><tr><th className="py-3 px-4 text-left">#</th><th className="py-3 px-4 text-left">Nama Siswa</th><th className="py-3 px-4 text-left">Asal Sekolah</th><th className="py-3 px-4 text-center">Skor</th><th className="py-3 px-4 text-center">Sisa Waktu Global</th></tr></thead><tbody className="divide-y divide-indigo-50 whitespace-nowrap">{leaderboard.map((item, index) => (<tr key={index} className={`${item.name === studentName ? 'bg-yellow-50 font-bold border-l-4 border-yellow-400' : 'hover:bg-gray-50'}`}><td className="py-2 px-4">{item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank}</td><td className="py-2 px-4">{item.name} {item.name === studentName && '(Kamu)'}</td><td className="py-2 px-4 text-gray-600">{item.school}</td><td className="py-2 px-4 text-center text-indigo-600">{item.score}</td><td className="py-2 px-4 text-center text-gray-500 font-mono">{formatTime(item.timeLeft)}</td></tr>))}</tbody></table></div>
            )}
            <div className="mt-4 text-center">{myRank ? (<div className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full font-bold text-sm border border-green-200">🎉 Hebat! Kamu peringkat {myRank} dari seluruh peserta.</div>) : (<div className="inline-block bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm border border-gray-200">Kamu belum masuk Top 10. Tetap semangat!</div>)}</div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <button onClick={() => { document.exitFullscreen().catch(()=>{}); localStorage.removeItem('utbk_student_token'); setScreen('landing'); setInputToken(''); setStudentName(''); }} className="w-full bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-xl font-bold hover:bg-red-100 transition">Selesai / Logout</button>
            <FooterLiezira />
          </div>
        </div>
      </div>
    );
  }

  const currentSubtest = testOrder[currentSubtestIndex];
  if (!currentSubtest || !questionOrder[currentSubtest.id]) return <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div><p>Memuat soal...</p></div>;
  const currentQ = questionOrder[currentSubtest.id][currentQuestion];
  const key = `${currentSubtest.id}_${currentQuestion}`;
  const qType = currentQ.type || 'pilihan_ganda'; 

  return (
    <div className="min-h-screen w-full bg-gray-50 select-none pb-10">
      <div className="sticky top-0 z-40 bg-indigo-700 text-white p-4 shadow-lg"><div className="max-w-6xl mx-auto flex justify-between items-center"><div><h2 className="text-xl font-bold">{currentSubtest.name}</h2><p className="text-sm text-indigo-200">Soal {currentQuestion + 1} / {currentSubtest.questions}</p></div><div className="flex items-center gap-3 bg-indigo-800 px-6 py-3 rounded-lg"><Clock size={24} /><span className="text-2xl font-bold">{formatTime(timeLeft)}</span></div></div></div>
      <div className="max-w-6xl mx-auto p-6"><div className="grid grid-cols-1 lg:grid-cols-4 gap-6"><div className="lg:col-span-1"><div className="bg-white rounded-lg shadow p-4 sticky top-24"><h3 className="font-semibold text-gray-700 mb-3">Navigasi</h3><div className="grid grid-cols-5 gap-2">{Array.from({ length: currentSubtest.questions }).map((_, idx) => { const qKey = `${currentSubtest.id}_${idx}`; const isAnswered = answers[qKey] && (Array.isArray(answers[qKey]) ? answers[qKey].length > 0 : true); return (<button key={idx} onClick={() => setCurrentQuestion(idx)} className={`w-10 h-10 rounded font-semibold ${idx === currentQuestion ? 'bg-indigo-600 text-white' : isAnswered ? (doubtful[qKey]?'bg-yellow-400 text-white':'bg-green-500 text-white') : 'bg-gray-200'}`}>{idx + 1}</button>); })}</div></div></div>
      
      <div className="lg:col-span-3">
        <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
          
          <div className="mb-8">
            <div className="mb-2"><span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex w-fit items-center gap-1">{qType === 'pilihan_majemuk' ? <CheckSquare size={12}/> : qType === 'isian' ? <AlignLeft size={12}/> : <List size={12}/>} {qType.replace('_', ' ')}</span></div>
            <div className="text-lg text-gray-800 leading-loose whitespace-pre-wrap font-medium mb-6 text-left text-justify"><Latex>{currentQ?.question}</Latex></div>
            {currentQ?.image && (<div className="flex justify-center my-6"><img src={currentQ.image} alt="Soal Visual" className="w-full h-auto my-6 select-none object-contain" onContextMenu={e=>e.preventDefault()} /></div>)}
          </div>

          <div className="mb-8">
              {qType === 'isian' ? (
                  <div className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300">
                      <label className="block text-sm font-bold text-gray-600 mb-2">Jawaban Singkat (Angka/Kata):</label>
                      <input type="text" value={answers[key] || ''} onChange={(e) => handleAnswer(e.target.value, 'isian')} className="w-full p-4 text-xl font-mono border-2 border-indigo-200 rounded-lg focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition" placeholder="Ketik jawaban kamu di sini..." />
                  </div>
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
      </div></div>
    </div>
  );
};

export default UTBKStudentApp;