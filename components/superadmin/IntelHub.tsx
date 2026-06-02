
import React, { useMemo, useState } from 'react';
import { generateAnalysis } from '../../lib/ai';
import { playSound } from '../../lib/audio';

type Timeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface IntelHubProps {
  stats: any[];
  totals: {
    sales: number;
    staffPay: number;
    ops: number;
    vault: number;
    net: number;
  };
  timeframe: Timeframe;
  setTimeframe: (t: Timeframe) => void;
}

const MetricCard = React.memo(({ label, value, variant, subValue }: { label: string, value: string, variant: 'emerald' | 'red' | 'amber' | 'indigo' | 'slate', subValue?: string }) => {
  const styles = {
    emerald: 'bg-[#E6F9F1] border-emerald-100/50 text-emerald-600',
    red: 'bg-[#FFF1F2] border-red-100/50 text-red-600',
    amber: 'bg-[#FFFBEB] border-amber-100/50 text-amber-600',
    indigo: 'bg-indigo-50 border-indigo-100/50 text-indigo-600',
    slate: 'bg-[#0F172A] text-slate-400 shadow-2xl relative overflow-hidden'
  };

  return (
    <div className={`p-6 sm:p-8 rounded-[40px] border flex flex-col justify-center min-h-[160px] shadow-sm transition-all duration-300 ${styles[variant]}`}>
      {variant === 'slate' && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.1),transparent_60%)] pointer-events-none"></div>
      )}
      <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] mb-4 relative z-10 opacity-70">{label}</p>
      <div className="flex flex-col relative z-10">
        <p className={`text-3xl sm:text-4xl font-bold tracking-tighter leading-none tabular-nums ${variant === 'slate' ? 'text-emerald-400' : 'text-slate-900'}`}>
          {value}
        </p>
        {subValue && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-60">{subValue}</span>
          </div>
        )}
      </div>
    </div>
  );
});

