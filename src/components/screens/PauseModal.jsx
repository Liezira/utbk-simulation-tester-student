import React from 'react';
import { Coffee, PlayCircle } from 'lucide-react';
import { PAUSE_CONFIG } from '../../constants/config';
import { formatTime } from '../../utils/helpers';

const PauseModal = ({ pauseTimeLeft, pauseCount, onResume }) => (
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

      <div className="p-4 border-t">
        <button
          onClick={onResume}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2"
        >
          <PlayCircle size={20}/> Lanjutkan Ujian
        </button>
      </div>
    </div>
  </div>
);

export default PauseModal;
