import React from 'react';
import AdvancedSecurityMonitor from '../security/AdvancedSecurityMonitor';
import ViolationWarningModal from '../security/ViolationWarningModal';

const BreakScreen = ({
  breakTime,
  securityActive,
  isIOS,
  showViolationWarning,
  currentViolationScore,
  lastViolationMsg,
  onViolationDetected,
  onCloseViolationWarning,
}) => (
  <div
    className="min-h-screen w-full bg-gradient-to-br from-indigo-50 to-white flex flex-col items-center justify-center p-4 select-none"
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

    <div className="relative flex items-center justify-center mb-8">
      <div className="absolute w-64 h-64 rounded-full border-4 border-indigo-100" />
      <div className="absolute w-60 h-60 rounded-full border-8 border-indigo-500 animate-pulse opacity-20" />
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

export default BreakScreen;
