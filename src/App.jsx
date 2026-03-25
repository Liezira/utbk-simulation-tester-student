import React from 'react';
import useExamState from './hooks/useExamState';
import LandingScreen from './components/screens/LandingScreen';
import CountdownScreen from './components/screens/CountdownScreen';
import BreakScreen from './components/screens/BreakScreen';
import TestScreen from './components/screens/TestScreen';
import ResultScreen from './components/screens/ResultScreen';

// ─── Landscape Lock Screen ──────────────────────────────────────────────────
const LandscapeBlockScreen = () => (
  <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center text-white p-6 text-center select-none">
    <div className="animate-bounce mb-4 text-4xl">📱 ➔ 📲</div>
    <h2 className="text-xl font-bold mb-2 uppercase tracking-widest text-red-500">Orientasi Terkunci</h2>
    <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
      Mode Landscape dimatikan untuk Smartphone.<br/>Putar ke <b>Portrait</b>.
    </p>
  </div>
);

// ─── Loading Screen ─────────────────────────────────────────────────────────
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
    <p>Memuat soal...</p>
  </div>
);

// ─── App Orchestrator ────────────────────────────────────────────────────────
const UTBKStudentApp = () => {
  const exam = useExamState();

  if (exam.isLandscapeMobile) return <LandscapeBlockScreen />;

  if (exam.screen === 'countdown') {
    return (
      <CountdownScreen
        countdownTime={exam.countdownTime}
        securityActive={exam.securityActive}
        isIOS={exam.isIOS}
        showViolationWarning={exam.showViolationWarning}
        currentViolationScore={exam.currentViolationScore}
        lastViolationMsg={exam.lastViolationMsg}
        onViolationDetected={exam.handleViolationLogic}
        onCloseViolationWarning={exam.handleCloseViolationWarning}
      />
    );
  }

  if (exam.screen === 'landing') {
    return (
      <LandingScreen
        inputToken={exam.inputToken}
        setInputToken={exam.setInputToken}
        onLogin={exam.handleTokenLogin}
        isIOS={exam.isIOS}
      />
    );
  }

  if (exam.screen === 'break') {
    return (
      <BreakScreen
        breakTime={exam.breakTime}
        securityActive={exam.securityActive}
        isIOS={exam.isIOS}
        showViolationWarning={exam.showViolationWarning}
        currentViolationScore={exam.currentViolationScore}
        lastViolationMsg={exam.lastViolationMsg}
        onViolationDetected={exam.handleViolationLogic}
        onCloseViolationWarning={exam.handleCloseViolationWarning}
      />
    );
  }

  if (exam.screen === 'result') {
    const { scores, totalScore, correctCounts } = exam.calculateScore();
    return (
      <ResultScreen
        studentName={exam.studentName}
        violationReason={exam.violationReason}
        scores={scores}
        totalScore={totalScore}
        correctCounts={correctCounts}
        violationScore={exam.violationScore}
        leaderboard={exam.leaderboard}
        myRank={exam.myRank}
        onLogout={exam.handleLogout}
      />
    );
  }

  // Test screen — guard against missing data
  const currentSubtest = exam.testOrder[exam.currentSubtestIndex];
  if (!currentSubtest || !exam.questionOrder[currentSubtest.id]) {
    return <LoadingScreen />;
  }

  return (
    <TestScreen
      currentSubtest={currentSubtest}
      currentQuestion={exam.currentQuestion}
      timeLeft={exam.timeLeft}
      answers={exam.answers}
      doubtful={exam.doubtful}
      questionOrder={exam.questionOrder}
      violationScore={exam.violationScore}
      securityActive={exam.securityActive}
      isPaused={exam.isPaused}
      pauseCount={exam.pauseCount}
      pauseTimeLeft={exam.pauseTimeLeft}
      showViolationWarning={exam.showViolationWarning}
      currentViolationScore={exam.currentViolationScore}
      lastViolationMsg={exam.lastViolationMsg}
      isIOS={exam.isIOS}
      onAnswer={exam.handleAnswer}
      onNextQuestion={exam.handleNextQuestion}
      onSetQuestion={exam.setCurrentQuestion}
      onSetDoubtful={(key) => exam.handleSetDoubtful(key)}
      onViolationDetected={exam.handleViolationLogic}
      onCloseViolationWarning={exam.handleCloseViolationWarning}
      onPause={exam.handlePause}
      onResume={exam.handleResume}
    />
  );
};

export default UTBKStudentApp;