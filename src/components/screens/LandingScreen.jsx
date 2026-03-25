import React from 'react';
import { Smartphone, Shield, Ticket } from 'lucide-react';
import FooterLiezira from '../ui/FooterLiezira';
import { VIOLATION_SCORING, PAUSE_CONFIG } from '../../constants/config';

const LandingScreen = ({ inputToken, setInputToken, onLogin, isIOS }) => (
  <div
    className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 overflow-y-auto"
    onContextMenu={(e) => e.preventDefault()}
  >
    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full relative text-center my-8">
      <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
      <h1 className="text-2xl font-bold text-indigo-900 mb-1">Sistem Simulasi Test UTBK SNBT</h1>
      <p className="text-gray-500 mb-6 text-sm">Platform Ujian Berbasis Token Online</p>

      {isIOS && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-3 mb-4 text-left text-xs text-blue-800">
          <div className="font-bold flex items-center gap-2 mb-1 text-blue-900">
            <Smartphone size={16}/> iOS / Safari Terdeteksi
          </div>
          <p className="text-[11px]">Fullscreen API tidak didukung Safari. Security tetap berjalan normal.</p>
        </div>
      )}

      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 mb-4 text-left text-xs text-indigo-800">
        <div className="font-bold flex items-center gap-2 mb-2 text-indigo-900"><Shield size={18}/> SISTEM PENGAMANAN:</div>
        <ul className="list-disc pl-4 space-y-1 font-semibold">
          <li>✓ Wake Lock — layar tidak sleep</li>
          <li>✓ Grace period untuk pelanggaran tidak sengaja</li>
          <li>✓ Pelanggaran = pengurangan poin</li>
          <li>✓ Blokir DevTools, Copy-Paste, Split Screen</li>
          <li className="text-indigo-700">
            Fitur Pause tersedia ({PAUSE_CONFIG.MAX_PAUSE_COUNT}x per subtes, maks {PAUSE_CONFIG.MAX_PAUSE_DURATION / 60} menit)
          </li>
          <li className="text-red-600 font-black">
            ⚠️ Akumulasi ≥ {VIOLATION_SCORING.maxTotalDeduction} poin = Submit Otomatis
          </li>
        </ul>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl mb-6">
        <label className="block text-indigo-900 font-bold mb-2 text-sm flex items-center justify-center gap-2">
          <Ticket size={18}/> Kode Token:
        </label>
        <input
          type="text"
          value={inputToken}
          onChange={(e) => setInputToken(e.target.value.toUpperCase())}
          className="w-full px-4 py-3 border-2 border-indigo-200 rounded-lg text-xl font-mono text-center tracking-widest uppercase outline-none focus:ring-4 focus:ring-indigo-100 bg-white"
          placeholder="UTBK-XXXXXX"
        />
      </div>

      <button
        onClick={onLogin}
        className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-indigo-700 transition shadow-lg transform hover:-translate-y-1"
      >
        Mulai Ujian Sekarang
      </button>

      <FooterLiezira />
    </div>
  </div>
);

export default LandingScreen;
