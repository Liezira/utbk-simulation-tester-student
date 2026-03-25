import { useEffect, useRef } from 'react';
import { SECURITY_CONFIG } from '../../constants/config';

// Advanced Security Monitor — renders nothing, only attaches event listeners
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

    const handleBlur        = () => onViolationDetected('blur', '⚠️ Fokus Hilang!');
    const handleCopy        = (e) => { e.preventDefault(); onViolationDetected('copy', '🚫 Copy Blocked'); };
    const handlePaste       = (e) => { e.preventDefault(); onViolationDetected('paste', '🚫 Paste Blocked'); };
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

export default AdvancedSecurityMonitor;