const BranchRankingRow = React.memo(({ b, idx }: { b: any, idx: number }) => {
  const bProfitMargin = b.sales > 0 ? (b.net / b.sales) * 100 : 0;
  
  return (
    <div className="flex items-center justify-between px-6 md:px-12 py-7 md:py-10 hover:bg-slate-50/80 transition-all group cursor-default gap-6">
      <div className="flex items-center gap-6 md:gap-12 min-w-0 flex-1">
        <span className="hidden lg:block text-slate-100 font-bold text-4xl w-12 text-center shrink-0">
          {String(idx + 1).padStart(2, '0')}
        </span>
        <div
          className={`w-14 h-14 md:w-20 md:h-20 rounded-[28px] md:rounded-[36px] flex items-center justify-center text-2xl md:text-4xl shadow-sm shrink-0 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3
            ${b.isEnabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-300 grayscale border border-slate-100'}`}
        >
          {idx === 0 && b.sales > 0 ? '🏆' : '🏢'}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="font-bold text-slate-900 uppercase text-lg md:text-2xl tracking-tight truncate leading-tight group-hover:text-emerald-700 transition-colors">
            {b.name}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
             <span
              className={`inline-block px-3 py-0.5 rounded-lg text-[8px] md:text-[10px] font-bold uppercase tracking-wider border
                ${b.isEnabled ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-500 border-rose-100'}`}
              >
              {b.isEnabled ? 'Active Branch' : 'Offline'}
            </span>
            <div className="flex items-center gap-2">
               <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
               <span className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                 Margin: {bProfitMargin.toFixed(1)}%
               </span>
            </div>
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 space-y-2">
        <p className="font-bold text-slate-900 text-2xl md:text-4xl tracking-tighter leading-none tabular-nums">
          ₱{b.sales.toLocaleString()}
        </p>
        <p className={`text-[10px] md:text-[12px] font-bold uppercase tracking-wider leading-none ${b.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
          {b.net >= 0 ? '+' : ''}₱{b.net.toLocaleString()} Net
        </p>
      </div>
    </div>
  );
});

export const IntelHub: React.FC<IntelHubProps> = ({
  stats,
  totals,
  timeframe,
  setTimeframe
}) => {
  const [query, setQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const sortedStats = useMemo(
    () => [...stats].sort((a, b) => b.sales - a.sales),
    [stats]
  );

  const mvp = useMemo(() => sortedStats.find(s => s.sales > 0), [sortedStats]);

  const handleAiConsult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isAiLoading) return;
    setIsAiLoading(true);
    playSound('click');
    
    try {
      const systemMsg = "You are HilotCore Intelligence. Analyze multi-branch wellness center performance. Be professional and concise. Focus on ROI and efficiency.";
      const res = await generateAnalysis(systemMsg, query, { stats, totals, timeframe });
      setAiResponse(res || "I couldn't process that query. Try asking about branch ROI.");
      playSound('success');
    } catch (err) {
      setAiResponse("System Fault: Neural relay timed out.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-10 md:space-y-12 px-2 sm:px-4 max-w-[1400px] mx-auto">
      {/* AI CONSULTATION BAR */}
      <div className="bg-slate-900 rounded-[48px] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-white/5 mx-2">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-emerald-500 animate-pulse"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
           <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center text-3xl shadow-inner border border-white/5 shrink-0 transition-transform group-hover:scale-110">🧠</div>
           <form onSubmit={handleAiConsult} className="flex-1 w-full flex flex-col sm:flex-row gap-5">
              <input 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ask intelligence about network ROI..."
                className="flex-1 bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-white text-base font-semibold uppercase tracking-wide outline-none focus:border-emerald-500 transition-all placeholder:text-white/20 shadow-inner"
              />
              <button 
                disabled={isAiLoading || !query.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-10 py-5 rounded-3xl uppercase text-[11px] tracking-[0.2em] shadow-xl disabled:opacity-30 active:scale-95 transition-all flex items-center justify-center gap-4"
              >
                {isAiLoading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : '🛰️'}
                {isAiLoading ? 'Analysing Network' : 'Consult Neural Engine'}
              </button>
           </form>
        </div>

        {aiResponse && (
          <div className="mt-10 p-8 sm:p-10 bg-white/5 rounded-[40px] border border-white/10 animate-in slide-in-from-top-4 duration-500 relative">
             <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-5">
               <span className="text-[12px] font-bold text-emerald-400 uppercase tracking-[0.3em]">Sentinel Insights</span>
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
             </div>
             <p className="text-slate-200 text-base font-medium leading-relaxed italic whitespace-pre-wrap">
               "{aiResponse}"
             </p>
             <button onClick={() => setAiResponse(null)} className="mt-8 text-[10px] font-bold text-white/30 uppercase tracking-[0.4em] hover:text-white transition-colors border-b border-white/10 pb-1">Dismiss Analysis</button>
          </div>
        )}
      </div>

      <div className="w-full px-2">
        <div className="flex bg-slate-100 p-2 rounded-3xl border border-slate-200/50 shadow-inner overflow-x-auto no-scrollbar scroll-smooth justify-center">
          <div className="flex w-full lg:min-w-[400px] gap-1.5">
            {(['daily', 'weekly', 'monthly', 'yearly'] as Timeframe[]).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`flex-1 min-w-[100px] px-6 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-wider transition-all duration-300 whitespace-nowrap
                  ${timeframe === tf
                    ? 'bg-white text-slate-900 shadow-lg scale-[1.03] border border-slate-100'
                    : 'text-slate-400 hover:text-slate-600'
                  }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 px-2">
        <MetricCard label="Gross Sales" value={`₱${totals.sales.toLocaleString()}`} variant="emerald" />
        <MetricCard label="Staff Payout" value={`₱${totals.staffPay.toLocaleString()}`} variant="amber" subValue="Disbursed Salary" />
        <MetricCard label="Operational" value={`₱${totals.ops.toLocaleString()}`} variant="red" subValue="Branch Expenses" />
        <MetricCard label="Vault Reserve" value={`₱${totals.vault.toLocaleString()}`} variant="indigo" subValue="Aggregated Provision" />
        <MetricCard label="Ledger ROI" value={`₱${totals.net.toLocaleString()}`} variant="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10 items-start px-2">
        <div className="lg:col-span-8 bg-white rounded-[48px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 md:px-12 py-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-[0.25em]">Branch Performance Rankings</h4>
              <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest leading-none">Aggregated Registry Feed</p>
            </div>
            <div className="hidden sm:flex items-center gap-3 bg-emerald-50 px-5 py-2.5 rounded-2xl border border-emerald-100">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
               <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Verified Synch</span>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {sortedStats.map((b, idx) => (
              <BranchRankingRow key={b.id} b={b} idx={idx} />
            ))}
          </div>
          {sortedStats.length === 0 && (
             <div className="py-32 text-center opacity-30">
                <p className="text-sm font-bold uppercase tracking-[0.4em]">No Network Data Indexed</p>
             </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#0F172A] p-12 rounded-[56px] shadow-2xl text-center flex flex-col items-center relative overflow-hidden group min-h-[480px] justify-center border border-white/5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(251,191,36,0.15),transparent_70%)] pointer-events-none z-0"></div>
            {timeframe === 'daily' && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 flex items-center gap-3 whitespace-nowrap z-20">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981] animate-pulse"></div>
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-[0.3em]">Operational Live Stream</span>
              </div>
            )}
            {mvp && mvp.sales > 0 ? (
              <>
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-[44px] bg-amber-400 flex items-center justify-center text-4xl md:text-6xl mb-10 shadow-[0_25px_60px_rgba(251,191,36,0.4)] group-hover:rotate-6 transition-all duration-500 relative z-10 border-4 border-white/20">
                  🏆
                </div>
                <div className="space-y-3 mb-10 relative z-10 px-4">
                  <p className="text-[11px] md:text-[13px] font-bold text-amber-400 uppercase tracking-[0.4em]">Revenue Champion</p>
                  <h3 className="font-bold text-white uppercase text-2xl md:text-4xl tracking-tighter leading-tight line-clamp-2">
                    {mvp.name}
                  </h3>
                </div>
                <div className="bg-white/10 w-full p-8 rounded-[40px] border border-white/10 backdrop-blur-xl relative z-10 shadow-2xl">
                    <p className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 opacity-60">Network Batch Yield</p>
                    <p className="text-4xl font-bold text-emerald-400 tracking-tighter tabular-nums leading-none">₱{mvp.sales.toLocaleString()}</p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-20 opacity-20 animate-in fade-in duration-1000 relative z-10">
                <div className="w-24 h-24 rounded-[40px] bg-slate-800 flex items-center justify-center text-5xl mb-8 grayscale shadow-inner">🏆</div>
                <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.4em]">Champion Pending</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
