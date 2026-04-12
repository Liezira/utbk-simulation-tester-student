import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Clock, Ticket, ShieldAlert, Timer, Copyright, CheckSquare, AlignLeft, List, 
  PieChart, Lightbulb, LayoutDashboard, Shield, Smartphone,
  Bold, Italic, Underline, Strikethrough, Superscript, Subscript,
  PauseCircle, PlayCircle, Coffee
} from 'lucide-react';
import { db } from './firebase'; 
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, increment } from 'firebase/firestore';
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
  { id: 'pu',  name: 'Penalaran Umum',                    questions: 30, time: 30 },
  { id: 'ppu', name: 'Pengetahuan & Pemahaman Umum',       questions: 20, time: 15 },
  { id: 'pbm', name: 'Pemahaman Bacaan & Menulis',         questions: 20, time: 25 },
  { id: 'pk',  name: 'Pengetahuan Kuantitatif',            questions: 20, time: 20 },
  { id: 'lbi', name: 'Literasi Bahasa Indonesia',          questions: 30, time: 45 },
  { id: 'lbe', name: 'Literasi Bahasa Inggris',            questions: 20, time: 30 },
  { id: 'pm',  name: 'Penalaran Matematika',               questions: 20, time: 30 },
];

// ✅ BARU: Sistem Skoring Pelanggaran (Sinkron dengan Admin Config)
const VIOLATION_SCORING = {
  types: {
    tab_switch:   { label: 'Pindah Tab/Window',  deduction: 2,  maxCount: 3,  grace: 1 },
    fullscreen:   { label: 'Keluar Fullscreen',  deduction: 1,  maxCount: 5,  grace: 2 },
    copy_paste:   { label: 'Copy/Paste',         deduction: 3,  maxCount: 2,  grace: 0 },
    devtools:     { label: 'Buka DevTools',      deduction: 5,  maxCount: 1,  grace: 0 },
    split_screen: { label: 'Split Screen',       deduction: 3,  maxCount: 2,  grace: 0 },
  },
  maxTotalDeduction: 15,   // Auto-submit threshold
  warningThreshold: 8,     // Peringatan keras muncul
};

// Map tipe internal ke kategori scoring
const VIOLATION_TYPE_MAP = {
  visibility:    'tab_switch',
  blur:          'tab_switch',
  screenshot:    'tab_switch',
  fullscreen_exit: 'fullscreen',
  split_screen_h: 'split_screen',
  split_screen_w: 'split_screen',
  devtools:      'devtools',
  copy:          'copy_paste',
  paste:         'copy_paste',
  rightClick:    null, // Tidak ada pengurangan, hanya diblok
};

const SECURITY_CONFIG = {
  MAX_VIOLATIONS: 2, // Tetap untuk SP modal (legacy)
  PASTE_BLOCKED: true, 
  COPY_BLOCKED: true, 
  DEVTOOLS_BLOCKED: true, 
  RIGHT_CLICK_BLOCKED: true,
  FULLSCREEN_EXIT_GRACE_PERIOD: 2000,
};

// ✅ BARU: Pause Config
const PAUSE_CONFIG = {
  MAX_PAUSE_COUNT: 2,      // Maksimal pause per subtes
  MAX_PAUSE_DURATION: 300, // Detik (5 menit) per pause
};

// --- HELPER FUNCTIONS ---
const getQuestionDifficulty = (question, index) => {
  if (question.difficulty === 'hard') return 3;
  if (question.difficulty === 'medium') return 2;
  if ((index + 1) % 3 === 0) return 3; 
  if ((index + 1) % 2 === 0) return 2; 
  return 1; 
};

const getWeight = (difficultyLevel) => {
  switch (difficultyLevel) { case 3: return 2.0; case 2: return 1.5; default: return 1.0; }
};

const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;

// --- 🆕 WAKE LOCK MANAGER ---
const useWakeLock = (isActive) => {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => { wakeLockRef.current = null; }).catch(() => {});
      }
      return;
    }
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) { console.warn('Wake Lock request failed:', err); }
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive && !wakeLockRef.current) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) wakeLockRef.current.release().then(() => { wakeLockRef.current = null; }).catch(() => {});
    };
  }, [isActive]);
};

// ✅ BARU: Rich Text Toolbar (untuk input jawaban isian)
const applyFormat = (text, selStart, selEnd, format) => {
  const selected = text.substring(selStart, selEnd);
  if (!selected) return { text, cursor: selStart };
  const formatMap = {
    bold:        ['**', '**'],
    italic:      ['_', '_'],
    underline:   ['<u>', '</u>'],
    strike:      ['~~', '~~'],
    superscript: ['^(', ')'],
    subscript:   ['_(', ')'],
  };
  const fmt = formatMap[format];
  if (!fmt) return { text, cursor: selEnd };
  const [open, close] = fmt;
  return {
    text: text.substring(0, selStart) + open + selected + close + text.substring(selEnd),
    cursor: selEnd + open.length + close.length
  };
};

const RichTextToolbar = ({ inputRef, value, onChange }) => {
  const handleFormat = (format) => {
    const el = inputRef?.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const result = applyFormat(value, s, e, format);
    onChange(result.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.cursor - (result.cursor - e), result.cursor);
    });
  };
  const tools = [
    { icon: <Bold size={13}/>, fmt: 'bold', title: 'Bold' },
    { icon: <Italic size={13}/>, fmt: 'italic', title: 'Italic' },
    { icon: <Underline size={13}/>, fmt: 'underline', title: 'Underline' },
    { icon: <Strikethrough size={13}/>, fmt: 'strike', title: 'Strikethrough' },
    { icon: <Superscript size={13}/>, fmt: 'superscript', title: 'Superscript' },
    { icon: <Subscript size={13}/>, fmt: 'subscript', title: 'Subscript' },
  ];
  return (
    <div className="flex items-center gap-1 bg-gray-100 border border-b-0 border-gray-300 rounded-t-lg px-2 py-1 flex-wrap">
      {tools.map(({ icon, fmt, title }) => (
        <button key={fmt} type="button" title={title}
          onMouseDown={(e) => { e.preventDefault(); handleFormat(fmt); }}
          className="p-1.5 rounded hover:bg-white hover:shadow-sm text-gray-500 hover:text-indigo-700 transition text-xs">
          {icon}
        </button>
      ))}
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <span className="text-[10px] text-gray-400 italic">Pilih teks → format | bold: **text** | pangkat: ^(n) | bawah: _(n)</span>
    </div>
  );
};

