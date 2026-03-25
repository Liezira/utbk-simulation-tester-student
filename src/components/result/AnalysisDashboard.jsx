import React from 'react';
import { PieChart, Lightbulb, LayoutDashboard, ShieldAlert } from 'lucide-react';
import { SUBTESTS, SUBTEST_GROUPS } from '../../constants/config';

const AnalysisDashboard = ({ scores, totalScore, correctCounts, violationScore }) => {
  const tpsIds = SUBTEST_GROUPS.TPS.ids;
  const litIds = SUBTEST_GROUPS.LITERASI.ids;
  const tpsAvg = Math.round(tpsIds.reduce((a, id) => a + (scores[id] || 0), 0) / tpsIds.length);
  const litAvg = Math.round(litIds.reduce((a, id) => a + (scores[id] || 0), 0) / litIds.length);
  const grandTotal = tpsAvg + litAvg || 1;
  const tpsPercent = Math.round((tpsAvg / grandTotal) * 100);
  const litPercent = 100 - tpsPercent;
  const isWeakTPS = tpsAvg < litAvg;
  const mitigationText = isWeakTPS
    ? "Rata-rata TPS lebih rendah. Fokus perbaiki logika dasar & kuantitatif."
    : "Logika kuat, tapi Literasi perlu ditingkatkan. Latihan membaca cepat.";

  let motivation = "Terus berjuang!";
  let badgeColor = "bg-gray-500";
  let prediction = "Perlu Peningkatan";
  if (totalScore >= 700) { motivation = "LUAR BIASA!"; badgeColor = "bg-emerald-500"; prediction = "Sangat Kompetitif"; }
  else if (totalScore >= 600) { motivation = "KERJA BAGUS!"; badgeColor = "bg-blue-500"; prediction = "Kompetitif"; }
  else if (totalScore >= 500) { motivation = "RATA-RATA."; badgeColor = "bg-yellow-500"; prediction = "Cukup Baik"; }
  else { motivation = "JANGAN MENYERAH!"; badgeColor = "bg-orange-500"; prediction = "Butuh Latihan"; }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500 text-left">
      {/* Hero Card */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left flex-1 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md">
              <span className={`w-2 h-2 rounded-full ${badgeColor} shadow-[0_0_10px_currentColor]`}/>
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">{prediction}</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white">{motivation}</h2>
            <p className="text-indigo-200 text-sm opacity-90">Hasil simulasi berbasis IRT.</p>
          </div>
          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm text-center min-w-[120px]">
            <span className="text-xs font-bold uppercase text-slate-300 block mb-1">Skor Total</span>
            <div className="text-5xl font-black text-white">{totalScore}</div>
          </div>
        </div>
      </div>

      {/* Violation Notice */}
      {violationScore > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="bg-orange-500 text-white p-3 rounded-xl"><ShieldAlert size={24}/></div>
          <div>
            <h4 className="font-bold text-orange-900 text-sm">Catatan Keamanan</h4>
            <p className="text-orange-700 text-xs mt-0.5">Total poin pelanggaran: <b>{violationScore}</b>. Skor ini terlihat oleh pengawas.</p>
          </div>
        </div>
      )}

      {/* TPS vs Literasi split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2"><PieChart size={16}/> Dominasi Nilai</h4>
          <div className="flex items-center gap-6">
            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `conic-gradient(#3b82f6 0% ${tpsPercent}%, #f97316 ${tpsPercent}% 100%)` }}
            >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm z-10">
                <span className={`text-xs font-black ${tpsPercent > litPercent ? 'text-blue-600' : 'text-orange-600'}`}>
                  {tpsPercent > litPercent ? 'TPS' : 'LIT'}
                </span>
              </div>
            </div>
            <div className="space-y-2 flex-1 text-xs">
              <div>
                <div className="flex justify-between font-bold text-slate-500 mb-1"><span>TPS</span><span>{tpsPercent}%</span></div>
                <div className="w-full bg-slate-100 rounded-full h-1.5"><div style={{ width: `${tpsPercent}%` }} className="h-full bg-blue-600 rounded-full"/></div>
              </div>
              <div>
                <div className="flex justify-between font-bold text-slate-500 mb-1"><span>Literasi</span><span>{litPercent}%</span></div>
                <div className="w-full bg-slate-100 rounded-full h-1.5"><div style={{ width: `${litPercent}%` }} className="h-full bg-orange-500 rounded-full"/></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 p-5 rounded-2xl flex gap-3 items-start shadow-sm">
          <div className="bg-orange-500 text-white p-2 rounded-lg shrink-0"><Lightbulb size={20}/></div>
          <div>
            <h4 className="font-bold text-orange-900 text-sm mb-1">Analisis AI</h4>
            <p className="text-orange-800 text-xs leading-relaxed opacity-90">{mitigationText}</p>
          </div>
        </div>
      </div>

      {/* Subtest breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><LayoutDashboard size={16}/> Rincian Subtes</h4>
        </div>
        <div className="divide-y divide-slate-100 text-sm">
          {SUBTESTS.map((s) => {
            const score = scores[s.id] || 0;
            const correct = correctCounts[s.id] || 0;
            const accuracy = Math.round((correct / s.questions) * 100);
            return (
              <div key={s.id} className="p-4 hover:bg-slate-50 transition flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white ${accuracy >= 50 ? "bg-blue-500" : "bg-red-500"}`}>
                    {accuracy}%
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-800 text-xs md:text-sm">{s.name}</h5>
                    <span className="text-[10px] text-slate-500">Benar: <strong>{correct}</strong>/{s.questions}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Skor</span>
                  <span className="text-base font-black text-slate-800">{score}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AnalysisDashboard;
