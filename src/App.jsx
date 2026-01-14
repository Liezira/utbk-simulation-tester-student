import React, { useState, useEffect, useRef } from 'react';
import { Clock, Ticket, AlertCircle, CheckCircle, XCircle, ShieldAlert, Timer, Trophy, Copyright, CheckSquare, AlignLeft, List } from 'lucide-react';
import { db } from './firebase'; 
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

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
  const [countdownTime, setCountdownTime] = useState(10);
  const [bankSoal, setBankSoal] = useState({});
  
  // Global & Leaderboard
  const [globalStartTime, setGlobalStartTime] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [violationReason, setViolationReason] = useState(null);

  // REFS (PENTING UNTUK EVENT LISTENER)
  const screenRef = useRef(screen); // Menyimpan status screen terbaru
  const timerRef = useRef(null);

  // Update screenRef setiap kali screen berubah
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // --- SECURITY SYSTEM (ULTIMATE FIX) ---
  useEffect(() => {
    // Fungsi Eksekusi Pelanggaran
    const forceSubmit = (reason) => {
        // Cek lewat Ref biar datanya selalu FRESH
        if (screenRef.current === 'test') {
            setViolationReason(reason);
            setScreen('result');
            
            // Keluar fullscreen biar user sadar
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        }
    };

    // 1. Deteksi Pindah Tab (Visibility Change)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        forceSubmit("DISKUALIFIKASI: Pindah Tab / Minimize Terdeteksi.");
      }
    };

    // 2. Deteksi Keluar Fullscreen (Tombol ESC)
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && screenRef.current === 'test') {
        forceSubmit("DISKUALIFIKASI: Keluar dari Mode Fullscreen.");
      }
    };

    // 3. Deteksi Kehilangan Fokus (Klik aplikasi lain di Desktop)
    const handleBlur = () => {
      // Hanya trigger jika sedang ujian
      if (screenRef.current === 'test') {
         forceSubmit("DISKUALIFIKASI: Fokus Layar Hilang (Multitasking).");
      }
    };

    // 4. Blokir Tombol Terlarang
    const handleKeyDown = (e) => {
      if (
          e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && e.key === 'I') || 
          e.key === 'PrintScreen' || 
          (e.altKey && e.key === 'Tab') || // Alt+Tab
          (e.metaKey) || // Tombol Windows/Command
          (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        alert('⚠️ PERINGATAN: Tombol Dilarang!');
      }
    };

    const handleContextMenu = (e) => e.preventDefault();

    // Pasang Event Listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleBlur); // Extra proteksi desktop
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []); 

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

  // --- LOGIC RESULT & GLOBAL SCORING ---
  useEffect(() => {
    if (screen === 'result' && currentTokenCode) {
        if (timerRef.current) clearInterval(timerRef.current);

        const finishExamProcess = async () => {
            const { totalScore } = calculateScore();
            
            const totalAllocatedMinutes = SUBTESTS.reduce((acc, curr) => acc + curr.time, 0);
            const totalAllocatedMS = totalAllocatedMinutes * 60 * 1000;
            const usedTimeMS = globalStartTime ? (Date.now() - globalStartTime) : totalAllocatedMS;
            const globalTimeLeftSeconds = Math.max(0, Math.floor((totalAllocatedMS - usedTimeMS) / 1000));

            try {
                const tokenRef = doc(db, 'tokens', currentTokenCode);
                await updateDoc(tokenRef, { 
                    score: totalScore,
                    finalTimeLeft: globalTimeLeftSeconds,
                    finishedAt: new Date().toISOString(),
                    violation: violationReason || null 
                });

                const q = query(
                    collection(db, 'tokens'),
                    where('score', '!=', null),
                    orderBy('score', 'desc'),
                    orderBy('finalTimeLeft', 'desc'),
                    limit(10)
                );

                const querySnapshot = await getDocs(q);
                const top10 = [];
                let rank = 1;
                let userRank = null;

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    top10.push({
                        rank: rank,
                        name: data.studentName,
                        score: data.score,
                        timeLeft: data.finalTimeLeft 
                    });
                    if (data.tokenCode === currentTokenCode) userRank = rank;
                    rank++;
                });

                setLeaderboard(top10);
                setMyRank(userRank);
            } catch (error) { console.error("Leaderboard Error:", error); }
        };
        finishExamProcess();
    }
  }, [screen]); 

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
        setCurrentTokenCode(tokenCode);
        setViolationReason(null);
        try { await document.documentElement.requestFullscreen(); } catch (err) { console.log("Fullscreen blocked"); }
        setCountdownTime(10); 
        setScreen('countdown'); 
      }
    } catch (error) { console.error(error); alert('Koneksi Error.'); }
  };

  const startTest = (bypass = false) => {
    if (!bypass) return;
    if (!globalStartTime) setGlobalStartTime(Date.now()); 

    for (const s of SUBTESTS) { if ((bankSoal[s.id]?.length || 0) < s.questions) { alert(`Soal ${s.name} belum siap.`); return; } }
    
    const shuffled = [...SUBTESTS].sort(() => Math.random() - 0.5);
    setTestOrder(shuffled);
    const qOrder = {};
    shuffled.forEach((subtest) => {
      const bank = [...(bankSoal[subtest.id] || [])];
      qOrder[subtest.id] = bank.sort(() => Math.random() - 0.5).slice(0, subtest.questions);
    });
    setQuestionOrder(qOrder);
    
    setCurrentSubtestIndex(0); 
    setCurrentQuestion(0); 
    setAnswers({}); 
    setDoubtful({}); 
    
    // Timer Realtime Setup
    const durationSec = shuffled[0].time * 60;
    const targetTime = Date.now() + (durationSec * 1000);
    setEndTime(targetTime);
    setTimeLeft(durationSec);
    
    setScreen('test');
  };

  // --- TIMER ENGINE (ANTI FREEZE) ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (screen === 'test' && endTime) {
        timerRef.current = setInterval(() => {
            const now = Date.now();
            const delta = Math.floor((endTime - now) / 1000); 

            if (delta <= 0) {
                clearInterval(timerRef.current);
                setTimeLeft(0);
                if (currentSubtestIndex < testOrder.length - 1) {
                    setScreen('break');
                    setBreakTime(10);
                } else {
                    setScreen('result');
                }
            } else {
                setTimeLeft(delta); 
            }
        }, 1000);
    }
    
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, endTime, currentSubtestIndex, testOrder]);

  // --- COUNTDOWN & BREAK ---
  useEffect(() => { 
      if (screen === 'countdown' && countdownTime > 0) { 
          const t = setTimeout(() => setCountdownTime(countdownTime - 1), 1000); 
          return () => clearTimeout(t); 
      } else if (screen === 'countdown' && countdownTime === 0) { 
          startTest(true); 
      } 
  }, [countdownTime, screen]);

  useEffect(() => { 
      if (screen === 'break' && breakTime > 0) { 
          const t = setTimeout(() => setBreakTime(breakTime - 1), 1000); 
          return () => clearTimeout(t); 
      } else if (screen === 'break' && breakTime === 0) { 
          const n = currentSubtestIndex + 1; 
          setCurrentSubtestIndex(n); 
          setCurrentQuestion(0); 
          
          const durationSec = testOrder[n].time * 60;
          const targetTime = Date.now() + (durationSec * 1000);
          setEndTime(targetTime);
          setTimeLeft(durationSec);
          
          setScreen('test'); 
      } 
  }, [breakTime, screen]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentQuestion, currentSubtestIndex, screen]);
  
  // --- HANDLE ANSWER (LOGIKA BARU MULTI-TYPE) ---
  const handleAnswer = (val, type) => { 
      const k = `${testOrder[currentSubtestIndex].id}_${currentQuestion}`;
      
      if (type === 'pilihan_majemuk') {
          // Logic Checkbox (Array)
          let current = answers[k] || [];
          if (current.includes(val)) current = current.filter(x => x !== val);
          else current.push(val);
          setAnswers(p => ({ ...p, [k]: current }));
      } else {
          // Logic Radio / Text (Single Value)
          setAnswers(p => ({ ...p, [k]: val })); 
      }
  };

  // --- SCORING SYSTEM (LOGIKA BARU MULTI-TYPE) ---
  const calculateScore = () => { 
      const sc = {}; let tot = 0; 
      testOrder.forEach(s => { 
          let sub = 0; 
          questionOrder[s.id].forEach((q, i) => { 
              const k = `${s.id}_${i}`; 
              const ans = answers[k];
              
              // Cek Kosong
              if (!ans || (Array.isArray(ans) && ans.length === 0) || (typeof ans === 'string' && ans.trim() === '')) {
                  sub -= 1; // Poin Kosong
              } else {
                  let isCorrect = false;
                  
                  if (q.type === 'pilihan_majemuk') {
                      // Array Comparison (Harus sama persis isinya)
                      if (Array.isArray(ans) && Array.isArray(q.correct)) {
                          const sortedAns = [...ans].sort().join(',');
                          const sortedKey = [...q.correct].sort().join(',');
                          isCorrect = (sortedAns === sortedKey);
                      }
                  } else if (q.type === 'isian') {
                      // String Comparison (Case Insensitive)
                      if (ans.toString().toLowerCase().trim() === q.correct.toString().toLowerCase().trim()) {
                          isCorrect = true;
                      }
                  } else {
                      // Pilihan Ganda Biasa
                      isCorrect = (ans === q.correct);
                  }

                  if (isCorrect) sub += 4; else sub += 0; // Benar +4, Salah 0
              }
          }); 
          sc[s.id] = sub; tot += sub; 
      }); 
      return { scores: sc, totalScore: tot }; 
  };

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
  
  // Navigasi Tanpa Popup
  const handleNextQuestion = () => {
    if (currentQuestion < currentSubtest.questions - 1) {
        setCurrentQuestion(currentQuestion + 1);
    } else {
        if (currentSubtestIndex < testOrder.length - 1) {
             setScreen('break'); 
             setBreakTime(10); 
        } else {
             setScreen('result');
        }
    }
  };

  const FooterLiezira = () => (
    <div className="mt-8 py-4 border-t border-gray-200 w-full text-center">
      <p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1">
        <Copyright size={12} /> {new Date().getFullYear()} Created by <span className="font-bold text-indigo-400">Liezira</span>
      </p>
    </div>
  );

  // --- UI RENDER ---

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
              <li className="flex justify-between bg-green-50 px-2 py-1 rounded border border-green-100"><span className="flex gap-2 items-center"><CheckCircle size={16} className="text-green-600"/>Benar</span><span className="font-bold text-green-700">+4</span></li>
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
    const { scores, totalScore } = calculateScore();
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex justify-center items-center select-none overflow-y-auto">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-4xl w-full text-center my-8">
          <h1 className="text-3xl font-bold mb-2 text-indigo-900">Hasil Ujian</h1>
          <h2 className="text-xl text-gray-600 mb-4 font-medium">{studentName}</h2>
          
          {violationReason && (
            <div className="bg-red-100 border-2 border-red-400 text-red-800 p-4 rounded-lg mb-6 font-bold animate-pulse">
               <div className="flex items-center justify-center gap-2 text-lg"><ShieldAlert size={24} /> UJIAN DIHENTIKAN OTOMATIS</div>
               <p className="text-sm font-normal mt-1">Alasan: {violationReason}</p>
            </div>
          )}

          <div className="mb-8"><span className="text-sm text-gray-400 uppercase font-bold">Total Skor</span><div className="text-7xl font-extrabold text-indigo-600 mt-2">{totalScore}</div></div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8 text-left">
            {SUBTESTS.map((s) => (
                <div key={s.id} className="bg-gray-50 border border-gray-200 p-3 rounded-lg flex justify-between items-center shadow-sm hover:bg-gray-100 transition">
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{s.name}</span>
                    <span className={`text-lg font-bold font-mono ${scores[s.id] < 0 ? 'text-red-500' : 'text-indigo-600'}`}>{scores[s.id]}</span>
                </div>
            ))}
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-4"><Trophy className="text-yellow-600" size={24} /><h3 className="text-lg font-bold text-indigo-900">🏆 Top 10 Leaderboard</h3></div>
            {leaderboard.length === 0 ? (<p className="text-gray-500 text-center italic py-4">Memuat peringkat...</p>) : (
                <div className="overflow-hidden rounded-lg border border-indigo-100 shadow-sm"><table className="min-w-full bg-white text-sm"><thead className="bg-indigo-100 text-indigo-700"><tr><th className="py-3 px-4 text-left">#</th><th className="py-3 px-4 text-left">Nama Siswa</th><th className="py-3 px-4 text-center">Skor</th><th className="py-3 px-4 text-center">Sisa Waktu Global</th></tr></thead><tbody className="divide-y divide-indigo-50">{leaderboard.map((item, index) => (<tr key={index} className={`${item.name === studentName ? 'bg-yellow-50 font-bold border-l-4 border-yellow-400' : 'hover:bg-gray-50'}`}><td className="py-2 px-4">{item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank}</td><td className="py-2 px-4">{item.name} {item.name === studentName && '(Kamu)'}</td><td className="py-2 px-4 text-center text-indigo-600">{item.score}</td><td className="py-2 px-4 text-center text-gray-500 font-mono">{formatTime(item.timeLeft)}</td></tr>))}</tbody></table></div>)}
            <div className="mt-4 text-center">{myRank ? (<div className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full font-bold text-sm border border-green-200">🎉 Hebat! Kamu peringkat {myRank} dari seluruh peserta.</div>) : (<div className="inline-block bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm border border-gray-200">Kamu belum masuk Top 10. Tetap semangat!</div>)}</div>
          </div>

          <div className="border-t pt-6"><button onClick={() => { document.exitFullscreen().catch(()=>{}); setScreen('landing'); setInputToken(''); setStudentName(''); }} className="w-full md:w-1/2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg">Selesai / Logout</button><FooterLiezira /></div>
        </div>
      </div>
    );
  }

  const currentSubtest = testOrder[currentSubtestIndex];
  if (!currentSubtest || !questionOrder[currentSubtest.id]) return <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div><p>Memuat soal...</p></div>;
  const currentQ = questionOrder[currentSubtest.id][currentQuestion];
  const key = `${currentSubtest.id}_${currentQuestion}`;
  const qType = currentQ.type || 'pilihan_ganda'; // Default type jika data lama

  return (
    <div className="min-h-screen w-full bg-gray-50 select-none pb-10">
      <div className="sticky top-0 z-40 bg-indigo-700 text-white p-4 shadow-lg"><div className="max-w-6xl mx-auto flex justify-between items-center"><div><h2 className="text-xl font-bold">{currentSubtest.name}</h2><p className="text-sm text-indigo-200">Soal {currentQuestion + 1} / {currentSubtest.questions}</p></div><div className="flex items-center gap-3 bg-indigo-800 px-6 py-3 rounded-lg"><Clock size={24} /><span className="text-2xl font-bold">{formatTime(timeLeft)}</span></div></div></div>
      <div className="max-w-6xl mx-auto p-6"><div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* NAVIGASI KIRI */}
          <div className="lg:col-span-1"><div className="bg-white rounded-lg shadow p-4 sticky top-24"><h3 className="font-semibold text-gray-700 mb-3">Navigasi</h3><div className="grid grid-cols-5 gap-2">{Array.from({ length: currentSubtest.questions }).map((_, idx) => { const qKey = `${currentSubtest.id}_${idx}`; const isAnswered = answers[qKey] && (Array.isArray(answers[qKey]) ? answers[qKey].length > 0 : true); return (<button key={idx} onClick={() => setCurrentQuestion(idx)} className={`w-10 h-10 rounded font-semibold ${idx === currentQuestion ? 'bg-indigo-600 text-white' : isAnswered ? (doubtful[qKey]?'bg-yellow-400 text-white':'bg-green-500 text-white') : 'bg-gray-200'}`}>{idx + 1}</button>); })}</div></div></div>
          
          {/* AREA SOAL KANAN */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
              
              <div className="mb-8">
                {/* Badge Tipe Soal */}
                <div className="mb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex w-fit items-center gap-1">
                        {qType === 'pilihan_majemuk' ? <CheckSquare size={12}/> : qType === 'isian' ? <AlignLeft size={12}/> : <List size={12}/>} 
                        {qType.replace('_', ' ')}
                    </span>
                </div>

                {/* Teks Soal */}
                <div className="text-lg text-gray-800 leading-loose whitespace-pre-wrap font-medium mb-6 text-justify">
                    <Latex>{currentQ?.question}</Latex>
                </div>
                
                {/* Gambar Soal */}
                {currentQ?.image && (<div className="flex justify-center my-6"><img src={currentQ.image} alt="Soal Visual" className="max-w-full h-auto max-h-[400px] object-contain rounded-lg shadow-md border border-gray-100" onContextMenu={e=>e.preventDefault()} /></div>)}
              </div>

              {/* RENDER OPSI JAWABAN (Dynamic Switch) */}
              <div className="mb-8">
                  {qType === 'isian' ? (
                      /* --- TIPE ISIAN --- */
                      <div className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300">
                          <label className="block text-sm font-bold text-gray-600 mb-2">Jawaban Singkat (Angka/Kata):</label>
                          <input 
                            type="text" 
                            value={answers[key] || ''} 
                            onChange={(e) => handleAnswer(e.target.value, 'isian')} 
                            className="w-full p-4 text-xl font-mono border-2 border-indigo-200 rounded-lg focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition"
                            placeholder="Ketik jawaban kamu di sini..." 
                          />
                      </div>
                  ) : (
                      /* --- TIPE PILIHAN GANDA & MAJEMUK --- */
                      <div className="space-y-3">
                        {['A', 'B', 'C', 'D', 'E'].map((l, idx) => {
                            const isSelected = qType === 'pilihan_majemuk' 
                                ? (answers[key] || []).includes(l)
                                : answers[key] === l;
                            
                            return (
                              <button key={l} onClick={() => handleAnswer(l, qType)} className={`w-full text-left p-4 rounded-lg border-2 flex items-center gap-3 transition ${isSelected ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <div className={`w-8 h-8 flex items-center justify-center font-bold rounded transition ${isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                                    {qType === 'pilihan_majemuk' ? (isSelected ? <CheckSquare size={18}/> : <span className="w-4 h-4 border-2 border-indigo-400 rounded-sm"></span>) : l}
                                </div>
                                <span className="flex-1 font-medium text-gray-700"><Latex>{currentQ?.options[idx] || ''}</Latex></span>
                              </button>
                            );
                        })}
                      </div>
                  )}
              </div>

              <div className="flex items-center gap-3 mb-6"><input type="checkbox" id="doubt" checked={doubtful[key]||false} onChange={()=>setDoubtful(p=>({...p,[key]:!p[key]}))} className="w-5 h-5 cursor-pointer" /><label htmlFor="doubt" className="cursor-pointer font-medium text-gray-600">Ragu-ragu</label></div>
              
              <div className="flex gap-3">
                <button onClick={() => setCurrentQuestion(currentQuestion - 1)} disabled={currentQuestion === 0} className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold disabled:bg-gray-300">Kembali</button>
                <button onClick={handleNextQuestion} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Selanjutnya</button>
              </div>

            </div>
          </div>
      </div></div>
    </div>
  );
};

export default UTBKStudentApp;