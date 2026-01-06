import React, { useState, useEffect } from 'react';
import { Clock, Ticket, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
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
  const [breakTime, setBreakTime] = useState(10); // Default 10s
  const [bankSoal, setBankSoal] = useState({});

  // Load Bank Soal (Read Only)
  useEffect(() => {
    const loadBankSoal = async () => {
      const loaded = {};
      for (const subtest of SUBTESTS) {
        try {
          const docRef = doc(db, 'bank_soal', subtest.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) loaded[subtest.id] = docSnap.data().questions;
          else loaded[subtest.id] = [];
        } catch (error) {
          console.error('Gagal load DB:', error);
          loaded[subtest.id] = [];
        }
      }
      setBankSoal(loaded);
    };
    loadBankSoal();
  }, []);

  // --- LOGIC VALIDASI TOKEN ---
  const handleTokenLogin = async () => {
    if (!inputToken.trim()) {
      alert('Masukkan Kode Token!');
      return;
    }
    const tokenCode = inputToken.trim().toUpperCase();
    const docRef = doc(db, 'tokens', tokenCode);

    try {
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        alert('Token TIDAK DITEMUKAN.');
        return;
      }

      const data = docSnap.data();
      const createdTime = new Date(data.createdAt).getTime();
      const now = Date.now();

      if (now - createdTime > 24 * 60 * 60 * 1000) {
        alert('Token EXPIRED (24 Jam).');
        return;
      }
      if (data.status === 'used') {
        alert(`Halo ${data.studentName}, token SUDAH TERPAKAI.`);
        return;
      }

      if (confirm(`Login sebagai ${data.studentName}? Token akan dikunci.`)) {
        await updateDoc(docRef, {
          status: 'used',
          loginAt: new Date().toISOString(),
        });
        setStudentName(data.studentName);
        startTest(true);
      }
    } catch (error) {
      console.error(error);
      alert('Terjadi kesalahan koneksi.');
    }
  };

  const startTest = (bypass = false) => {
    if (!bypass) return;

    // Cek Ketersediaan Soal
    for (const s of SUBTESTS) {
      if ((bankSoal[s.id]?.length || 0) < s.questions) {
        alert(`Sistem sedang maintenance (Soal ${s.name} belum siap).`);
        return;
      }
    }

    const shuffled = [...SUBTESTS].sort(() => Math.random() - 0.5);
    setTestOrder(shuffled);
    const qOrder = {};
    shuffled.forEach((subtest) => {
      const bank = [...(bankSoal[subtest.id] || [])];
      qOrder[subtest.id] = bank
        .sort(() => Math.random() - 0.5)
        .slice(0, subtest.questions);
    });

    setQuestionOrder(qOrder);
    setCurrentSubtestIndex(0);
    setCurrentQuestion(0);
    setTimeLeft(shuffled[0].time * 60);
    setAnswers({});
    setDoubtful({});
    setScreen('test');
  };

  // Auto Scroll Top
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentQuestion, currentSubtestIndex, screen]);

  // Timers Main
  useEffect(() => {
    if (screen === 'test' && timeLeft > 0) {
      const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(t);
    } else if (screen === 'test' && timeLeft === 0) {
      if (currentSubtestIndex < testOrder.length - 1) {
        setScreen('break');
        setBreakTime(10); // Ubah jadi 10 Detik
      } else setScreen('result');
    }
  }, [timeLeft, screen]);

  // Timer Break
  useEffect(() => {
    if (screen === 'break' && breakTime > 0) {
      const t = setTimeout(() => setBreakTime(breakTime - 1), 1000);
      return () => clearTimeout(t);
    } else if (screen === 'break' && breakTime === 0) {
      const n = currentSubtestIndex + 1;
      setCurrentSubtestIndex(n);
      setCurrentQuestion(0);
      setTimeLeft(testOrder[n].time * 60);
      setScreen('test');
    }
  }, [breakTime, screen]);

  const handleAnswer = (val) => {
    const k = `${testOrder[currentSubtestIndex].id}_${currentQuestion}`;
    setAnswers((p) => ({ ...p, [k]: val }));
  };

  const calculateScore = () => {
    const sc = {};
    let tot = 0;
    testOrder.forEach((s) => {
      let sub = 0;
      questionOrder[s.id].forEach((q, i) => {
        const k = `${s.id}_${i}`;
        if (!answers[k]) sub -= 1;
        else if (answers[k] === q.correct) sub += 4;
      });
      sc[s.id] = sub;
      tot += sub;
    });
    return { scores: sc, totalScore: tot };
  };

  const formatTime = (s) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // --- UI RENDER (SISWA ONLY) ---
  if (screen === 'landing') {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full relative overflow-hidden text-center">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>

          <h1 className="text-2xl font-bold text-indigo-900 mb-1">
            Sistem Test UTBK SNBT
          </h1>
          <p className="text-gray-500 mb-6 text-sm">
            Platform Ujian Berbasis Token Aman
          </p>

          {/* --- BAGIAN BARU: KETENTUAN SKORING --- */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 text-left shadow-sm">
            <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-indigo-600" /> Ketentuan
              Penilaian:
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center justify-between bg-green-50 px-3 py-2 rounded border border-green-100">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-600" />
                  <span>Jawaban Benar</span>
                </div>
                <span className="font-bold text-green-700">+4 Poin</span>
              </li>
              <li className="flex items-center justify-between bg-red-50 px-3 py-2 rounded border border-red-100">
                <div className="flex items-center gap-2">
                  <XCircle size={16} className="text-red-500" />
                  <span>Jawaban Salah</span>
                </div>
                <span className="font-bold text-red-700">0 Poin</span>
              </li>
              <li className="flex items-center justify-between bg-orange-50 px-3 py-2 rounded border border-orange-100">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-orange-500" />
                  <span>Tidak Menjawab</span>
                </div>
                <span className="font-bold text-orange-700">-1 Poin</span>
              </li>
            </ul>
          </div>
          {/* -------------------------------------- */}

          <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl mb-6">
            <label className="block text-indigo-900 font-bold mb-2 text-sm flex items-center justify-center gap-2">
              <Ticket size={18} /> Masukkan Kode Token:
            </label>
            <input
              type="text"
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border-2 border-indigo-200 rounded-lg text-xl font-mono text-center tracking-widest uppercase outline-none focus:ring-4 focus:ring-indigo-100 transition bg-white"
              placeholder="UTBK-XXXXXX"
            />
          </div>

          <button
            onClick={handleTokenLogin}
            className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-indigo-700 transition shadow-lg transform hover:-translate-y-1"
          >
            Mulai Ujian Sekarang
          </button>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Pastikan koneksi internet stabil sebelum memulai.
            </p>
          </div>
        </div>
      </div>
    );
  }
  // --- UI ISTIRAHAT (BREAK) - MINIMALIS 10 DETIK ---
  if (screen === 'break') {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-indigo-50 to-white flex flex-col items-center justify-center p-4">
        {/* Lingkaran Countdown */}
        <div className="relative flex items-center justify-center mb-8">
          {/* Ring Luar */}
          <div className="absolute w-64 h-64 rounded-full border-4 border-indigo-100"></div>
          {/* Ring Progress */}
          <div className="absolute w-60 h-60 rounded-full border-8 border-indigo-500 animate-pulse opacity-20"></div>

          {/* Lingkaran Utama */}
          <div className="w-56 h-56 bg-white rounded-full shadow-2xl flex items-center justify-center border-8 border-indigo-600 relative z-10">
            <div className="text-center">
              <span className="block text-7xl font-bold text-indigo-700">
                {breakTime}
              </span>
              <span className="text-indigo-400 text-sm font-bold uppercase tracking-wider">
                Detik
              </span>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-400 font-medium tracking-wide">
            SUBTEST BERIKUTNYA AKAN DIMULAI OTOMATIS...
          </p>
        </div>
      </div>
    );
  }

  if (screen === 'result') {
    const { scores, totalScore } = calculateScore();

    // Membagi Subtest menjadi 2 Kolom (4 kiri, 3 kanan)
    const leftSubtests = SUBTESTS.slice(0, 4);
    const rightSubtests = SUBTESTS.slice(4, 7);

    return (
      <div className="min-h-screen bg-gray-50 p-8 flex justify-center items-center">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-4xl w-full text-center">
          <h1 className="text-3xl font-bold mb-2 text-indigo-900">
            Hasil Ujian
          </h1>
          <h2 className="text-xl text-gray-600 mb-6 font-medium">
            {studentName}
          </h2>

          {/* Total Score Display */}
          <div className="mb-8">
            <span className="text-sm text-gray-400 uppercase tracking-widest font-bold">
              Total Skor
            </span>
            <div className="text-7xl font-extrabold text-indigo-600 mt-2">
              {totalScore}
            </div>
          </div>

          {/* Breakdown Score - 2 Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-left">
            {/* Kolom Kiri (4 Subtest) */}
            <div className="space-y-3">
              {leftSubtests.map((sub) => (
                <div
                  key={sub.id}
                  className="flex justify-between items-center p-4 bg-gray-50 border border-gray-100 rounded-lg hover:border-indigo-200 transition-colors"
                >
                  <span className="text-gray-700 font-semibold text-sm">
                    {sub.name}
                  </span>
                  <span
                    className={`font-bold text-lg ${
                      scores[sub.id] >= 0 ? 'text-indigo-600' : 'text-red-500'
                    }`}
                  >
                    {scores[sub.id]}
                  </span>
                </div>
              ))}
            </div>

            {/* Kolom Kanan (3 Subtest) */}
            <div className="space-y-3">
              {rightSubtests.map((sub) => (
                <div
                  key={sub.id}
                  className="flex justify-between items-center p-4 bg-gray-50 border border-gray-100 rounded-lg hover:border-indigo-200 transition-colors"
                >
                  <span className="text-gray-700 font-semibold text-sm">
                    {sub.name}
                  </span>
                  <span
                    className={`font-bold text-lg ${
                      scores[sub.id] >= 0 ? 'text-indigo-600' : 'text-red-500'
                    }`}
                  >
                    {scores[sub.id]}
                  </span>
                </div>
              ))}
              {/* Spacer kosong agar tinggi seimbang jika di desktop (opsional) */}
              <div className="hidden md:block p-4"></div>
            </div>
          </div>

          <div className="border-t pt-6">
            <p className="text-gray-400 text-sm mb-6 flex items-center justify-center gap-2">
              <Clock size={16} /> Skor telah disimpan secara otomatis.
            </p>
            <button
              onClick={() => {
                setScreen('landing');
                setInputToken('');
                setStudentName('');
              }}
              className="w-full md:w-1/2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg"
            >
              Selesai / Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- SAFETY GUARD ---
  const currentSubtest = testOrder[currentSubtestIndex];
  if (!currentSubtest || !questionOrder[currentSubtest.id]) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-600">Sedang memuat soal...</p>
      </div>
    );
  }

  const currentQuestions = questionOrder[currentSubtest.id];
  const currentQ = currentQuestions[currentQuestion];
  const key = `${currentSubtest.id}_${currentQuestion}`;

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <div className="sticky top-0 z-50 bg-indigo-700 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">{currentSubtest.name}</h2>
            <p className="text-sm text-indigo-200">
              Soal {currentQuestion + 1} dari {currentSubtest.questions}
            </p>
          </div>
          <div className="flex items-center gap-3 bg-indigo-800 px-6 py-3 rounded-lg shadow-inner">
            <Clock size={24} />
            <span className="text-2xl font-bold">{formatTime(timeLeft)}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h3 className="font-semibold text-gray-700 mb-3">
                Navigasi Soal
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: currentSubtest.questions }).map(
                  (_, idx) => {
                    const qKey = `${currentSubtest.id}_${idx}`;
                    const answered = answers[qKey];
                    const isDoubtful = doubtful[qKey];
                    return (
                      <button
                        key={idx}
                        onClick={() => setCurrentQuestion(idx)}
                        className={`w-10 h-10 rounded font-semibold transition-all ${
                          idx === currentQuestion
                            ? 'bg-indigo-600 text-white'
                            : answered
                            ? isDoubtful
                              ? 'bg-yellow-400 text-white'
                              : 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
              <div className="mb-6">
                <p className="text-lg font-medium text-gray-800 mb-4 leading-relaxed">
                  {currentQ?.question}
                </p>
                {currentQ?.image && (
                  <img
                    src={currentQ.image}
                    alt="Soal"
                    className="max-w-full rounded-lg shadow mb-4"
                  />
                )}
              </div>

              <div className="space-y-3 mb-6">
                {['A', 'B', 'C', 'D', 'E'].map((letter, idx) => (
                  <button
                    key={letter}
                    onClick={() => handleAnswer(letter)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-center gap-3 ${
                      answers[key] === letter
                        ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                        : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 w-8 h-8 flex items-center justify-center font-bold rounded ${
                        answers[key] === letter
                          ? 'bg-indigo-600 text-white'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {letter}
                    </span>
                    <span className="flex-1 text-gray-700">
                      {currentQ?.options[idx]}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 mb-6">
                <input
                  type="checkbox"
                  id="doubtful"
                  checked={doubtful[key] || false}
                  onChange={() =>
                    setDoubtful((p) => ({ ...p, [key]: !p[key] }))
                  }
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <label
                  htmlFor="doubtful"
                  className="text-gray-700 font-medium cursor-pointer select-none"
                >
                  Tandai Ragu-ragu
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    currentQuestion > 0 &&
                    setCurrentQuestion(currentQuestion - 1)
                  }
                  disabled={currentQuestion === 0}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 disabled:bg-gray-300"
                >
                  Kembali
                </button>
                <button
                  onClick={() => {
                    if (currentQuestion < currentSubtest.questions - 1)
                      setCurrentQuestion(currentQuestion + 1);
                    else if (
                      confirm('Yakin ingin lanjut ke subtest berikutnya?')
                    ) {
                      if (currentSubtestIndex < testOrder.length - 1) {
                        setScreen('break');
                        setBreakTime(10); // 10 Detik
                      } else setScreen('result');
                    }
                  }}
                  className={`flex-1 px-6 py-3 text-white rounded-lg font-semibold transition ${
                    currentQuestion === currentSubtest.questions - 1
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {currentQuestion === currentSubtest.questions - 1
                    ? 'Selesai Subtest'
                    : 'Selanjutnya'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UTBKStudentApp;
