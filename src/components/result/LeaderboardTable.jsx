import React from 'react';

const SUBTEST_HEADERS = ['PU', 'PPU', 'PK', 'PBM', 'Lit.Indo', 'Lit.Ing', 'PM'];
const SUBTEST_IDS = ['pu', 'ppu', 'pk', 'pbm', 'lbi', 'lbe', 'pm'];

const LeaderboardTable = ({ leaderboard, studentName, myRank }) => (
  <div className="w-full bg-white p-0 md:p-4 overflow-hidden mt-8 mb-8">
    <div className="text-center font-extrabold text-lg md:text-xl mb-4 uppercase text-gray-800 tracking-tight">
      SKOR TRYOUT AKBAR
    </div>

    <div className="overflow-x-auto border border-gray-800 shadow-md">
      <table className="min-w-full text-[10px] md:text-xs border-collapse">
        <thead>
          <tr className="bg-teal-700 text-white font-bold text-center uppercase tracking-wider">
            <th rowSpan="2" className="border border-white p-2 w-8">No</th>
            <th rowSpan="2" className="border border-white p-2 min-w-[120px]">Nama</th>
            <th rowSpan="2" className="border border-white p-2 min-w-[100px]">Sekolah</th>
            {SUBTEST_HEADERS.map((h) => (
              <th key={h} colSpan="2" className="border border-white p-1">{h}</th>
            ))}
            <th rowSpan="2" className="border border-white p-2 w-16 bg-teal-800">TOTAL</th>
          </tr>
          <tr className="bg-teal-600 text-white font-bold text-center text-[9px] uppercase">
            {Array(7).fill(null).map((_, i) => (
              <React.Fragment key={i}>
                <th className="border border-white px-1 py-1 min-w-[25px]">B</th>
                <th className="border border-white px-1 py-1 min-w-[35px]">Skor</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="text-gray-900 bg-white font-medium">
          {leaderboard.length === 0 ? (
            <tr><td colSpan="18" className="p-6 text-center text-gray-500 italic">Memuat data peringkat...</td></tr>
          ) : leaderboard.map((row, idx) => {
            const getVal = (id, type) => row.details?.[id]?.[type] || 0;
            const isMe = row.name === studentName;
            return (
              <tr
                key={idx}
                className={`text-center ${isMe ? 'bg-yellow-100 font-bold border-2 border-yellow-400' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-100')}`}
              >
                <td className="border border-gray-400 p-2">{row.rank}</td>
                <td className="border border-gray-400 p-2 text-left truncate max-w-[150px]">
                  {row.name}{isMe && ' (Kamu)'}
                </td>
                <td className="border border-gray-400 p-2 text-left truncate max-w-[120px]">{row.school}</td>
                {SUBTEST_IDS.map((id) => (
                  <React.Fragment key={id}>
                    <td className="border border-gray-400 p-1">{getVal(id, 'b')}</td>
                    <td className="border border-gray-400 p-1 text-teal-800">{getVal(id, 'skor')}</td>
                  </React.Fragment>
                ))}
                <td className="border border-gray-400 p-2 font-bold bg-teal-50 text-teal-900">{row.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="mt-4 text-center">
      {myRank ? (
        <div className="inline-block bg-teal-100 text-teal-800 px-4 py-2 rounded-full font-bold text-sm border border-teal-200">
          🎉 Kamu peringkat <span className="text-lg">{myRank}</span>
        </div>
      ) : (
        <div className="inline-block bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm border border-gray-200">
          Kamu belum masuk Top 10.
        </div>
      )}
    </div>
  </div>
);

export default LeaderboardTable;