// ✅ FIX: Markdown → HTML converter (bold, italic, underline, strike, super, sub)
const markdownToHtml = (str) => {
  if (!str) return '';
  let s = str;
  // Order matters: subscript/superscript with () FIRST (avoid clash with italic _)
  s = s.replace(/_\(([^)]*)\)/g,   '<sub>$1</sub>');
  s = s.replace(/\^\(([^)]*)\)/g,  '<sup>$1</sup>');
  // Bold: **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Strikethrough: ~~text~~
  s = s.replace(/~~([^~]+)~~/g,    '<s>$1</s>');
  // Underline HTML pass-through: <u>text</u>
  s = s.replace(/<u>([\s\S]*?)<\/u>/g, '<u>$1</u>');
  // Italic: _text_ (NOT subscript _(...) which is already consumed above)
  s = s.replace(/_([^_\n(][^_\n]*)_/g, '<em>$1</em>');
  return s;
};

// ✅ FIX: Hybrid renderer — markdown outside $...$ blocks, KaTeX inside $...$
const MathText = ({ children, className }) => {
  if (!children) return null;
  const text = String(children);

  // Split text into LaTeX math segments ($...$ / $$...$$) and plain markdown segments
  const segments = [];
  const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let lastIdx = 0, m;

  while ((m = mathRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ type: 'md', content: text.slice(lastIdx, m.index) });
    }
    segments.push({ type: 'math', content: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ type: 'md', content: text.slice(lastIdx) });
  }

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'math'
          ? <Latex key={i}>{seg.content}</Latex>
          : <span
              key={i}
              style={{ whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(seg.content) }}
            />
      )}
    </span>
  );
};

// ✅ FIX: Isian answer live preview component
const IsianPreview = ({ value }) => {
  if (!value) return null;
  return (
    <div className="mt-2 px-4 pb-3">
      <p className="text-[10px] font-bold text-indigo-400 uppercase mb-1 flex items-center gap-1">
        <span>👁</span> Preview:
      </p>
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 text-base font-medium text-gray-800 min-h-[36px]">
        <MathText>{value}</MathText>
      </div>
    </div>
  );
};

// ✅ BARU: Pause Modal (dengan timer dan sistem keamanan tetap aktif)
const PauseModal = ({ pauseTimeLeft, pauseCount, onResume, onForceEnd }) => (
  <div className="fixed inset-0 z-[9998] bg-indigo-950/98 flex flex-col items-center justify-center p-6 backdrop-blur-sm select-none">
    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-center">
        <Coffee size={56} className="text-white mx-auto mb-3 opacity-90" />
        <h2 className="text-2xl font-black text-white uppercase tracking-wide">Waktu Jeda</h2>
        <p className="text-indigo-200 text-sm mt-1">Ujian dijeda sementara</p>
      </div>
      <div className="p-6 text-center space-y-4">
        <div className="bg-indigo-50 rounded-2xl p-4">
          <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Sisa Waktu Jeda</p>
          <div className="text-5xl font-black text-indigo-700 font-mono">{formatTime(pauseTimeLeft)}</div>
          <p className="text-xs text-gray-500 mt-2">Jeda otomatis berakhir saat timer habis</p>
        </div>
        <div className="flex gap-2 text-xs text-gray-500">
          <div className="flex-1 bg-gray-50 rounded-lg p-2">
            <span className="font-bold text-gray-700 block">{PAUSE_CONFIG.MAX_PAUSE_DURATION / 60} menit</span>
            <span>Max durasi</span>
          </div>
          <div className="flex-1 bg-gray-50 rounded-lg p-2">
            <span className="font-bold text-gray-700 block">{pauseCount}/{PAUSE_CONFIG.MAX_PAUSE_COUNT}</span>
            <span>Jeda terpakai</span>
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 text-left">
          <b>⚠️ Catatan:</b> Timer subtes <b>tidak berjalan</b> saat jeda. Sistem keamanan tetap aktif. Jangan pindah tab.
        </div>
      </div>
      <div className="p-4 border-t space-y-2">
        <button onClick={onResume} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2">
          <PlayCircle size={20}/> Lanjutkan Ujian
        </button>
      </div>
    </div>
  </div>
);

