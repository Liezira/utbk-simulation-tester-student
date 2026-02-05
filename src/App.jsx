import React, { useState, useEffect, useRef } from 'react';
import { Clock, Ticket, AlertCircle, CheckCircle, XCircle, ShieldAlert, Timer, Trophy, Copyright, CheckSquare, AlignLeft, List, Activity, TrendingUp, BookOpen, PieChart, Target, Lightbulb, LayoutDashboard, MapPin, AlertOctagon, AlertTriangle, Shield, Eye, Camera, Smartphone } from 'lucide-react';
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
  { id: 'pk', name: 'Pengetahuan Kuantitatif', questions: 20, time: 20 },
  { id: 'lbi', name: 'Literasi Bahasa Indonesia', questions: 30, time: 45 },
  { id: 'lbe', name: 'Literasi Bahasa Inggris', questions: 20, time: 30 },
  { id: 'pm', name: 'Penalaran Matematika', questions: 20, time: 30 },
];

// --- SECURITY CONFIGURATION ---
const SECURITY_CONFIG = {
  MAX_VIOLATIONS: 2, // SP1 -> SP2 (Auto Submit)
  PASTE_BLOCKED: true, 
  COPY_BLOCKED: true, 
  DEVTOOLS_BLOCKED: true, 
  RIGHT_CLICK_BLOCKED: true, 
};

