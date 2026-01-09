import React, { useState, useEffect } from 'react';
import { Clock, Ticket, AlertCircle, CheckCircle, XCircle, AlertTriangle, Lock, WifiOff, ZapOff, Copyright } from 'lucide-react';
import { db } from './firebase'; 
import { doc, getDoc, updateDoc } from 'firebase/firestore';

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

  // Test State
  const [currentSubtestIndex, setCurrentSubtestIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState({});
  const [doubtful, setDoubtful] = useState({});
  const [testOrder, setTestOrder] = useState([]);
  const [questionOrder, setQuestionOrder] = useState({});
  const [breakTime, setBreakTime] = useState(10); 
  const [bankSoal, setBankSoal] = useState({});
  
  // Security State
  const [isViolation, setIsViolation] = useState(false);
  const [violationMsg, setViolationMsg] = useState('');

  // --- SECURITY SYSTEM ---
  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault();
    const handleKeyDown = (e) => {
      if (
        e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && e.key === 'I') || 
        (e.ctrlKey && e.key === 'u') ||
        e.key === 'PrintScreen'
      ) {
        e.preventDefault();
        alert('⚠️ DILARANG: Screenshot atau Developer Tools!');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && screen === 'test') {
        setIsViolation(true);
        setViolationMsg('ANDA TERDETEKSI PINDAH TAB! KEMBALI KE UJIAN SEKARANG.');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && screen === 'test') {
        setIsViolation(true);
        setViolationMsg('DILARANG KELUAR DARI MODE LAYAR PENUH (FULLSCREEN).');
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [screen]);

  // Load Bank Soal
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

  // --- LOGIC VALIDASI TOKEN ---
  const handleTokenLogin = async () => {
    if (!inputToken.trim()) { alert('Masukkan Kode Token!'); return; }
    const tokenCode = inputToken.trim().toUpperCase();
    const docRef = doc(db, 'tokens', tokenCode);

    try {
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) { alert('Token TIDAK DITEMUKAN.'); return; }
      
      const data = docSnap.data();
      if ((Date.now() - new Date(data.createdAt).getTime()) > 24 * 60 * 60 * 1000) { alert('Token EXPIRED.'); return; }
      if (data.status === 'used') { alert(`Halo ${data.studentName}, token SUDAH TERPAKAI.`); return; }

      if (confirm(`Login sebagai ${data.studentName}?`)) {
        await updateDoc(docRef, { status: 'used', loginAt: new Date().toISOString() });
        setStudentName(data.studentName);
        startTest(true);
      }
    } catch (error) { console.error(error); alert('Koneksi Error.'); }
  };

  const startTest = async (bypass = false) => {
    if (!bypass) return;
    for (const s of SUBTESTS) {
      if ((bankSoal[s.id]?.length || 0) < s.questions) { alert(`Soal ${s.name} belum siap.`); return; }
    }
    try { await document.documentElement.requestFullscreen(); } catch (err) {}

    const shuffled = [...SUBTESTS].sort(() => Math.random() - 0.5);
    setTestOrder(shuffled);
    const qOrder = {};
    shuffled.forEach((subtest) => {
      const bank = [...(bankSoal[subtest.id] || [])];
      qOrder[subtest.id] = bank.sort(() => Math.random() - 0.5).slice(0, subtest.questions);
    });
    setQuestionOrder(qOrder);
    setCurrentSubtestIndex(0); setCurrentQuestion(0); setTimeLeft(shuffled[0].time * 60);
    setAnswers({}); setDoubtful({}); setScreen('test');
  };

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentQuestion, currentSubtestIndex, screen]);

  useEffect(() => {
    if (screen === 'test' && !isViolation && timeLeft > 0) { const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000); return () => clearTimeout(t); }
    else if (screen === 'test' && timeLeft === 0) {
      if (currentSubtestIndex < testOrder.length - 1) { setScreen('break'); setBreakTime(10); } else setScreen('result');
    }
  }, [timeLeft, screen, isViolation]);

  useEffect(() => {
    if (screen === 'break' && breakTime > 0) { const t = setTimeout(() => setBreakTime(breakTime - 1), 1000); return () => clearTimeout(t); }
    else if (screen === 'break' && breakTime === 0) {
      const n = currentSubtestIndex + 1; setCurrentSubtestIndex(n); setCurrentQuestion(0); setTimeLeft(testOrder[n].time * 60); setScreen('test');
    }
  }, [breakTime, screen]);

  const handleAnswer = (val) => { const k = `${testOrder[currentSubtestIndex].id}_${currentQuestion}`; setAnswers(p => ({ ...p, [k]: val })); };
  
  const calculateScore = () => {
    const sc = {}; let tot = 0;
    testOrder.forEach(s => {
      let sub = 0; questionOrder[s.id].forEach((q, i) => { const k = `${s.id}_${i}`; if (!answers[k]) sub -= 1; else if (answers[k] === q.correct) sub += 4; });
      sc[s.id] = sub; tot += sub;
    });
    return { scores: sc, totalScore: tot };
  };

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
  const resumeTest = async () => { try { await document.documentElement.requestFullscreen(); setIsViolation(false); } catch (e) { setIsViolation(false); } };

  // --- UI COMPONENTS ---
  // Footer Component (Liezira Branding)
  const FooterLiezira = () => (
    <div className="mt-8 py-4 border-t border-gray-200 w-full text-center">
      <p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1">
        <Copyright size={12} /> {new Date().getFullYear()} Created by <span className="font-bold text-indigo-400">Liezira</span>
      </p>
    </div>
  );

  if (isViolation && screen === 'test') {
    return (
        <div className="min-h-screen bg-red-600 flex flex-col items-center justify-center text-white p-8 z-50 fixed top-0 left-0 w-full h-full text-center">
            <AlertTriangle size={80} className="mb-4 animate-bounce" />
            <h1 className="text-4xl font-bold mb-4">PELANGGARAN!</h1>
            <p className="text-xl mb-8 font-medium">{violationMsg}</p>
            <button onClick={resumeTest} className="bg-white text-red-600 px-8 py-4 rounded-xl font-bold">KEMBALI KE UJIAN</button>
        </div>
    );
  }

  if (screen === 'landing') {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full relative text-center my-8">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          <h1 className="text-2xl font-bold text-indigo-900 mb-1">Sistem Test UTBK SNBT</h1>
          <p className="text-gray-500 mb-6 text-sm">Platform Ujian Berbasis Token Aman</p>

          {/* DISCLAIMER BOX */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-left text-xs text-yellow-800">
            <div className="font-bold flex items-center gap-2 mb-1 text-yellow-900"><AlertTriangle size={14}/> DISCLAIMER PESERTA:</div>
            <p className="mb-2">Kendala teknis di luar sistem (Server Down/Error) adalah tanggung jawab peserta, meliputi:</p>
            <ul className="list-disc pl-4 space-y-1">
               <li><span className="flex items-center gap-1"><ZapOff size={10}/> Mati Listrik / Baterai Habis</span></li>
               <li><span className="flex items-center gap-1"><WifiOff size={10}/> Sinyal Hilang / Kuota Habis</span></li>
               <li>Device/HP Error atau Layar Pecah</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 text-left shadow-sm">
            <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2"><AlertCircle size={16} className="text-indigo-600"/> Poin Penilaian:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex justify-between bg-green-50 px-2 py-1 rounded"><span className="flex gap-2"><CheckCircle size={16} className="text-green-600"/>Benar</span><span className="font-bold text-green-700">+4</span></li>
              <li className="flex justify-between bg-red-50 px-2 py-1 rounded"><span className="flex gap-2"><XCircle size={16} className="text-red-500"/>Salah</span><span className="font-bold text-red-700">0</span></li>
              <li className="flex justify-between bg-orange-50 px-2 py-1 rounded"><span className="flex gap-2"><AlertCircle size={16} className="text-orange-500"/>Kosong</span><span className="font-bold text-orange-700">-1</span></li>
            </ul>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl mb-6">
            <label className="block text-indigo-900 font-bold mb-2 text-sm flex items-center justify-center gap-2"><Ticket size={18}/> Kode Token:</label>
            <input type="text" value={inputToken} onChange={e => setInputToken(e.target.value.toUpperCase())} className="w-full px-4 py-3 border-2 border-indigo-200 rounded-lg text-xl font-mono text-center tracking-widest uppercase outline-none focus:ring-4 focus:ring-indigo-100 bg-white" placeholder="UTBK-XXXXXX" />
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
            <div className="text-center">
              <span className="block text-7xl font-bold text-indigo-700">{breakTime}</span>
              <span className="text-indigo-400 text-sm font-bold uppercase tracking-wider">Detik</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400 font-medium tracking-wide">LANJUT OTOMATIS...</p>
      </div>
    );
  }
  
  if (screen === 'result') {
    const { scores, totalScore } = calculateScore();
    const leftSubtests = SUBTESTS.slice(0, 4);
    const rightSubtests = SUBTESTS.slice(4, 7);

    return (
      <div className="min-h-screen bg-gray-50 p-8 flex justify-center items-center select-none overflow-y-auto">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-4xl w-full text-center my-8">
          <h1 className="text-3xl font-bold mb-2 text-indigo-900">Hasil Ujian</h1>
          <h2 className="text-xl text-gray-600 mb-6 font-medium">{studentName}</h2>
          <div className="mb-8"><span className="text-sm text-gray-400 uppercase font-bold">Total Skor</span><div className="text-7xl font-extrabold text-indigo-600 mt-2">{totalScore}</div></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-left">
            <div className="space-y-3">{leftSubtests.map(sub => (<div key={sub.id} className="flex justify-between p-4 bg-gray-50 border rounded-lg"><span className="text-gray-700 font-semibold text-sm">{sub.name}</span><span className={`font-bold text-lg ${scores[sub.id]>=0?'text-indigo-600':'text-red-500'}`}>{scores[sub.id]}</span></div>))}</div>
            <div className="space-y-3">{rightSubtests.map(sub => (<div key={sub.id} className="flex justify-between p-4 bg-gray-50 border rounded-lg"><span className="text-gray-700 font-semibold text-sm">{sub.name}</span><span className={`font-bold text-lg ${scores[sub.id]>=0?'text-indigo-600':'text-red-500'}`}>{scores[sub.id]}</span></div>))}</div>
          </div>

          <div className="border-t pt-6">
            <button onClick={() => { document.exitFullscreen().catch(()=>{}); setScreen('landing'); setInputToken(''); setStudentName(''); }} className="w-full md:w-1/2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg">Selesai / Logout</button>
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

  return (
    <div className="min-h-screen w-full bg-gray-50 select-none pb-10">
      <div className="sticky top-0 z-40 bg-indigo-700 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div><h2 className="text-xl font-bold">{currentSubtest.name}</h2><p className="text-sm text-indigo-200">Soal {currentQuestion + 1} / {currentSubtest.questions}</p></div>
          <div className="flex items-center gap-3 bg-indigo-800 px-6 py-3 rounded-lg"><Clock size={24} /><span className="text-2xl font-bold">{formatTime(timeLeft)}</span></div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h3 className="font-semibold text-gray-700 mb-3">Navigasi</h3>
              <div className="grid grid-cols-5 gap-2">{Array.from({ length: currentSubtest.questions }).map((_, idx) => { const qKey = `${currentSubtest.id}_${idx}`; return (<button key={idx} onClick={() => setCurrentQuestion(idx)} className={`w-10 h-10 rounded font-semibold ${idx === currentQuestion ? 'bg-indigo-600 text-white' : answers[qKey] ? (doubtful[qKey]?'bg-yellow-400 text-white':'bg-green-500 text-white') : 'bg-gray-200'}`}>{idx + 1}</button>); })}</div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
              <div className="mb-6"><p className="text-lg font-medium text-gray-800 mb-4 leading-relaxed">{currentQ?.question}</p>{currentQ?.image && <img src={currentQ.image} alt="Soal" className="max-w-full rounded-lg shadow mb-4" onContextMenu={e=>e.preventDefault()} />}</div>
              <div className="space-y-3 mb-6">{['A', 'B', 'C', 'D', 'E'].map((l, idx) => (<button key={l} onClick={() => handleAnswer(l)} className={`w-full text-left p-4 rounded-lg border-2 flex items-center gap-3 ${answers[key]===l?'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600':'border-gray-200 hover:bg-gray-50'}`}><span className={`w-8 h-8 flex items-center justify-center font-bold rounded ${answers[key]===l?'bg-indigo-600 text-white':'bg-indigo-100 text-indigo-700'}`}>{l}</span><span className="flex-1">{currentQ?.options[idx]}</span></button>))}</div>
              <div className="flex items-center gap-3 mb-6"><input type="checkbox" id="doubt" checked={doubtful[key]||false} onChange={()=>setDoubtful(p=>({...p,[key]:!p[key]}))} className="w-5 h-5" /><label htmlFor="doubt">Ragu-ragu</label></div>
              <div className="flex gap-3"><button onClick={() => setCurrentQuestion(currentQuestion - 1)} disabled={currentQuestion === 0} className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold disabled:bg-gray-300">Kembali</button><button onClick={() => { if (currentQuestion < currentSubtest.questions - 1) setCurrentQuestion(currentQuestion + 1); else if (confirm('Lanjut subtest?')) { if (currentSubtestIndex < testOrder.length - 1) { setScreen('break'); setBreakTime(10); } else setScreen('result'); } }} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Selanjutnya</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UTBKStudentApp;
