import React from 'react';
import { ShieldAlert } from 'lucide-react';
import AnalysisDashboard from '../result/AnalysisDashboard';
import LeaderboardTable from '../result/LeaderboardTable';
import FooterLiezira from '../ui/FooterLiezira';

const ResultScreen = ({
  studentName,
  violationReason,
  scores,
  totalScore,
  correctCounts,
  violationScore,
  leaderboard,
  myRank,
  onLogout,
}) => (
  <div
    className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center items-center select-none overflow-y-auto"
    onContextMenu={(e) => e.preventDefault()}
  >
    <div className="bg-white p-4 md:p-8 rounded-xl shadow-2xl max-w-[95%] w-full text-center my-8">
      <h2 className="text-xl text-gray-600 mb-4 font-medium">{studentName}</h2>

      {violationReason && (
        <div className="bg-red-100 border-2 border-red-400 text-red-800 p-4 rounded-lg mb-6 font-bold animate-pulse">
          <div className="flex items-center justify-center gap-2 text-lg">
            <ShieldAlert size={24}/> SUBMIT OTOMATIS
          </div>
          <p className="text-sm font-normal mt-1">Alasan: {violationReason}</p>
        </div>
      )}

      <AnalysisDashboard
        scores={scores}
        totalScore={totalScore}
        correctCounts={correctCounts}
        violationScore={violationScore}
      />

      <LeaderboardTable
        leaderboard={leaderboard}
        studentName={studentName}
        myRank={myRank}
      />

      <div className="border-t pt-6 space-y-4">
        <button
          onClick={onLogout}
          className="w-full bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-xl font-bold hover:bg-red-100 transition"
        >
          Selesai / Logout
        </button>
        <FooterLiezira />
      </div>
    </div>
  </div>
);

export default ResultScreen;