// --- IRT HELPER FUNCTIONS ---
const getQuestionDifficulty = (question, index) => {
    if (question.difficulty) {
        if (question.difficulty === 'hard') return 3;
        if (question.difficulty === 'medium') return 2;
        return 1;
    }
    // Logic fallback
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

// --- ADVANCED SECURITY MONITOR (FIXED LOGIC) ---
const AdvancedSecurityMonitor = ({ 
  isActive, 
  tokenCode, 
  onForceSubmit,
  onWarning 
}) => {
  const [totalViolations, setTotalViolations] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const screenshotCheckRef = useRef(null);
  const devtoolsCheckRef = useRef(null);

  // --- LOGIC PELANGGARAN ---
  const handleViolation = async (type, message) => {
    setTotalViolations(prev => {
      const newCount = prev + 1;

      // Log ke Firebase (Background)
      logViolationToFirebase(type, message, newCount);

      // --- LOGIC SP1 vs SP2 ---
      if (newCount === 1) {
        // Pelanggaran Pertama -> SP1 (Warning)
        onWarning(type, message);
      } 
      else if (newCount >= SECURITY_CONFIG.MAX_VIOLATIONS) {
        // Pelanggaran Kedua -> SP2 (Auto Submit)
        onForceSubmit(`DISKUALIFIKASI: Melanggar aturan keamanan (SP 2).`);
      }

      return newCount;
    });
  };

  const logViolationToFirebase = async (type, message, totalCount) => {
    try {
      const docRef = doc(db, 'tokens', tokenCode);
      updateDoc(docRef, {
        violationCount: totalCount,
        lastViolation: { type, message, timestamp: new Date().toISOString() }
      }).catch(err => console.error("Log error", err));
    } catch (error) { console.error('Failed to log violation:', error); }
  };

  // --- 1. CSS INJECTION (Mencegah Seleksi Teks) ---
  useEffect(() => {
    if (!isActive) return;
    const style = document.createElement('style');
    style.innerHTML = `
      body {
        -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
      }
      @media print { html, body { display: none !important; } }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [isActive]);

  // --- 2. DETEKSI SCREENSHOT & LAYAR ---
  useEffect(() => {
    if (!isActive) return;
    const detectScreenAnomalies = () => {
      const currentTime = Date.now();
      const timeSinceLastActivity = currentTime - lastActivityRef.current;
      // Indikasi Screenshot: Layar freeze/blur sangat cepat (<100ms)
      if (document.hidden && timeSinceLastActivity < 100) {
        handleViolation('screenshot', '⚠️ Terdeteksi kedipan layar (Indikasi Screenshot)');
      }
    };
    screenshotCheckRef.current = setInterval(detectScreenAnomalies, 1000);
    return () => clearInterval(screenshotCheckRef.current);
  }, [isActive]);

  // --- 3. DETEKSI DEVTOOLS ---
  useEffect(() => {
    if (!isActive || !SECURITY_CONFIG.DEVTOOLS_BLOCKED) return;
    const detectDevTools = () => {
      const threshold = 160; 
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      if (widthThreshold || heightThreshold) {
        handleViolation('devtools', '🚫 DevTools terdeteksi terbuka!');
      }
    };
    devtoolsCheckRef.current = setInterval(detectDevTools, 1500);
    return () => clearInterval(devtoolsCheckRef.current);
  }, [isActive]);

  // --- 4. EVENT LISTENER GLOBAL ---
  useEffect(() => {
    if (!isActive) return;

    const handleBlur = () => handleViolation('blur', '⚠️ Dilarang pindah aplikasi/split screen!');
    const handleVisibilityChange = () => {
      if (document.hidden) handleViolation('visibility', '⚠️ Terdeteksi pindah tab!');
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) handleViolation('fullscreen', '🚫 Dilarang keluar fullscreen!');
    };
    const handleCopy = (e) => {
      e.preventDefault();
      if (navigator.clipboard) navigator.clipboard.writeText("CHEAT DETECTED");
      handleViolation('copy', '🚫 Copy diblokir!');
    };
    const handlePaste = (e) => { e.preventDefault(); handleViolation('paste', '🚫 Paste diblokir!'); };
    
    // Hard Block Right Click
    const handleContextMenu = (e) => { e.preventDefault(); handleViolation('rightClick', '🚫 Klik kanan diblokir!'); };
    const handleDragStart = (e) => { e.preventDefault(); return false; };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('dragstart', handleDragStart);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, [isActive]);

  // --- 5. KEYBOARD SECURITY ---
  useEffect(() => {
    if (!isActive) return;
    
    const nukeClipboard = () => { try { if (navigator.clipboard) navigator.clipboard.writeText(" "); } catch (e) {} };

    const handleKeyDown = (e) => {
      // PrintScreen
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault(); nukeClipboard();
        handleViolation('screenshot', '🚫 Screenshot dilarang!');
        return false;
      }
      // Windows Key / Meta
      if (e.key === 'Meta' || e.key === 'OS' || e.keyCode === 91 || e.keyCode === 92) {
        e.preventDefault();
        handleViolation('systemKey', '🚫 Tombol Sistem dilarang!');
        return false;
      }
      // Shortcuts Forbidden
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'S'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && ['U', 'S', 'P'].includes(e.key.toUpperCase())) ||
        (e.altKey && e.key === 'Tab')
      ) {
        e.preventDefault();
        handleViolation('devtools', '🚫 Shortcut dilarang!');
        return false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return null;
};

// --- SP1 MODAL COMPONENT ---
const SP1Modal = ({ data, onClose }) => (
  <div className="fixed inset-0 z-[9999] bg-red-900/95 flex items-center justify-center p-4 animate-in zoom-in duration-300 backdrop-blur-sm" onContextMenu={(e) => e.preventDefault()}>
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-4 border-red-600">
      <div className="bg-red-600 p-6 text-center">
        <ShieldAlert size={64} className="text-white mx-auto mb-2 animate-bounce" />
        <h2 className="text-3xl font-black text-white uppercase tracking-wider">PERINGATAN!</h2>
        <div className="inline-block bg-red-800 text-red-100 px-3 py-1 rounded-full text-xs font-bold mt-2 border border-red-400">
          SURAT PERINGATAN 1 (SP1)
        </div>
      </div>
      <div className="p-8 text-center space-y-4">
        <div>
          <p className="text-gray-500 text-xs font-bold uppercase mb-1">Pelanggaran Terdeteksi:</p>
          <p className="text-xl font-bold text-red-600 bg-red-50 py-3 rounded-lg border border-red-100">
            "{data?.message || 'Aktivitas Mencurigakan'}"
          </p>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">
          Ini adalah <b>PERINGATAN TERAKHIR</b>. Sistem Anti-Cheat mendeteksi aktivitas yang tidak diizinkan.
        </p>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 text-left text-xs text-yellow-800">
          <b>⚠️ Konsekuensi Selanjutnya:</b><br/>
          Satu pelanggaran lagi = <b>DISKUALIFIKASI (Auto Submit)</b>.
        </div>
      </div>
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <button 
          onClick={onClose}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl transition shadow-lg transform hover:-translate-y-1 active:scale-95"
        >
          SAYA MENGERTI & LANJUTKAN
        </button>
      </div>
    </div>
  </div>
);

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
  
  // Security States
  const [violationReason, setViolationReason] = useState(null);
  const [securityActive, setSecurityActive] = useState(false);
  const [sp1Data, setSp1Data] = useState(null); // Data untuk Modal SP1

  // --- NEW: LANDSCAPE LOCK STATE ---
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);

  const timerRef = useRef(null);

  // --- 1. ORIENTATION CHECK (BLOKIR LANDSCAPE DI HP) ---
  useEffect(() => {
    const checkOrientation = () => {
      // Definisi HP: Lebar layar < 1024px (Tablet Portrait/HP)
      // Cek Landscape: Lebar > Tinggi
      const isMobileSize = window.innerWidth < 1024; 
      const isLandscape = window.innerWidth > window.innerHeight;

      // Blokir jika HP & Landscape
      if (isMobileSize && isLandscape) {
        setIsLandscapeMobile(true);
        if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
      } else {
        setIsLandscapeMobile(false);
      }
    };

    window.addEventListener('resize', checkOrientation);
    checkOrientation(); // Cek awal saat load
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // --- 2. FORCE FULLSCREEN HELPER ---
  const forceFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen failed/rejected:', err);
    }
  };

  // --- 3. SECURITY HANDLERS (FIXED DOUBLE SP1) ---
  const handleSecurityWarning = (type, message) => {
    // FIX: Cegah modal muncul dua kali atau menumpuk
    if (sp1Data || violationReason) return; 
    setSp1Data({ type, message });
    if (document.activeElement) document.activeElement.blur();
  };

  const forceSubmitExam = (reason) => {
    setViolationReason(reason);
    setSecurityActive(false); 
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setScreen('result'); 
  };

  const closeSP1 = () => {
    setSp1Data(null);
    forceFullscreen(); 
  };

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
                    const now = Date.now();
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

  // --- IRT CALCULATION ---
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

            if (isCorrect) {
                correctCount++;
                rawScore += itemValue;
            }
        }); 

        const ratio = maxRaw > 0 ? (rawScore / maxRaw) : 0;
        const irtScore = Math.round(200 + (ratio * 800)); 
        
        totalIrtScore += irtScore;
        correctCounts[id] = correctCount;

        details[id] = {
            b: correctCount,
            skor: irtScore
        };
    }); 

    const finalAverageScore = Math.round(totalIrtScore / mapelOrder.length);

    const scoresForDashboard = {};
    mapelOrder.forEach(id => {
        scoresForDashboard[id] = details[id].skor;
    });

    return { 
        totalScore: finalAverageScore, 
        details: details,
        scores: scoresForDashboard,
        correctCounts: correctCounts
    }; 
  };

  // --- ANALYSIS DASHBOARD (Responsive Fix) ---
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
      const mitigationText = isWeakTPS 
          ? "Rata-rata TPS lebih rendah. Fokus perbaiki logika dasar & kuantitatif."
          : "Logika kuat, tapi Literasi perlu ditingkatkan. Latihan membaca cepat.";

      let motivation = "Terus berjuang!";
      let badgeColor = "bg-gray-500";
      let prediction = "Perlu Peningkatan";

      if (totalScore >= 700) { motivation = "LUAR BIASA!"; badgeColor = "bg-emerald-500"; prediction = "Sangat Kompetitif"; } 
      else if (totalScore >= 600) { motivation = "KERJA BAGUS!"; badgeColor = "bg-blue-500"; prediction = "Kompetitif"; } 
      else if (totalScore >= 500) { motivation = "RATA-RATA."; badgeColor = "bg-yellow-500"; prediction = "Cukup Baik"; } 
      else { motivation = "JANGAN MENYERAH!"; badgeColor = "bg-orange-500"; prediction = "Butuh Latihan"; }

      return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500 text-left">
              {/* Header Card */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                      <div className="text-center md:text-left flex-1 space-y-2">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md">
                              <span className={`w-2 h-2 rounded-full ${badgeColor} shadow-[0_0_10px_currentColor]`}></span>
                              <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">{prediction}</span>
                          </div>
                          <h2 className="text-3xl font-extrabold text-white">{motivation}</h2>
                          <p className="text-indigo-200 text-sm opacity-90">Hasil simulasi berbasis IRT.</p>
                      </div>
                      <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm text-center min-w-[120px]">
                          <span className="text-xs font-bold uppercase text-slate-300 block mb-1">Skor Total</span>
                          <div className="text-5xl font-black text-white">{totalScore}</div>
                      </div>
                  </div>
              </div>

              {/* Charts & Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Chart Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2"><PieChart size={16}/> Dominasi Nilai</h4>
                      <div className="flex items-center gap-6">
                          {/* Simple Pie Visual */}
                          <div className="relative w-24 h-24 rounded-full flex items-center justify-center shrink-0"
                               style={{ background: `conic-gradient(#3b82f6 0% ${tpsPercent}%, #f97316 ${tpsPercent}% 100%)` }}>
                              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm z-10">
                                  <span className={`text-xs font-black ${tpsPercent > litPercent ? 'text-blue-600' : 'text-orange-600'}`}>
                                      {tpsPercent > litPercent ? 'TPS' : 'LIT'}
                                  </span>
                              </div>
                          </div>
                          <div className="space-y-2 flex-1 text-xs">
                              <div>
                                  <div className="flex justify-between font-bold text-slate-500 mb-1"><span>TPS</span> <span>{tpsPercent}%</span></div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5"><div style={{width: `${tpsPercent}%`}} className="h-full bg-blue-600 rounded-full"></div></div>
                              </div>
                              <div>
                                  <div className="flex justify-between font-bold text-slate-500 mb-1"><span>Literasi</span> <span>{litPercent}%</span></div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5"><div style={{width: `${litPercent}%`}} className="h-full bg-orange-500 rounded-full"></div></div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* AI Recommendation */}
                  <div className="bg-orange-50 border border-orange-200 p-5 rounded-2xl flex gap-3 items-start shadow-sm">
                      <div className="bg-orange-500 text-white p-2 rounded-lg shrink-0"><Lightbulb size={20}/></div>
                      <div>
                          <h4 className="font-bold text-orange-900 text-sm mb-1">Analisis AI</h4>
                          <p className="text-orange-800 text-xs leading-relaxed opacity-90">{mitigationText}</p>
                      </div>
                  </div>
              </div>

              {/* Detail Subtes */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                      <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><LayoutDashboard size={16}/> Rincian Subtes</h4>
                  </div>
                  <div className="divide-y divide-slate-100 text-sm">
                      {SUBTESTS.map((s) => {
                          const score = scores[s.id] || 0;
                          const correct = correctCounts[s.id] || 0;
                          const accuracy = Math.round((correct / s.questions) * 100);
                          let colorClass = accuracy >= 50 ? "bg-blue-500" : "bg-red-500";
                          
                          return (
                              <div key={s.id} className="p-4 hover:bg-slate-50 transition flex justify-between items-center">
                                  <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white ${colorClass}`}>{accuracy}%</div>
                                      <div>
                                          <h5 className="font-bold text-slate-800 text-xs md:text-sm">{s.name}</h5>
                                          <span className="text-[10px] text-slate-500">Benar: <strong>{correct}</strong>/{s.questions}</span>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <span className="block text-[10px] uppercase font-bold text-slate-400">Skor</span>
                                      <span className="text-base font-black text-slate-800">{score}</span>
                                  </div>
                              </div>
                          )
                      })}
                  </div>
              </div>
          </div>
      );
  };

  // --- FINISH EXAM ---
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
                const tokenRef = doc(db, 'tokens', currentTokenCode);
                await updateDoc(tokenRef, { 
                    status: 'used',
                    score: totalScore,
                    scoreDetails: details,
                    finalTimeLeft: globalTimeLeftSeconds,
                    finishedAt: new Date().toISOString(),
                    violation: violationReason || null,
                    answers: answers,
                    historyQuestions: questionOrder 
                });
                localStorage.removeItem(`answers_${currentTokenCode}`);
                
                // Fetch Leaderboard
                const q = query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), limit(10));
                const querySnapshot = await getDocs(q);
                const top10 = [];
                let rank = 1; let userRank = null;
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    top10.push({ rank, name: data.studentName, school: data.studentSchool||'-', score: data.score, details: data.scoreDetails||{} });
                    if (data.tokenCode === currentTokenCode) userRank = rank;
                    rank++;
                });
                setLeaderboard(top10);
                setMyRank(userRank);
            } catch (error) { console.error("Save Error:", error); }
        };
        
        if (globalStartTime) {
            finishExamProcess();
        } else {
             // Load leaderboard only (Re-login)
             const loadLeaderboardOnly = async () => {
                 const q = query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), limit(10));
                 const snap = await getDocs(q);
                 const top10 = [];
                 let rank = 1; let userRank = null;
                 snap.forEach(d => {
                     const dt = d.data();
                     top10.push({ rank, name: dt.studentName, school: dt.studentSchool||'-', score: dt.score, details: dt.scoreDetails||{} });
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

  // --- TOKEN LOGIN (FIXED SECURITY) ---
  const handleTokenLogin = async () => {
    if (!inputToken.trim()) { alert('Masukkan Kode Token!'); return; }
    const tokenCode = inputToken.trim().toUpperCase().replace(/\s/g, ''); 
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
          if ((now - createdTime) > sixtyDays) { alert(`Token kadaluarsa.`); return; }
          localStorage.setItem('utbk_student_token', tokenCode);
          setStudentName(data.studentName);
          setCurrentTokenCode(tokenCode);
          setAnswers(data.answers || {});
          if (data.historyQuestions) setQuestionOrder(data.historyQuestions);
          if (testOrder.length === 0) setTestOrder(SUBTESTS); 
          setScreen('result');
          return;
      }

      if ((now - createdTime) > oneDay) { alert('Token Expired (>24 Jam).'); return; }

      if (confirm(`Login sebagai ${data.studentName}?`)) {
        await updateDoc(docRef, { loginAt: new Date().toISOString() }); 
        localStorage.setItem('utbk_student_token', tokenCode);
        setStudentName(data.studentName);
        setCurrentTokenCode(tokenCode);
        setViolationReason(null);
        setSp1Data(null); 
        
        // FIX: Aktifkan Security SEBELUM countdown
        setSecurityActive(true); 
        
        await forceFullscreen();
        setCountdownTime(5); 
        setScreen('countdown'); 
      }
    } catch (error) { alert(`Error: ${error.message}`); }
  };

  // --- START TEST ---
  const startTest = (bypass = false) => {
    if (!bypass) return;
    if (!globalStartTime) setGlobalStartTime(Date.now()); 

    for (const s of SUBTESTS) { 
      if ((bankSoal[s.id]?.length || 0) < s.questions) { alert(`Soal ${s.name} belum siap.`); return; } 
    }
    
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
    const saved = localStorage.getItem(`answers_${currentTokenCode}`);
    if(saved) setAnswers(JSON.parse(saved));
    else setAnswers({}); 
    setDoubtful({}); 
    
    const durationSec = shuffledSubtests[0].time * 60;
    const targetTime = Date.now() + (durationSec * 1000);
    setEndTime(targetTime);
    setTimeLeft(durationSec);
    
    // PASTIKAN SECURITY AKTIF
    setSecurityActive(true);
    
    setScreen('test');
  };

  // --- TIMER LOGIC (FIXED SECURITY ON BREAK) ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (screen === 'test' && endTime) {
        timerRef.current = setInterval(() => {
            const now = Date.now();
            const delta = Math.floor((endTime - now) / 1000); 
            if (delta <= 0) {
                clearInterval(timerRef.current);
                setTimeLeft(0);
                // Pindah subtes atau selesai
                if (currentSubtestIndex < testOrder.length - 1) { 
                  // FIX: JANGAN matikan security saat break
                  // setSecurityActive(false); <--- DIHAPUS
                  setScreen('break'); 
                  setBreakTime(10); 
                } 
                else { 
                  setSecurityActive(false); // Matikan hanya saat Result
                  setScreen('result'); 
                }
            } else { setTimeLeft(delta); }
        }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, endTime, currentSubtestIndex, testOrder]);

  // Countdown & Break Logic
  useEffect(() => { 
      if (screen === 'countdown' && countdownTime > 0) { 
        const t = setTimeout(() => setCountdownTime(countdownTime - 1), 1000); 
        return () => clearTimeout(t); 
      } 
      else if (screen === 'countdown' && countdownTime === 0) { 
        startTest(true); 
      } 
  }, [countdownTime, screen]);

  useEffect(() => { 
      if (screen === 'break' && breakTime > 0) { 
        const t = setTimeout(() => setBreakTime(breakTime - 1), 1000); 
        return () => clearTimeout(t); 
      } 
      else if (screen === 'break' && breakTime === 0) { 
          const n = currentSubtestIndex + 1; 
          setCurrentSubtestIndex(n); 
          setCurrentQuestion(0); 
          const durationSec = testOrder[n].time * 60; 
          setEndTime(Date.now() + (durationSec * 1000));
          setTimeLeft(durationSec);
          // Security tetap aktif dari sebelumnya
          setScreen('test'); 
      } 
  }, [breakTime, screen]);

  useEffect(() => { 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  }, [currentQuestion, currentSubtestIndex, screen]);
  
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
  
  const handleNextQuestion = () => {
    if (currentQuestion < currentSubtest.questions - 1) { 
      setCurrentQuestion(currentQuestion + 1); 
    } 
    else { 
      if (currentSubtestIndex < testOrder.length - 1) { 
        // FIX: Security tetap aktif saat pindah subtes
        setScreen('break'); 
        setBreakTime(10); 
      } else { 
        setSecurityActive(false);
        setScreen('result'); 
      } 
    }
  };

  const FooterLiezira = () => (
    <div className="mt-8 py-4 border-t border-gray-200 w-full text-center">
      <p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1">
        <Copyright size={12} /> {new Date().getFullYear()} Created by <span className="font-bold text-indigo-400">RuangSimulasi</span>
      </p>
    </div>
  );

  // --- SCREENS RENDER ---

  // 0. SCREEN: LANDSCAPE WARNING (HP Only)
  if (isLandscapeMobile) {
    return (
      <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center text-white p-6 text-center select-none">
        <div className="animate-bounce mb-4 text-4xl">📱 ➔ 📲</div>
        <h2 className="text-xl font-bold mb-2 uppercase tracking-widest text-red-500">Orientasi Terkunci</h2>
        <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
          Mode Landscape dimatikan untuk Smartphone.<br/>
          Silakan putar kembali perangkat Anda ke posisi <b>Portrait (Tegak)</b> untuk melanjutkan ujian.
        </p>
      </div>
    );
  }

  // 1. SCREEN: COUNTDOWN
  if (screen === 'countdown') {
    return (
      <div 
        className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white select-none"
        onContextMenu={(e) => e.preventDefault()} // MATIKAN KLIK KANAN
      >
        <div className="mb-8 animate-pulse"><Timer size={64} /></div>
        <h2 className="text-2xl font-bold mb-4 uppercase tracking-widest">Persiapan Ujian</h2>
        <div className="text-[120px] font-bold leading-none mb-4 text-yellow-400 font-mono">{countdownTime}</div>
        <p className="text-indigo-200 text-sm max-w-md text-center px-4">Pastikan posisi nyaman. Dilarang keluar fullscreen.</p>
        
        {/* MODAL SECURITY CHECK */}
        <AdvancedSecurityMonitor 
          isActive={securityActive && !sp1Data} // Monitor aktif saat countdown!
          tokenCode={currentTokenCode}
          onForceSubmit={forceSubmitExam} 
          onWarning={handleSecurityWarning} 
        />
        {sp1Data && <SP1Modal data={sp1Data} onClose={closeSP1} />}

        <div className="mt-8 bg-red-900/50 border-2 border-red-400 rounded-xl p-4 max-w-md mx-4">
          <p className="text-red-200 text-xs font-bold flex items-center gap-2 mb-2">
            <Shield size={16}/> SISTEM KEAMANAN AKTIF
          </p>
          <ul className="text-red-100 text-xs space-y-1 text-left">
            <li>• Pelanggaran 1: Surat Peringatan 1 (SP1)</li>
            <li>• Pelanggaran 2: <b>DISKUALIFIKASI</b> (Auto Submit)</li>
            <li>• Klik Kanan, Screenshot, Split Screen DIBLOKIR</li>
          </ul>
        </div>
      </div>
    );
  }

  // 2. SCREEN: LANDING
  if (screen === 'landing') {
    return (
      <div 
        className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 overflow-y-auto"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full relative text-center my-8">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          <h1 className="text-2xl font-bold text-indigo-900 mb-1">Sistem Simulasi Test UTBK SNBT</h1>
          <p className="text-gray-500 mb-6 text-sm">Platform Ujian Berbasis Token Online</p>
          
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4 text-left text-xs text-red-800">
            <div className="font-bold flex items-center gap-2 mb-2 text-red-900">
              <ShieldAlert size={18}/> STRICT MODE ANTI-CHEAT:
            </div>
            <ul className="list-disc pl-4 space-y-1 font-semibold">
              <li>✓ Real-time Screenshot Detection</li>
              <li>✓ DevTools Auto-Block</li>
              <li>✓ Split Screen & Tab Switch Monitor</li>
              <li>✓ Copy/Paste & Right Click Disabled</li>
              <li className="text-red-600 font-black">⚠️ 2x VIOLATION = DISKUALIFIKASI</li>
            </ul>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl mb-6">
            <label className="block text-indigo-900 font-bold mb-2 text-sm flex items-center justify-center gap-2">
              <Ticket size={18}/> Kode Token:
            </label>
            <input 
              type="text" 
              value={inputToken} 
              onChange={e => setInputToken(e.target.value.toUpperCase())} 
              className="w-full px-4 py-3 border-2 border-indigo-200 rounded-lg text-xl font-mono text-center tracking-widest uppercase outline-none focus:ring-4 focus:ring-indigo-100 bg-white" 
              placeholder="UTBK-XXXXXX" 
            />
          </div>
          
          <button 
            onClick={handleTokenLogin} 
            className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-indigo-700 transition shadow-lg transform hover:-translate-y-1"
          >
            Mulai Ujian Sekarang
          </button>
          <FooterLiezira />
        </div>
      </div>
    );
  }

  // 3. SCREEN: BREAK
  if (screen === 'break') {
    return (
      <div 
        className="min-h-screen w-full bg-gradient-to-br from-indigo-50 to-white flex flex-col items-center justify-center p-4 select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* MONITOR TETAP AKTIF SAAT BREAK */}
        <AdvancedSecurityMonitor 
          isActive={securityActive && !sp1Data} 
          tokenCode={currentTokenCode}
          onForceSubmit={forceSubmitExam} 
          onWarning={handleSecurityWarning} 
        />
        {sp1Data && <SP1Modal data={sp1Data} onClose={closeSP1} />}

        <div className="relative flex items-center justify-center mb-8">
          <div className="absolute w-64 h-64 rounded-full border-4 border-indigo-100"></div>
          <div className="absolute w-60 h-60 rounded-full border-8 border-indigo-500 animate-pulse opacity-20"></div>
          <div className="w-56 h-56 bg-white rounded-full shadow-2xl flex items-center justify-center border-8 border-indigo-600 relative z-10">
            <div className="text-center">
              <span className="block text-7xl font-bold text-indigo-700">{breakTime}</span>
              <span className="text-indigo-400 text-sm font-bold uppercase tracking-wider">Detik</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400 font-medium tracking-wide">LANJUT OTOMATIS...</p>
        <p className="text-xs text-red-400 font-bold mt-4 flex items-center gap-1"><Shield size={12}/> Security Monitor Active</p>
      </div>
    );
  }

  // 4. SCREEN: RESULT
  if (screen === 'result') {
    return (
      <div 
        className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center items-center select-none overflow-y-auto"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="bg-white p-4 md:p-8 rounded-xl shadow-2xl max-w-[95%] w-full text-center my-8">
          <h1 className="text-3xl font-bold mb-2 text-indigo-900 hidden">Hasil Ujian</h1>
          <h2 className="text-xl text-gray-600 mb-4 font-medium">{studentName}</h2>
          
          {violationReason && (
            <div className="bg-red-100 border-2 border-red-400 text-red-800 p-4 rounded-lg mb-6 font-bold animate-pulse">
               <div className="flex items-center justify-center gap-2 text-lg">
                 <ShieldAlert size={24} /> UJIAN DIHENTIKAN OTOMATIS
               </div>
               <p className="text-sm font-normal mt-1">Alasan: {violationReason}</p>
            </div>
          )}
          
          <AnalysisDashboard />

          {/* --- TABEL SKOR LENGKAP --- */}
          <div className="w-full bg-white p-0 md:p-4 overflow-hidden mt-8 mb-8">
            <div className="text-center font-extrabold text-lg md:text-xl mb-4 uppercase text-gray-800 tracking-tight">
              SKOR TRYOUT AKBAR UTBK SNBT
            </div>
            
            <div className="overflow-x-auto border border-gray-800 shadow-md">
              <table className="min-w-full text-[10px] md:text-xs border-collapse">
                <thead>
                  <tr className="bg-teal-700 text-white font-bold text-center uppercase tracking-wider">
                    <th rowSpan="2" className="border border-white p-2 w-8">No</th>
                    <th rowSpan="2" className="border border-white p-2 min-w-[120px]">Nama</th>
                    <th rowSpan="2" className="border border-white p-2 min-w-[100px]">Sekolah</th>
                    {['PU', 'PPU', 'PK', 'PBM', 'Lit.Indo', 'Lit.Ing', 'PM'].map(h => (
                        <th key={h} colSpan="2" className="border border-white p-1">{h}</th>
                    ))}
                    <th rowSpan="2" className="border border-white p-2 w-16 bg-teal-800">TOTAL</th>
                  </tr>
                  <tr className="bg-teal-600 text-white font-bold text-center text-[9px] uppercase">
                    {Array(7).fill(null).map((_, i) => (
                      <React.Fragment key={i}>
                        <th className="border border-white px-1 py-1 min-w-[25px]">B</th>
                        <th className="border border-white px-1 py-1 min-w-[35px]">Skor</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-gray-900 bg-white font-medium">
                  {leaderboard.length === 0 ? (
                    <tr><td colSpan="18" className="p-6 text-center text-gray-500 italic">Memuat data peringkat...</td></tr>
                  ) : leaderboard.map((row, idx) => {
                    const getVal = (id, type) => row.details?.[id]?.[type] || 0;
                    const isMe = row.name === studentName;
                    return (
                      <tr key={idx} className={`text-center ${isMe ? 'bg-yellow-100 font-bold border-2 border-yellow-400' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-100')}`}>
                        <td className="border border-gray-400 p-2">{row.rank}</td>
                        <td className="border border-gray-400 p-2 text-left truncate max-w-[150px]">{row.name} {isMe && '(Kamu)'}</td>
                        <td className="border border-gray-400 p-2 text-left truncate max-w-[120px]">{row.school}</td>
                        {['pu', 'ppu', 'pk', 'pbm', 'lbi', 'lbe', 'pm'].map(id => (
                          <React.Fragment key={id}>
                            <td className="border border-gray-400 p-1">{getVal(id, 'b')}</td>
                            <td className="border border-gray-400 p-1 text-teal-800">{getVal(id, 'skor')}</td>
                          </React.Fragment>
                        ))}
                        <td className="border border-gray-400 p-2 font-bold bg-teal-50 text-teal-900">{row.score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 text-center">
              {myRank ? (
                <div className="inline-block bg-teal-100 text-teal-800 px-4 py-2 rounded-full font-bold text-sm border border-teal-200">
                  🎉 Kamu peringkat <span className="text-lg">{myRank}</span> dari seluruh peserta.
                </div>
              ) : (
                <div className="inline-block bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm border border-gray-200">
                  Kamu belum masuk Top 10.
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <button 
              onClick={() => { 
                if (document.fullscreenElement) document.exitFullscreen().catch(()=>{}); 
                localStorage.removeItem('utbk_student_token'); 
                setScreen('landing'); 
                setInputToken(''); 
                setStudentName(''); 
              }} 
              className="w-full bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-xl font-bold hover:bg-red-100 transition"
            >
              Selesai / Logout
            </button>
            <FooterLiezira />
          </div>
        </div>
      </div>
    );
  }
  
  // 5. SCREEN: TEST
  const currentSubtest = testOrder[currentSubtestIndex];
  if (!currentSubtest || !questionOrder[currentSubtest.id]) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p>Memuat soal...</p>
      </div>
    );
  }
  
  const currentQ = questionOrder[currentSubtest.id][currentQuestion];
  const key = `${currentSubtest.id}_${currentQuestion}`;
  const qType = currentQ.type || 'pilihan_ganda'; 

  return (
    <div 
      className="min-h-screen w-full bg-gray-50 select-none pb-10" 
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      onContextMenu={(e) => e.preventDefault()} // MATIKAN KLIK KANAN
    >
      
      {/* --- INTEGRASI SECURITY --- */}
      <AdvancedSecurityMonitor 
        isActive={securityActive && !sp1Data} 
        tokenCode={currentTokenCode}
        onForceSubmit={forceSubmitExam} 
        onWarning={handleSecurityWarning} 
      />
      {sp1Data && <SP1Modal data={sp1Data} onClose={closeSP1} />}

      {/* HEADER BARU (RESPONSIF & TANPA BADGE PROTECTED) */}
      <div className="sticky top-0 z-40 bg-indigo-700 text-white shadow-lg transition-all duration-300">
        <div className="max-w-6xl mx-auto p-4 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Judul Subtes & Info Soal */}
          <div className="text-center md:text-left w-full md:w-auto">
            <h2 className="text-lg md:text-xl font-bold leading-tight">{currentSubtest.name}</h2>
            <p className="text-xs md:text-sm text-indigo-200 mt-1">
              Soal {currentQuestion + 1} <span className="mx-1">/</span> {currentSubtest.questions}
            </p>
          </div>

          {/* Timer Saja (Protected Dihapus) */}
          <div className="flex items-center justify-center w-full md:w-auto">
            <div className="flex items-center gap-2 bg-indigo-900 px-6 py-2 rounded-lg border border-indigo-500/30 w-full md:w-auto justify-center shadow-inner">
              <Clock size={20} className="md:w-6 md:h-6 text-yellow-400" />
              <span className="text-xl md:text-2xl font-bold font-mono tracking-widest text-white">
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* CONTENT (Padding Bottom ditambah agar scroll HP aman) */}
      <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* NAVIGATION */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h3 className="font-semibold text-gray-700 mb-3">Navigasi</h3>
              <div className="grid grid-cols-5 gap-2 md:grid-cols-5 lg:grid-cols-5">
                {Array.from({ length: currentSubtest.questions }).map((_, idx) => { 
                  const qKey = `${currentSubtest.id}_${idx}`; 
                  const isAnswered = answers[qKey] && (Array.isArray(answers[qKey]) ? answers[qKey].length > 0 : true); 
                  return (
                    <button 
                      key={idx} 
                      onClick={() => setCurrentQuestion(idx)} 
                      className={`w-full h-9 md:h-10 rounded-lg text-xs md:text-sm font-bold transition-all transform active:scale-95 ${
                        idx === currentQuestion 
                          ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-300' 
                          : isAnswered 
                            ? (doubtful[qKey] ? 'bg-yellow-400 text-white' : 'bg-green-500 text-white') 
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ); 
                })}
              </div>
            </div>
          </div>
          
          {/* QUESTION AREA */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
              
              <div className="mb-8">
                <div className="mb-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex w-fit items-center gap-1">
                    {qType === 'pilihan_majemuk' ? <CheckSquare size={12}/> : qType === 'isian' ? <AlignLeft size={12}/> : <List size={12}/>} 
                    {qType.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-lg text-gray-800 leading-loose whitespace-pre-wrap font-medium mb-6 text-left text-justify">
                  <Latex>{currentQ?.question}</Latex>
                </div>
                {currentQ?.image && (
                  <div className="flex justify-center my-6">
                    <img src={currentQ.image} alt="Soal Visual" className="w-full h-auto my-6 select-none object-contain" onContextMenu={e=>e.preventDefault()} draggable="false" />
                  </div>
                )}
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

              <div className="flex items-center gap-3 mb-6">
                <input type="checkbox" id="doubt" checked={doubtful[key]||false} onChange={()=>setDoubtful(p=>({...p,[key]:!p[key]}))} className="w-5 h-5 cursor-pointer" />
                <label htmlFor="doubt" className="cursor-pointer font-medium text-gray-600">Ragu-ragu</label>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => setCurrentQuestion(currentQuestion - 1)} disabled={currentQuestion === 0} className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold disabled:bg-gray-300">Kembali</button>
                <button onClick={handleNextQuestion} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Selanjutnya</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UTBKStudentApp;