// ✅ BARU: Violation Warning Modal (menggantikan SP1 untuk pelanggaran minor)
const ViolationWarningModal = ({ violationScore, message, onClose }) => {
  const isHigh = violationScore >= VIOLATION_SCORING.warningThreshold;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border-4 ${isHigh ? 'border-red-600' : 'border-orange-400'}`}>
        <div className={`p-6 text-center ${isHigh ? 'bg-red-600' : 'bg-orange-500'}`}>
          <ShieldAlert size={56} className="text-white mx-auto mb-2 animate-bounce" />
          <h2 className="text-2xl font-black text-white uppercase">
            {isHigh ? 'PERINGATAN KERAS!' : 'PELANGGARAN TERDETEKSI'}
          </h2>
        </div>
        <div className="p-6 text-center space-y-4">
          <p className="text-gray-700 text-sm font-medium bg-gray-50 p-3 rounded-lg border">"{message}"</p>
          <div className="flex items-center justify-center gap-4">
            <div className={`text-center p-3 rounded-xl ${isHigh ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
              <div className={`text-3xl font-black ${isHigh ? 'text-red-600' : 'text-orange-600'}`}>{violationScore}</div>
              <div className={`text-xs font-bold uppercase ${isHigh ? 'text-red-500' : 'text-orange-500'}`}>Poin Pelanggaran</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-gray-50 border border-gray-200">
              <div className="text-3xl font-black text-gray-700">{VIOLATION_SCORING.maxTotalDeduction}</div>
              <div className="text-xs font-bold uppercase text-gray-500">Batas Auto-Submit</div>
            </div>
          </div>
          {isHigh ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 text-left text-xs text-red-800">
              <b>⛔ PERINGATAN KERAS:</b> Poin pelanggaran sudah tinggi. Satu pelanggaran besar berikutnya akan memicu <b>Submit Otomatis</b>.
            </div>
          ) : (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 text-left text-xs text-yellow-800">
              <b>⚠️ Catatan:</b> Pelanggaran ini mengurangi skor akhir. Jika tidak disengaja, harap segera kembali ke mode normal.
            </div>
          )}
        </div>
        <div className="p-4 border-t">
          <button onClick={onClose} className={`w-full font-bold py-3 rounded-xl text-white transition ${isHigh ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}>
            Mengerti, Kembali ke Ujian
          </button>
        </div>
      </div>
    </div>
  );
};

// --- ADVANCED SECURITY MONITOR ---
const AdvancedSecurityMonitor = ({ isActive, onViolationDetected, isIOSDevice }) => {
  const lastActivityRef = useRef(Date.now());
  const checkIntervalRef = useRef(null);
  const fullscreenExitTimerRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    const style = document.createElement('style');
    style.innerHTML = `body { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; } @media print { html, body { display: none !important; } }`;
    document.head.appendChild(style);

    const checkScreenIntegrity = () => {
      const now = Date.now();
      if (document.hidden) onViolationDetected('visibility', '⚠️ Terdeteksi pindah tab / minimize!');
      if (document.hidden && (now - lastActivityRef.current < 100)) onViolationDetected('screenshot', '⚠️ Terdeteksi kedipan layar');

      const screenHeight = window.screen.availHeight || window.screen.height;
      const windowHeight = window.innerHeight;
      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      if (!isTyping) {
        if (!isIOSDevice && windowHeight < screenHeight * 0.80) {
          onViolationDetected('split_screen_h', '🚫 Split Screen Terdeteksi!');
        }
        if (window.innerWidth < window.outerWidth * 0.90) {
          onViolationDetected('split_screen_w', '🚫 Floating Window Terdeteksi!');
        }
      }

      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = isIOSDevice ? false : (window.outerHeight - window.innerHeight > threshold);
      if (widthThreshold || heightThreshold) onViolationDetected('devtools', '🚫 DevTools/Console Terbuka!');

      lastActivityRef.current = now;
    };

    checkIntervalRef.current = setInterval(checkScreenIntegrity, 500);

    const handleFullscreenChange = () => {
      if (isIOSDevice) return;
      if (!document.fullscreenElement) {
        if (fullscreenExitTimerRef.current) clearTimeout(fullscreenExitTimerRef.current);
        fullscreenExitTimerRef.current = setTimeout(() => {
          if (!document.fullscreenElement) onViolationDetected('fullscreen_exit', '🚫 Keluar dari Fullscreen Mode!');
        }, SECURITY_CONFIG.FULLSCREEN_EXIT_GRACE_PERIOD);
      } else {
        if (fullscreenExitTimerRef.current) { clearTimeout(fullscreenExitTimerRef.current); fullscreenExitTimerRef.current = null; }
      }
    };

    const handleBlur = () => onViolationDetected('blur', '⚠️ Fokus Hilang!');
    const handleCopy = (e) => { e.preventDefault(); onViolationDetected('copy', '🚫 Copy Blocked'); };
    const handlePaste = (e) => { e.preventDefault(); onViolationDetected('paste', '🚫 Paste Blocked'); };
    const handleContextMenu = (e) => { e.preventDefault(); onViolationDetected('rightClick', '🚫 Right Click Blocked'); };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      clearInterval(checkIntervalRef.current);
      if (fullscreenExitTimerRef.current) clearTimeout(fullscreenExitTimerRef.current);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, [isActive, onViolationDetected, isIOSDevice]);

  return null;
};

// --- MAIN APP COMPONENT ---
const UTBKStudentApp = () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  const [screen, setScreen] = useState('landing');
  const [studentName, setStudentName] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [currentTokenCode, setCurrentTokenCode] = useState('');

  // State Ujian
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
  
  // --- SECURITY STATES ---
  const [violationCount, setViolationCount] = useState(0); 
  const [violationScore, setViolationScore] = useState(0);       // ✅ BARU: Akumulasi poin pelanggaran
  const [violationCounts, setViolationCounts] = useState({});    // ✅ BARU: Count per tipe
  const [violationReason, setViolationReason] = useState(null);
  const [securityActive, setSecurityActive] = useState(false);
  const [sp1Data, setSp1Data] = useState(null);                   // Dipertahankan untuk kompatibilitas
  const [showViolationWarning, setShowViolationWarning] = useState(false); // ✅ BARU
  const [lastViolationMsg, setLastViolationMsg] = useState('');   // ✅ BARU
  const [currentViolationScore, setCurrentViolationScore] = useState(0); // ✅ BARU

  // ✅ BARU: Pause States
  const [isPaused, setIsPaused] = useState(false);
  const [pauseCount, setPauseCount] = useState(0);
  const [pauseTimeLeft, setPauseTimeLeft] = useState(PAUSE_CONFIG.MAX_PAUSE_DURATION);
  const pauseEndTimeRef = useRef(null);

  // --- LANDSCAPE LOCK STATE ---
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);

  const timerRef = useRef(null);
  const pauseTimerRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const isanInputRef = useRef(null); // ✅ BARU: Ref untuk input isian

  useWakeLock(securityActive && !isPaused);

  // --- 1. CORE VIOLATION LOGIC (SCORING SYSTEM) ---
  const handleViolationLogic = useCallback(async (type, message) => {
    // Jangan proses jika sedang paused, sudah ada warning tampil, atau sudah diskualifikasi
    if (isPaused || violationReason || showViolationWarning) return;

    // Cari kategori scoring
    const category = VIOLATION_TYPE_MAP[type];
    
    // rightClick dan tipe tanpa kategori: blok saja, tidak ada poin
    if (!category) return;

    const config = VIOLATION_SCORING.types[category];
    if (!config) return;

    // Hitung count untuk kategori ini
    const prevCount = (violationCounts[category] || 0);
    const newCountForCategory = prevCount + 1;

    // Cek apakah masih dalam grace period
    const isInGrace = newCountForCategory <= config.grace;
    const deduction = isInGrace ? 0 : config.deduction;

    const newViolationCounts = { ...violationCounts, [category]: newCountForCategory };
    setViolationCounts(newViolationCounts);

    // Hitung total poin pelanggaran baru
    const newViolationScore = violationScore + deduction;
    setViolationScore(newViolationScore);
    setCurrentViolationScore(newViolationScore);

    // Log ke Firebase
    if (currentTokenCode) {
      try {
        await updateDoc(doc(db, 'tokens', currentTokenCode), {
          violationScore: newViolationScore,
          [`violations.${category}`]: newCountForCategory,
          lastViolation: { type, message, category, deduction, timestamp: new Date().toISOString() }
        });
      } catch (e) { console.warn("Violation log failed", e); }
    }

    // Grace period: tidak tampilkan apapun (silent)
    if (isInGrace) {
      console.warn(`[GRACE] ${type}: ${message} (grace ${newCountForCategory}/${config.grace})`);
      return;
    }

    // Cek apakah harus auto-submit
    if (newViolationScore >= VIOLATION_SCORING.maxTotalDeduction) {
      forceSubmitExam(`Total poin pelanggaran mencapai ${newViolationScore}. Auto-submit.`);
      return;
    }

    // Tampilkan warning modal (menggantikan SP1 untuk kasus ringan)
    setLastViolationMsg(message);
    setShowViolationWarning(true);

    // Jika poin sudah di atas warning threshold, juga tampilkan SP1 style (dengan update violationCount lama untuk kompatibilitas)
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

  // ✅ BARU: Pause Logic
  const handlePause = useCallback(() => {
    if (pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT) {
      alert(`Maksimal ${PAUSE_CONFIG.MAX_PAUSE_COUNT}x jeda per subtes sudah habis.`);
      return;
    }
    // Hentikan timer ujian (dengan menyimpan endTime)
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Set pause state
    setPauseCount(p => p + 1);
    setPauseTimeLeft(PAUSE_CONFIG.MAX_PAUSE_DURATION);
    pauseEndTimeRef.current = Date.now() + (PAUSE_CONFIG.MAX_PAUSE_DURATION * 1000);
    setIsPaused(true);

    // Keluar fullscreen saat pause (jika ada)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [pauseCount]);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    // Geser endTime sesuai sisa waktu yang tersisa sebelum pause
    // timeLeft sudah tersimpan, jadi rebuild endTime dari timeLeft saat ini
    const newEndTime = Date.now() + (timeLeft * 1000);
    setEndTime(newEndTime);
    // Re-aktifkan fullscreen
    forceFullscreen();
  }, [timeLeft]);

  // Pause timer countdown
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

  // --- 3. ORIENTATION CHECK ---
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

  // --- SESSION RESTORE ---
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
              .forEach(k => localStorage.removeItem(k));
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
            const restoredTestOrder = data.testOrder.map(id => SUBTESTS.find(s => s.id === id)).filter(Boolean);
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
          
          // Restore violation score jika ada
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

  // --- APP CHECK & SOAL ---
  useEffect(() => {
    const initAppCheck = async () => {
      try {
        const siteKey = import.meta.env.VITE_RECAPTCHA;
        if (siteKey) {
          if (typeof window !== 'undefined' && window.location.hostname === 'localhost') window.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          initializeAppCheck(getApp(), { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
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

  // --- IRT SCORE CALCULATION ---
  const calculateScore = useCallback(() => { 
    const details = {}; 
    let totalIrtScore = 0;
    const mapelOrder = ['pu', 'ppu', 'pk', 'pbm', 'lbi', 'lbe', 'pm']; 

    mapelOrder.forEach(id => {
      const s = SUBTESTS.find(item => item.id === id);
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
      scores: Object.fromEntries(mapelOrder.map(id => [id, details[id]?.skor || 0])),
      correctCounts: Object.fromEntries(mapelOrder.map(id => [id, details[id]?.b || 0]))
    }; 
  }, [answers, questionOrder]);

  // --- DASHBOARD COMPONENT ---
  const AnalysisDashboard = () => {
    const { scores, totalScore, correctCounts } = calculateScore();
    const tpsIds = SUBTEST_GROUPS.TPS.ids;
    const litIds = SUBTEST_GROUPS.LITERASI.ids;
    const tpsAvg = Math.round(tpsIds.reduce((a, id) => a + (scores[id] || 0), 0) / tpsIds.length);
    const litAvg = Math.round(litIds.reduce((a, id) => a + (scores[id] || 0), 0) / litIds.length);
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

        {/* ✅ BARU: Violation score summary di halaman hasil */}
        {violationScore > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-4">
            <div className="bg-orange-500 text-white p-3 rounded-xl"><ShieldAlert size={24}/></div>
            <div>
              <h4 className="font-bold text-orange-900 text-sm">Catatan Keamanan</h4>
              <p className="text-orange-700 text-xs mt-0.5">Total poin pelanggaran: <b>{violationScore}</b>. Skor ini terlihat oleh pengawas.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2"><PieChart size={16}/> Dominasi Nilai</h4>
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center shrink-0" style={{ background: `conic-gradient(#3b82f6 0% ${tpsPercent}%, #f97316 ${tpsPercent}% 100%)` }}>
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm z-10">
                  <span className={`text-xs font-black ${tpsPercent > litPercent ? 'text-blue-600' : 'text-orange-600'}`}>{tpsPercent > litPercent ? 'TPS' : 'LIT'}</span>
                </div>
              </div>
              <div className="space-y-2 flex-1 text-xs">
                <div><div className="flex justify-between font-bold text-slate-500 mb-1"><span>TPS</span><span>{tpsPercent}%</span></div><div className="w-full bg-slate-100 rounded-full h-1.5"><div style={{width:`${tpsPercent}%`}} className="h-full bg-blue-600 rounded-full"></div></div></div>
                <div><div className="flex justify-between font-bold text-slate-500 mb-1"><span>Literasi</span><span>{litPercent}%</span></div><div className="w-full bg-slate-100 rounded-full h-1.5"><div style={{width:`${litPercent}%`}} className="h-full bg-orange-500 rounded-full"></div></div></div>
              </div>
            </div>
          </div>
          <div className="bg-orange-50 border border-orange-200 p-5 rounded-2xl flex gap-3 items-start shadow-sm">
            <div className="bg-orange-500 text-white p-2 rounded-lg shrink-0"><Lightbulb size={20}/></div>
            <div><h4 className="font-bold text-orange-900 text-sm mb-1">Analisis AI</h4><p className="text-orange-800 text-xs leading-relaxed opacity-90">{mitigationText}</p></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50"><h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><LayoutDashboard size={16}/> Rincian Subtes</h4></div>
          <div className="divide-y divide-slate-100 text-sm">
            {SUBTESTS.map((s) => {
              const score = scores[s.id] || 0;
              const correct = correctCounts[s.id] || 0;
              const accuracy = Math.round((correct / s.questions) * 100);
              return (
                <div key={s.id} className="p-4 hover:bg-slate-50 transition flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white ${accuracy >= 50 ? "bg-blue-500" : "bg-red-500"}`}>{accuracy}%</div>
                    <div><h5 className="font-bold text-slate-800 text-xs md:text-sm">{s.name}</h5><span className="text-[10px] text-slate-500">Benar: <strong>{correct}</strong>/{s.questions}</span></div>
                  </div>
                  <div className="text-right"><span className="block text-[10px] uppercase font-bold text-slate-400">Skor</span><span className="text-base font-black text-slate-800">{score}</span></div>
                </div>
              );
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
          await updateDoc(doc(db, 'tokens', currentTokenCode), { 
            status: 'used', score: totalScore, scoreDetails: details,
            finalTimeLeft: globalTimeLeftSeconds, finishedAt: new Date().toISOString(),
            violation: violationReason || null, answers, historyQuestions: questionOrder,
            violationScore,       // Simpan total poin pelanggaran
            violationCounts,      // FIX Bug 4: Simpan breakdown per tipe pelanggaran
          });
          ['answers_', 'questionOrder_', 'testOrder_'].forEach(prefix => 
            localStorage.removeItem(`${prefix}${currentTokenCode}`)
          );
          
          const snap = await getDocs(query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), limit(10)));
          const top10 = [];
          let rank = 1, userRank = null;
          snap.forEach((d) => {
            const dt = d.data();
            top10.push({ rank, name: dt.studentName, school: dt.studentSchool||'-', score: dt.score, details: dt.scoreDetails||{} });
            if (dt.tokenCode === currentTokenCode) userRank = rank;
            rank++;
          });
          setLeaderboard(top10);
          setMyRank(userRank);
        } catch (error) {
          console.error("Save Error:", error);
          // FIX UX 3: Beri tahu siswa secara eksplisit bahwa skor gagal tersimpan
          // agar mereka bisa menghubungi admin sebelum menutup tab.
          alert(
            "⚠️ PERHATIAN: Ujian selesai tapi skor gagal tersimpan ke server.\n\n" +
            "Jangan tutup halaman ini! Catat kode token kamu dan hubungi admin segera.\n\n" +
            `Error: ${error.message}`
          );
        }
      };
      
      if (globalStartTime) finishExamProcess();
      else {
        const loadLeaderboardOnly = async () => {
          const snap = await getDocs(query(collection(db, 'tokens'), where('score', '!=', null), orderBy('score', 'desc'), limit(10)));
          const top10 = [];
          let rank = 1, userRank = null;
          snap.forEach(d => {
            const dt = d.data();
            top10.push({ rank, name: dt.studentName, school: dt.studentSchool||'-', score: dt.score, details: dt.scoreDetails||{} });
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

  // --- TOKEN LOGIN ---
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

      // FIX UX 4: Pengecekan expired token harus dilakukan di sini, SEBELUM user diizinkan
      // memulai ujian. Sebelumnya pengecekan ini tidak ada untuk token status 'active'.
      if ((now - createdTime) > 24 * 60 * 60 * 1000) { alert('Token Expired (>24 Jam). Hubungi admin untuk mendapatkan token baru.'); return; }

      if (confirm(`Login sebagai ${data.studentName}?`)) {
        await updateDoc(doc(db, 'tokens', tokenCode), { loginAt: new Date().toISOString() }); 
        localStorage.setItem('utbk_student_token', tokenCode);
        setStudentName(data.studentName);
        setCurrentTokenCode(tokenCode);
        setViolationReason(null); setSp1Data(null); setViolationCount(0); 
        setViolationScore(0); setViolationCounts({}); // ✅ BARU: Reset scoring states
        setSecurityActive(true); 
        await forceFullscreen();
        setCountdownTime(5); 
        setScreen('countdown'); 
      }
    } catch (error) { alert(`Error: ${error.message}`); }
  };

  // --- START TEST ---
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
          testOrder: shuffledSubtests.map(s => s.id),
          startedAt: new Date().toISOString()
        }).catch(e => console.error("Firebase backup error:", e));
      }
    }
    
    setTestOrder(shuffledSubtests);
    setQuestionOrder(qOrder);
    setCurrentSubtestIndex(0); 
    setCurrentQuestion(0); 
    const saved = localStorage.getItem(`answers_${currentTokenCode}`);
    setAnswers(saved ? JSON.parse(saved) : {});
    setDoubtful({});
    setPauseCount(0); // ✅ Reset pause count per exam start
    
    const durationSec = shuffledSubtests[0].time * 60;
    const targetTime = Date.now() + (durationSec * 1000);
    setEndTime(targetTime);
    setTimeLeft(durationSec);
    setSecurityActive(true);
    setScreen('test');
  }, [globalStartTime, bankSoal, currentTokenCode]);

  // --- TIMER & TRANSITION LOGIC ---
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
            setPauseCount(0); // ✅ Reset pause count saat ganti subtes
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
      const t = setTimeout(() => setCountdownTime(p => p - 1), 1000); 
      return () => clearTimeout(t); 
    } 
    if (screen === 'countdown' && countdownTime === 0) startTest(true); 
  }, [countdownTime, screen]);

  useEffect(() => { 
    if (screen === 'break' && breakTime > 0) { 
      const t = setTimeout(() => setBreakTime(p => p - 1), 1000); 
      return () => clearTimeout(t); 
    } 
    if (screen === 'break' && breakTime === 0) { 
      const n = currentSubtestIndex + 1; 
      setCurrentSubtestIndex(n); 
      setCurrentQuestion(0);
      setPauseCount(0); // ✅ Reset pause count per subtes
      const durationSec = testOrder[n].time * 60; 
      setEndTime(Date.now() + (durationSec * 1000));
      setTimeLeft(durationSec);
      setScreen('test');
    } 
  }, [breakTime, screen]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentQuestion, currentSubtestIndex, screen]);
  
  const handleAnswer = useCallback((val, type) => { 
    const k = `${testOrder[currentSubtestIndex].id}_${currentQuestion}`;
    setAnswers(prev => {
      let newAnswers = { ...prev };
      if (type === 'pilihan_majemuk') {
        let current = newAnswers[k] || [];
        newAnswers[k] = current.includes(val) ? current.filter(x => x !== val) : [...current, val];
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
            currentProgress: { subtestIndex: currentSubtestIndex, questionIndex: currentQuestion }
          }).catch(e => console.error("Firebase backup error:", e));
        }, 2000);
      }
      return newAnswers;
    });
  }, [testOrder, currentSubtestIndex, currentQuestion, currentTokenCode, questionOrder]);
  
  const handleNextQuestion = useCallback(() => {
    const currentSubtest = testOrder[currentSubtestIndex];
    if (currentQuestion < currentSubtest.questions - 1) { 
      setCurrentQuestion(p => p + 1); 
    } else { 
      if (currentSubtestIndex < testOrder.length - 1) { 
        setScreen('break'); setBreakTime(10); 
      } else { 
        setSecurityActive(false); setScreen('result'); 
      } 
    }
  }, [currentQuestion, currentSubtestIndex, testOrder]);

  const FooterLiezira = () => (
    <div className="mt-8 py-4 border-t border-gray-200 w-full text-center">
      <p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1">
        <Copyright size={12} /> {new Date().getFullYear()} Created by <span className="font-bold text-indigo-400">RuangSimulasi</span>
      </p>
    </div>
  );

  // --- RENDER SCREENS ---

  // 0. LANDSCAPE BLOCK
  if (isLandscapeMobile) {
    return (
      <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center text-white p-6 text-center select-none">
        <div className="animate-bounce mb-4 text-4xl">📱 ➔ 📲</div>
        <h2 className="text-xl font-bold mb-2 uppercase tracking-widest text-red-500">Orientasi Terkunci</h2>
        <p className="text-sm text-gray-400 leading-relaxed max-w-xs">Mode Landscape dimatikan untuk Smartphone.<br/>Putar ke <b>Portrait</b>.</p>
      </div>
    );
  }

  // 1. COUNTDOWN
  if (screen === 'countdown') {
    return (
      <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white select-none" onContextMenu={(e) => e.preventDefault()}>
        <AdvancedSecurityMonitor isActive={securityActive} onViolationDetected={handleViolationLogic} isIOSDevice={isIOS}/>
        {showViolationWarning && (
          <ViolationWarningModal 
            violationScore={currentViolationScore}
            message={lastViolationMsg}
            onClose={() => setShowViolationWarning(false)}
          />
        )}

        <div className="mb-8 animate-pulse"><Timer size={64} /></div>
        <h2 className="text-2xl font-bold mb-4 uppercase tracking-widest">Persiapan Ujian</h2>
        <div className="text-[120px] font-bold leading-none mb-4 text-yellow-400 font-mono">{countdownTime}</div>
        <p className="text-indigo-200 text-sm max-w-md text-center px-4">Dilarang keluar fullscreen / pindah tab.</p>
        
        {isIOS && (
          <div className="mt-4 bg-blue-900/50 border-2 border-blue-400 rounded-xl p-3 max-w-md mx-4">
            <p className="text-blue-200 text-xs font-bold flex items-center gap-2 justify-center"><Smartphone size={16}/> iOS DETECTED</p>
            <p className="text-blue-100 text-[10px] text-center mt-1">Fullscreen dinonaktifkan (Safari limitation)</p>
          </div>
        )}

        <div className="mt-6 bg-indigo-800/60 border border-indigo-500 rounded-xl p-4 max-w-md mx-4">
          <p className="text-indigo-200 text-xs font-bold flex items-center gap-2 mb-2"><Shield size={16}/> SISTEM KEAMANAN AKTIF (Skoring)</p>
          <ul className="text-indigo-100 text-xs space-y-1 text-left">
            <li>• 🔒 Wake Lock aktif — layar tidak sleep</li>
            <li>• ✅ Grace period untuk pelanggaran tidak sengaja</li>
            <li>• ⚠️ Pelanggaran = pengurangan poin (bukan langsung stop)</li>
            <li>• ❌ Poin pelanggaran ≥ {VIOLATION_SCORING.maxTotalDeduction} = <b>Auto Submit</b></li>
            <li>• ☕ Pause tersedia {PAUSE_CONFIG.MAX_PAUSE_COUNT}x (maks {PAUSE_CONFIG.MAX_PAUSE_DURATION/60} menit)</li>
          </ul>
        </div>
      </div>
    );
  }

  // 2. LANDING
  if (screen === 'landing') {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 overflow-y-auto" onContextMenu={(e) => e.preventDefault()}>
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full relative text-center my-8">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          <h1 className="text-2xl font-bold text-indigo-900 mb-1">Sistem Simulasi Test UTBK SNBT</h1>
          <p className="text-gray-500 mb-6 text-sm">Platform Ujian Berbasis Token Online</p>
          
          {isIOS && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-3 mb-4 text-left text-xs text-blue-800">
              <div className="font-bold flex items-center gap-2 mb-1 text-blue-900"><Smartphone size={16}/> iOS / Safari Terdeteksi</div>
              <p className="text-[11px]">Fullscreen API tidak didukung Safari. Security tetap berjalan normal.</p>
            </div>
          )}

          {/* ✅ BARU: Info anti-cheat diupdate dengan sistem skoring */}
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 mb-4 text-left text-xs text-indigo-800">
            <div className="font-bold flex items-center gap-2 mb-2 text-indigo-900"><Shield size={18}/> SISTEM PENGAMANAN:</div>
            <ul className="list-disc pl-4 space-y-1 font-semibold">
              <li>✓ Wake Lock — layar tidak sleep</li>
              <li>✓ Grace period untuk pelanggaran tidak sengaja</li>
              <li>✓ Pelanggaran = pengurangan poin</li>
              <li>✓ Blokir DevTools, Copy-Paste, Split Screen</li>
              <li className="text-indigo-700">Fitur Pause tersedia ({PAUSE_CONFIG.MAX_PAUSE_COUNT}x per subtes, maks {PAUSE_CONFIG.MAX_PAUSE_DURATION/60} menit)</li>
              <li className="text-red-600 font-black">⚠️ Akumulasi ≥ {VIOLATION_SCORING.maxTotalDeduction} poin = Submit Otomatis</li>
            </ul>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl mb-6">
            <label className="block text-indigo-900 font-bold mb-2 text-sm flex items-center justify-center gap-2"><Ticket size={18}/> Kode Token:</label>
            <input type="text" value={inputToken} onChange={e => setInputToken(e.target.value.toUpperCase())} className="w-full px-4 py-3 border-2 border-indigo-200 rounded-lg text-xl font-mono text-center tracking-widest uppercase outline-none focus:ring-4 focus:ring-indigo-100 bg-white" placeholder="UTBK-XXXXXX"/>
          </div>
          <button onClick={handleTokenLogin} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-indigo-700 transition shadow-lg transform hover:-translate-y-1">Mulai Ujian Sekarang</button>
          <FooterLiezira />
        </div>
      </div>
    );
  }

  // 3. BREAK
  if (screen === 'break') {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-indigo-50 to-white flex flex-col items-center justify-center p-4 select-none" onContextMenu={(e) => e.preventDefault()}>
        <AdvancedSecurityMonitor isActive={securityActive} onViolationDetected={handleViolationLogic} isIOSDevice={isIOS}/>
        {showViolationWarning && (
          <ViolationWarningModal 
            violationScore={currentViolationScore}
            message={lastViolationMsg}
            onClose={() => setShowViolationWarning(false)}
          />
        )}
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
        <p className="text-sm text-gray-400 font-medium tracking-wide">JEDA SUBTES — SECURITY ACTIVE</p>
      </div>
    );
  }

  // 4. RESULT
  if (screen === 'result') {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center items-center select-none overflow-y-auto" onContextMenu={(e) => e.preventDefault()}>
        <div className="bg-white p-4 md:p-8 rounded-xl shadow-2xl max-w-[95%] w-full text-center my-8">
          <h2 className="text-xl text-gray-600 mb-4 font-medium">{studentName}</h2>
          
          {violationReason && (
            <div className="bg-red-100 border-2 border-red-400 text-red-800 p-4 rounded-lg mb-6 font-bold animate-pulse">
              <div className="flex items-center justify-center gap-2 text-lg"><ShieldAlert size={24} /> SUBMIT OTOMATIS</div>
              <p className="text-sm font-normal mt-1">Alasan: {violationReason}</p>
            </div>
          )}
          
          <AnalysisDashboard />

          <div className="w-full bg-white p-0 md:p-4 overflow-hidden mt-8 mb-8">
            <div className="text-center font-extrabold text-lg md:text-xl mb-4 uppercase text-gray-800 tracking-tight">SKOR TRYOUT</div>
            <div className="overflow-x-auto border border-gray-800 shadow-md">
              <table className="min-w-full text-[10px] md:text-xs border-collapse">
                <thead>
                  <tr className="bg-teal-700 text-white font-bold text-center uppercase tracking-wider">
                    <th rowSpan="2" className="border border-white p-2 w-8">No</th>
                    <th rowSpan="2" className="border border-white p-2 min-w-[120px]">Nama</th>
                    <th rowSpan="2" className="border border-white p-2 min-w-[100px]">Sekolah</th>
                    {['PU','PPU','PK','PBM','Lit.Indo','Lit.Ing','PM'].map(h => (
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
                        <td className="border border-gray-400 p-2 text-left truncate max-w-[150px]">{row.name}{isMe && ' (Kamu)'}</td>
                        <td className="border border-gray-400 p-2 text-left truncate max-w-[120px]">{row.school}</td>
                        {['pu','ppu','pk','pbm','lbi','lbe','pm'].map(id => (
                          <React.Fragment key={id}>
                            <td className="border border-gray-400 p-1">{getVal(id,'b')}</td>
                            <td className="border border-gray-400 p-1 text-teal-800">{getVal(id,'skor')}</td>
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
                <div className="inline-block bg-teal-100 text-teal-800 px-4 py-2 rounded-full font-bold text-sm border border-teal-200">🎉 Kamu peringkat <span className="text-lg">{myRank}</span></div>
              ) : (
                <div className="inline-block bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm border border-gray-200">Kamu belum masuk Top 10.</div>
              )}
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <button onClick={() => { 
              if (document.fullscreenElement) document.exitFullscreen().catch(()=>{}); 
              localStorage.removeItem('utbk_student_token'); 
              setScreen('landing'); setInputToken(''); setStudentName(''); 
            }} className="w-full bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-xl font-bold hover:bg-red-100 transition">
              Selesai / Logout
            </button>
            <FooterLiezira />
          </div>
        </div>
      </div>
    );
  }
  
  // 5. TEST SCREEN
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
    <div className="min-h-screen w-full bg-gray-50 select-none pb-10" 
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }} 
      onContextMenu={(e) => e.preventDefault()}
    >
      <AdvancedSecurityMonitor 
        isActive={securityActive && !isPaused} 
        onViolationDetected={handleViolationLogic}
        isIOSDevice={isIOS}
      />

      {/* ✅ BARU: Pause Modal (keamanan tidak aktif di dalam pause, tapi timernya dihentikan) */}
      {isPaused && (
        <PauseModal 
          pauseTimeLeft={pauseTimeLeft}
          pauseCount={pauseCount}
          onResume={handleResume}
        />
      )}

      {/* ✅ BARU: Violation Warning (menggantikan SP1) */}
      {showViolationWarning && !isPaused && (
        <ViolationWarningModal 
          violationScore={currentViolationScore}
          message={lastViolationMsg}
          onClose={() => { setShowViolationWarning(false); forceFullscreen(); }}
        />
      )}

      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-indigo-700 text-white shadow-lg transition-all duration-300">
        <div className="max-w-6xl mx-auto p-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left w-full md:w-auto">
            <h2 className="text-lg md:text-xl font-bold leading-tight">{currentSubtest.name}</h2>
            <p className="text-xs md:text-sm text-indigo-200 mt-1">Soal {currentQuestion + 1} / {currentSubtest.questions}</p>
          </div>

          <div className="flex items-center justify-center gap-3 w-full md:w-auto">
            {/* Timer */}
            <div className="flex items-center gap-2 bg-indigo-900 px-6 py-2 rounded-lg border border-indigo-500/30 justify-center shadow-inner">
              <Clock size={20} className="md:w-6 md:h-6 text-yellow-400" />
              <span className={`text-xl md:text-2xl font-bold font-mono tracking-widest text-white ${timeLeft <= 60 ? 'animate-pulse text-red-300' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            </div>

            {/* ✅ BARU: Tombol Pause */}
            <button
              onClick={handlePause}
              disabled={pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT}
              title={pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT ? 'Jeda sudah habis' : `Jeda (${PAUSE_CONFIG.MAX_PAUSE_COUNT - pauseCount} sisa)`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition ${
                pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-indigo-900 shadow-md'
              }`}
            >
              <PauseCircle size={16}/>
              <span className="hidden md:inline">Jeda</span>
              <span className="text-[10px] opacity-75">({PAUSE_CONFIG.MAX_PAUSE_COUNT - pauseCount})</span>
            </button>
          </div>
        </div>

        {/* ✅ BARU: Violation Score Bar di header (hanya tampil jika ada poin) */}
        {violationScore > 0 && (
          <div className="border-t border-indigo-600 px-4 py-1.5 flex items-center gap-2">
            <div className="flex-1 bg-indigo-900 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${violationScore >= VIOLATION_SCORING.warningThreshold ? 'bg-red-400' : 'bg-yellow-400'}`}
                style={{ width: `${Math.min(100, (violationScore / VIOLATION_SCORING.maxTotalDeduction) * 100)}%` }}
              />
            </div>
            <span className={`text-[10px] font-bold ${violationScore >= VIOLATION_SCORING.warningThreshold ? 'text-red-300' : 'text-yellow-300'}`}>
              ⚠️ {violationScore}/{VIOLATION_SCORING.maxTotalDeduction}
            </span>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Navigasi Soal */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h3 className="font-semibold text-gray-700 mb-3">Navigasi</h3>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: currentSubtest.questions }).map((_, idx) => { 
                  const qKey = `${currentSubtest.id}_${idx}`; 
                  const isAnswered = answers[qKey] && (Array.isArray(answers[qKey]) ? answers[qKey].length > 0 : true); 
                  return (
                    <button key={idx} onClick={() => setCurrentQuestion(idx)} 
                      className={`w-full h-9 md:h-10 rounded-lg text-xs md:text-sm font-bold transition-all transform active:scale-95 ${idx === currentQuestion ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-300' : isAnswered ? (doubtful[qKey] ? 'bg-yellow-400 text-white' : 'bg-green-500 text-white') : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                    >
                      {idx + 1}
                    </button>
                  ); 
                })}
              </div>
            </div>
          </div>
          
          {/* Konten Soal */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
              <div className="mb-8">
                <div className="mb-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex w-fit items-center gap-1">
                    {qType === 'pilihan_majemuk' ? <CheckSquare size={12}/> : qType === 'isian' ? <AlignLeft size={12}/> : <List size={12}/>}
                    {qType.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-lg text-gray-800 leading-loose font-medium mb-6 text-left text-justify">
                  <MathText>{currentQ?.question}</MathText>
                </div>
                {currentQ?.image && (
                  <div className="flex justify-center my-6">
                    <img src={currentQ.image} alt="Soal Visual" className="w-full h-auto my-6 select-none object-contain" onContextMenu={e => e.preventDefault()} draggable="false"/>
                  </div>
                )}
              </div>

              <div className="mb-8">
                {qType === 'isian' ? (
                  <div className="bg-gray-50 p-0 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden">
                    {/* ✅ BARU: Rich Text Toolbar untuk jawaban isian */}
                    <RichTextToolbar
                      inputRef={isanInputRef}
                      value={answers[key] || ''}
                      onChange={(newVal) => handleAnswer(newVal, 'isian')}
                    />
                    <div className="p-4">
                      <label className="block text-sm font-bold text-gray-600 mb-2">Jawaban Singkat (Angka/Kata):</label>
                      <input 
                        ref={isanInputRef}
                        type="text" 
                        value={answers[key] || ''} 
                        onChange={(e) => handleAnswer(e.target.value, 'isian')} 
                        className="w-full p-4 text-xl font-mono border-2 border-indigo-200 rounded-lg focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition" 
                        placeholder="Ketik jawaban kamu di sini..."
                      />
                    </div>
                    <IsianPreview value={answers[key]} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {['A','B','C','D','E'].map((l, idx) => {
                      const isSelected = qType === 'pilihan_majemuk' ? (answers[key] || []).includes(l) : answers[key] === l;
                      return (
                        <button key={l} onClick={() => handleAnswer(l, qType)} 
                          className={`w-full text-left p-4 rounded-lg border-2 flex items-center gap-3 transition ${isSelected ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <div className={`w-8 h-8 flex items-center justify-center font-bold rounded transition ${isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                            {qType === 'pilihan_majemuk' ? (isSelected ? <CheckSquare size={18}/> : <span className="w-4 h-4 border-2 border-indigo-400 rounded-sm"></span>) : l}
                          </div>
                          <span className="flex-1 font-medium text-gray-700"><MathText>{currentQ?.options?.[idx] || ''}</MathText></span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mb-6">
                <input type="checkbox" id="doubt" checked={doubtful[key]||false} onChange={() => setDoubtful(p => ({...p, [key]: !p[key]}))} className="w-5 h-5 cursor-pointer"/>
                <label htmlFor="doubt" className="cursor-pointer font-medium text-gray-600">Ragu-ragu</label>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => setCurrentQuestion(p => p - 1)} disabled={currentQuestion === 0} className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold disabled:bg-gray-300">Kembali</button>
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