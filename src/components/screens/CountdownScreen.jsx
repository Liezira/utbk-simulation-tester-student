import React from 'react';
import { Timer, Shield, Smartphone } from 'lucide-react';
import AdvancedSecurityMonitor from '../security/AdvancedSecurityMonitor';
import ViolationWarningModal from '../security/ViolationWarningModal';
import { VIOLATION_SCORING, PAUSE_CONFIG } from '../../constants/config';

const CountdownScreen = ({
  countdownTime,
  securityActive,
  isIOS,
  showViolationWarning,
  currentViolationScore,
  lastViolationMsg,
  onViolationDetected,
  onCloseViolationWarning,
}) => (
  <div
    className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white select-none"
    onContextMenu={(e) => e.preventDefault()}
  >
    <AdvancedSecurityMonitor
      isActive={securityActive}
      onViolationDetected={onViolationDetected}
      isIOSDevice={isIOS}
    />

    {showViolationWarning && (
      <ViolationWarningModal
        violationScore={currentViolationScore}
        message={lastViolationMsg}
        onClose={onCloseViolationWarning}
      />
    )}

    <div className="mb-8 animate-pulse"><Timer size={64} /></div>
    <h2 className="text-2xl font-bold mb-4 uppercase tracking-widest">Persiapan Ujian</h2>
    <div className="text-[120px] font-bold leading-none mb-4 text-yellow-400 font-mono">{countdownTime}</div>
    <p className="text-indigo-200 text-sm max-w-md text-center px-4">Dilarang keluar fullscreen / pindah tab.</p>

    {isIOS && (
      <div className="mt-4 bg-blue-900/50 border-2 border-blue-400 rounded-xl p-3 max-w-md mx-4">
        <p className="text-blue-200 text-xs font-bold flex items-center gap-2 justify-center">
          <Smartphone size={16}/> iOS DETECTED
        </p>
        <p className="text-blue-100 text-[10px] text-center mt-1">Fullscreen dinonaktifkan (Safari limitation)</p>
      </div>
    )}

    <div className="mt-6 bg-indigo-800/60 border border-indigo-500 rounded-xl p-4 max-w-md mx-4">
      <p className="text-indigo-200 text-xs font-bold flex items-center gap-2 mb-2">
        <Shield size={16}/> SISTEM KEAMANAN AKTIF (Skoring)
      </p>
      <ul className="text-indigo-100 text-xs space-y-1 text-left">
        <li>• 🔒 Wake Lock aktif — layar tidak sleep</li>
        <li>• ✅ Grace period untuk pelanggaran tidak sengaja</li>
        <li>• ⚠️ Pelanggaran = pengurangan poin (bukan langsung stop)</li>
        <li>• ❌ Poin pelanggaran ≥ {VIOLATION_SCORING.maxTotalDeduction} = <b>Auto Submit</b></li>
        <li>• ☕ Pause tersedia {PAUSE_CONFIG.MAX_PAUSE_COUNT}x (maks {PAUSE_CONFIG.MAX_PAUSE_DURATION / 60} menit)</li>
      </ul>
    </div>
  </div>
);

export default CountdownScreen;
