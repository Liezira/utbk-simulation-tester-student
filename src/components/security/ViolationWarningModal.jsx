import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { VIOLATION_SCORING } from '../../constants/config';

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
          <button
            onClick={onClose}
            className={`w-full font-bold py-3 rounded-xl text-white transition ${isHigh ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
          >
            Mengerti, Kembali ke Ujian
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViolationWarningModal;
