import React, { useRef } from 'react';
import {
  Clock, CheckSquare, AlignLeft, List, PauseCircle
} from 'lucide-react';
import Latex from 'react-latex-next';
import 'katex/dist/katex.min.css';
import AdvancedSecurityMonitor from '../security/AdvancedSecurityMonitor';
import ViolationWarningModal from '../security/ViolationWarningModal';
import PauseModal from './PauseModal';
import RichTextToolbar from '../ui/RichTextToolbar';
import { PAUSE_CONFIG, VIOLATION_SCORING } from '../../constants/config';
import { formatTime } from '../../utils/helpers';

const TestScreen = ({
  currentSubtest,
  currentQuestion,
  timeLeft,
  answers,
  doubtful,
  questionOrder,
  violationScore,
  securityActive,
  isPaused,
  pauseCount,
  pauseTimeLeft,
  showViolationWarning,
  currentViolationScore,
  lastViolationMsg,
  isIOS,
  onAnswer,
  onNextQuestion,
  onSetQuestion,
  onSetDoubtful,
  onViolationDetected,
  onCloseViolationWarning,
  onPause,
  onResume,
}) => {
  const isanInputRef = useRef(null);

  const currentQ = questionOrder[currentSubtest.id][currentQuestion];
  const key = `${currentSubtest.id}_${currentQuestion}`;
  const qType = currentQ.type || 'pilihan_ganda';

  return (
    <div
      className="min-h-screen w-full bg-gray-50 select-none pb-10"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <AdvancedSecurityMonitor
        isActive={securityActive && !isPaused}
        onViolationDetected={onViolationDetected}
        isIOSDevice={isIOS}
      />

      {isPaused && (
        <PauseModal
          pauseTimeLeft={pauseTimeLeft}
          pauseCount={pauseCount}
          onResume={onResume}
        />
      )}

      {showViolationWarning && !isPaused && (
        <ViolationWarningModal
          violationScore={currentViolationScore}
          message={lastViolationMsg}
          onClose={() => { onCloseViolationWarning(); }}
        />
      )}

      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-indigo-700 text-white shadow-lg transition-all duration-300">
        <div className="max-w-6xl mx-auto p-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left w-full md:w-auto">
            <h2 className="text-lg md:text-xl font-bold leading-tight">{currentSubtest.name}</h2>
            <p className="text-xs md:text-sm text-indigo-200 mt-1">
              Soal {currentQuestion + 1} / {currentSubtest.questions}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 w-full md:w-auto">
            {/* Timer */}
            <div className="flex items-center gap-2 bg-indigo-900 px-6 py-2 rounded-lg border border-indigo-500/30 justify-center shadow-inner">
              <Clock size={20} className="md:w-6 md:h-6 text-yellow-400" />
              <span className={`text-xl md:text-2xl font-bold font-mono tracking-widest text-white ${timeLeft <= 60 ? 'animate-pulse text-red-300' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            </div>

            {/* Pause Button */}
            <button
              onClick={onPause}
              disabled={pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT}
              title={pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT ? 'Jeda sudah habis' : `Jeda (${PAUSE_CONFIG.MAX_PAUSE_COUNT - pauseCount} sisa)`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition ${
                pauseCount >= PAUSE_CONFIG.MAX_PAUSE_COUNT
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-indigo-900 shadow-md'
              }`}
            >
              <PauseCircle size={16}/>
              <span className="hidden md:inline">Jeda</span>
              <span className="text-[10px] opacity-75">({PAUSE_CONFIG.MAX_PAUSE_COUNT - pauseCount})</span>
            </button>
          </div>
        </div>

        {/* Violation Score Bar */}
        {violationScore > 0 && (
          <div className="border-t border-indigo-600 px-4 py-1.5 flex items-center gap-2">
            <div className="flex-1 bg-indigo-900 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${violationScore >= VIOLATION_SCORING.warningThreshold ? 'bg-red-400' : 'bg-yellow-400'}`}
                style={{ width: `${Math.min(100, (violationScore / VIOLATION_SCORING.maxTotalDeduction) * 100)}%` }}
              />
            </div>
            <span className={`text-[10px] font-bold ${violationScore >= VIOLATION_SCORING.warningThreshold ? 'text-red-300' : 'text-yellow-300'}`}>
              ⚠️ {violationScore}/{VIOLATION_SCORING.maxTotalDeduction}
            </span>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Question Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h3 className="font-semibold text-gray-700 mb-3">Navigasi</h3>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: currentSubtest.questions }).map((_, idx) => {
                  const qKey = `${currentSubtest.id}_${idx}`;
                  const isAnswered = answers[qKey] && (Array.isArray(answers[qKey]) ? answers[qKey].length > 0 : true);
                  return (
                    <button
                      key={idx}
                      onClick={() => onSetQuestion(idx)}
                      className={`w-full h-9 md:h-10 rounded-lg text-xs md:text-sm font-bold transition-all transform active:scale-95 ${
                        idx === currentQuestion
                          ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-300'
                          : isAnswered
                            ? (doubtful[qKey] ? 'bg-yellow-400 text-white' : 'bg-green-500 text-white')
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Question Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
              <div className="mb-8">
                <div className="mb-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex w-fit items-center gap-1">
                    {qType === 'pilihan_majemuk' ? <CheckSquare size={12}/> : qType === 'isian' ? <AlignLeft size={12}/> : <List size={12}/>}
                    {qType.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-lg text-gray-800 leading-loose whitespace-pre-wrap font-medium mb-6 text-left text-justify">
                  <Latex>{currentQ?.question}</Latex>
                </div>
                {currentQ?.image && (
                  <div className="flex justify-center my-6">
                    <img
                      src={currentQ.image}
                      alt="Soal Visual"
                      className="w-full h-auto my-6 select-none object-contain"
                      onContextMenu={(e) => e.preventDefault()}
                      draggable="false"
                    />
                  </div>
                )}
              </div>

              <div className="mb-8">
                {qType === 'isian' ? (
                  <div className="bg-gray-50 p-0 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden">
                    <RichTextToolbar
                      inputRef={isanInputRef}
                      value={answers[key] || ''}
                      onChange={(newVal) => onAnswer(newVal, 'isian')}
                    />
                    <div className="p-4">
                      <label className="block text-sm font-bold text-gray-600 mb-2">Jawaban Singkat (Angka/Kata):</label>
                      <input
                        ref={isanInputRef}
                        type="text"
                        value={answers[key] || ''}
                        onChange={(e) => onAnswer(e.target.value, 'isian')}
                        className="w-full p-4 text-xl font-mono border-2 border-indigo-200 rounded-lg focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition"
                        placeholder="Ketik jawaban kamu di sini..."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {['A', 'B', 'C', 'D', 'E'].map((l, idx) => {
                      const isSelected = qType === 'pilihan_majemuk'
                        ? (answers[key] || []).includes(l)
                        : answers[key] === l;
                      return (
                        <button
                          key={l}
                          onClick={() => onAnswer(l, qType)}
                          className={`w-full text-left p-4 rounded-lg border-2 flex items-center gap-3 transition ${
                            isSelected ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-8 h-8 flex items-center justify-center font-bold rounded transition ${isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                            {qType === 'pilihan_majemuk'
                              ? (isSelected ? <CheckSquare size={18}/> : <span className="w-4 h-4 border-2 border-indigo-400 rounded-sm"/>)
                              : l}
                          </div>
                          <span className="flex-1 font-medium text-gray-700">
                            <Latex>{currentQ?.options[idx] || ''}</Latex>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mb-6">
                <input
                  type="checkbox"
                  id="doubt"
                  checked={doubtful[key] || false}
                  onChange={() => onSetDoubtful(key)}
                  className="w-5 h-5 cursor-pointer"
                />
                <label htmlFor="doubt" className="cursor-pointer font-medium text-gray-600">Ragu-ragu</label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => onSetQuestion((prev) => prev - 1)}
                  disabled={currentQuestion === 0}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold disabled:bg-gray-300"
                >
                  Kembali
                </button>
                <button
                  onClick={onNextQuestion}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestScreen;
