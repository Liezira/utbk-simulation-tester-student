import React, { useState, useEffect } from 'react';
import { Clock, Ticket, AlertCircle, CheckCircle, XCircle, AlertTriangle, Lock, WifiOff, ZapOff, Copyright, ShieldAlert, Timer, Trophy, Medal } from 'lucide-react';
import { db } from './firebase'; 
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

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
  const [currentTokenCode, setCurrentTokenCode] = useState(''); // Token aktif

  // Test State
  const [currentSubtestIndex, setCurrentSubtestIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState({});
  const [doubtful, setDoubtful] = useState({});
  const [testOrder, setTestOrder] = useState([]);
  const [questionOrder, setQuestionOrder] = useState({});
  const [breakTime, setBreakTime] = useState(10); 
  const [countdownTime, setCountdownTime] = useState(10);
  const [bankSoal, setBankSoal] = useState({});
  
  // Leaderboard State (FITUR BARU)
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  
  // Security State (FITUR LAMA TETAP ADA)
  const [violationReason, setViolationReason] = useState(null);

  // --- SECURITY SYSTEM (TETAP ADA) ---
  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault();
    const handleKeyDown = (e) => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || e.key === 'PrintScreen') {
        e.preventDefault();
        alert('⚠️ DILARANG: Screenshot atau Developer Tools!');
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden && screen === 'test') {
        setViolationReason("TERDETEKSI KELUAR APLIKASI / PINDAH TAB");
        setScreen('result');
      }
    };
    
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

  // --- LOGIC HANDLE RESULT & LEADERBOARD (UPDATE) ---
  useEffect(() => {
    if (screen === 'result' && currentTokenCode) {
        const finishExamProcess = async () => {
            const { totalScore } = calculateScore();
            
            try {
                // 1. UPDATE DATA SISWA (Simpan Skor & Waktu Finish)
                const tokenRef = doc(db, 'tokens', currentTokenCode);
                await updateDoc(tokenRef, { 
                    score: totalScore,
                    finalTimeLeft: timeLeft, // Waktu tersisa (semakin banyak = semakin cepat)
                    finishedAt: new Date().toISOString()
                });

                // 2. AMBIL LEADERBOARD TOP 10
                // Urutan: Skor Tertinggi -> Sisa Waktu Terbanyak
                const q = query(
                    collection(db, 'tokens'),
                    where('score', '!=', null), // Pastikan data valid
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
                    
                    // Cek ranking user saat ini
                    if (data.tokenCode === currentTokenCode) {
                        userRank = rank;
                    }
                    rank++;
                });

                setLeaderboard(top10);
                setMyRank(userRank);

            } catch (error) {
                console.error("Leaderboard Error (Cek Index Firebase):", error);
            }
        };

        finishExamProcess();
    }
  }, [screen]); 

  // --- LOGIC TOKEN LOGIN ---
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
    for (const s of SUBTESTS) {
      if ((bankSoal[s.id]?.length || 0) < s.questions) { alert(`Soal ${s.name} belum siap.`); return; }
    }
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

  // --- TIMERS ---
  useEffect(() => {
    if (screen === 'countdown' && countdownTime > 0) {
      const t = setTimeout(() => setCountdownTime(countdownTime - 1), 1000);
      return () => clearTimeout(t);
    } else if (screen === 'countdown' && countdownTime === 0) {
      startTest(true);
    }
  }, [countdownTime, screen]);

  useEffect(() => {
    if (screen === 'test' && timeLeft > 0) { const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000); return () => clearTimeout(t); }
    else if (screen === 'test' && timeLeft === 0) {
      if (currentSubtestIndex < testOrder.length - 1) { setScreen('break'); setBreakTime(10); } else setScreen('result');
    }
  }, [timeLeft, screen]);

  useEffect(() => {
    if (screen === 'break' && breakTime > 0) { const t = setTimeout(() => setBreakTime(breakTime - 1), 1000); return () => clearTimeout(t); }
    else if (screen === 'break' && breakTime === 0) {
      const n = currentSubtestIndex + 1; setCurrentSubtestIndex(n); setCurrentQuestion(0); setTimeLeft(testOrder[n].time * 60); setScreen('test');
    }
  }, [breakTime, screen]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentQuestion, currentSubtestIndex, screen]);

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
  
  const FooterLiezira = () => (
    <div className="mt-8 py-4 border-t border-gray-200 w-full text-center">
      <p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1">
        <Copyright size={12} /> {new Date().getFullYear()} Created by <span className="font-bold text-indigo-400">Liezira</span>
      </p>
    </div>
  );

  // --- UI SCREENS ---

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
            <ul className="list-disc pl-4 space-y-1 font-semibold"><li>DILARANG PINDAH TAB.</li><li>DILARANG MINIMIZE.</li><li>Pelanggaran = <span className="underline">DISKUALIFIKASI</span>.</li></ul>
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
    const { totalScore } = calculateScore();

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

          {/* --- LEADERBOARD SECTION (FITUR BARU) --- */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-4">
                <Trophy className="text-yellow-600" size={24} />
                <h3 className="text-lg font-bold text-indigo-900">🏆 Top 10 Leaderboard</h3>
            </div>

            {leaderboard.length === 0 ? (
                <p className="text-gray-500 text-center italic py-4">Memuat peringkat...</p>
            ) : (
                <div className="overflow-hidden rounded-lg border border-indigo-100 shadow-sm">
                    <table className="min-w-full bg-white text-sm">
                        <thead className="bg-indigo-100 text-indigo-700">
                            <tr>
                                <th className="py-3 px-4 text-left">#</th>
                                <th className="py-3 px-4 text-left">Nama Siswa</th>
                                <th className="py-3 px-4 text-center">Skor</th>
                                <th className="py-3 px-4 text-center">Sisa Waktu</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-indigo-50">
                            {leaderboard.map((item, index) => (
                                <tr key={index} className={`${item.name === studentName ? 'bg-yellow-50 font-bold border-l-4 border-yellow-400' : 'hover:bg-gray-50'}`}>
                                    <td className="py-2 px-4">
                                        {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank}
                                    </td>
                                    <td className="py-2 px-4">{item.name} {item.name === studentName && '(Kamu)'}</td>
                                    <td className="py-2 px-4 text-center text-indigo-600">{item.score}</td>
                                    <td className="py-2 px-4 text-center text-gray-500 font-mono">{formatTime(item.timeLeft)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            <div className="mt-4 text-center">
                {myRank ? (
                    <div className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full font-bold text-sm border border-green-200">
                        🎉 Hebat! Kamu peringkat {myRank} dari seluruh peserta.
                    </div>
                ) : (
                    <div className="inline-block bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm border border-gray-200">
                        Kamu belum masuk Top 10. Tetap semangat!
                    </div>
                )}
            </div>
          </div>
          {/* ------------------------------------- */}

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
