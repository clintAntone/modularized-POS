import React from 'react';
import { SalesReport } from '../../../../types';

interface ExportMirrorProps {
  report: SalesReport;
  branchName: string;
}

export const ExportMirror = React.forwardRef<HTMLDivElement, ExportMirrorProps>(({ report, branchName }, ref) => {
  return (
    <div 
      ref={ref}
      className="bg-white p-12 w-[1280px] font-sans text-slate-900"
      style={{ position: 'fixed', left: '-9999px', top: 0 }}
    >
      <div className="flex justify-between items-start mb-12">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">HILOT CENTER CORE</h1>
          <p className="text-sm font-black text-emerald-600 uppercase tracking-[0.4em] mt-1">Official Branch Audit Log</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registry ID</p>
          <p className="font-black text-lg text-slate-900 uppercase">NODE-TRACE-{report.id.slice(-8)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-12 mb-12 border-y border-slate-100 py-10">
        <div className="space-y-1">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Audit Context</p>
          <h2 className="text-3xl font-black uppercase tracking-tight">{branchName}</h2>
        </div>
        <div className="text-right space-y-1">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Archive Date</p>
          <h2 className="text-3xl font-black uppercase tracking-tight">
            {new Date(report.reportDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-12">
        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Gross Yield</p>
          <p className="text-4xl font-black tracking-tighter">₱{report.grossSales.toLocaleString()}</p>
        </div>
        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Staff Payroll</p>
          <p className="text-4xl font-black tracking-tighter text-amber-600">₱{report.totalStaffPay.toLocaleString()}</p>
        </div>
        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Operational</p>
          <p className="text-4xl font-black tracking-tighter text-rose-500">₱{report.totalExpenses.toLocaleString()}</p>
        </div>
        <div className={`p-8 rounded-2xl shadow-xl ${report.netRoi >= 0 ? 'bg-slate-900 text-white' : 'bg-rose-900 text-white'}`}>
          <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2">Net ROI</p>
          <p className={`text-4xl font-black tracking-tighter ${report.netRoi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {report.netRoi < 0 ? '−' : ''}₱{Math.abs(report.netRoi).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-lg font-black uppercase tracking-widest text-slate-900">Session Ledger Activity</h3>
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-8 py-5">Time</th>
                <th className="px-8 py-5">Client</th>
                <th className="px-8 py-5">Service</th>
                <th className="px-8 py-5">Providers</th>
                <th className="px-8 py-5 text-right">Collection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(report.sessionData || []).map((t: any) => (
                <tr key={t.id} className="break-inside-avoid">
                  <td className="px-8 py-5 text-xs font-bold text-slate-400 tabular-nums break-inside-avoid">
                    {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-8 py-5 text-sm font-black uppercase break-inside-avoid">{t.clientName || t.client_name}</td>
                  <td className="px-8 py-5 text-xs font-bold text-slate-500 uppercase break-inside-avoid">{t.serviceName || t.service_name}</td>
                  <td className="px-8 py-5 text-xs uppercase text-slate-400 break-inside-avoid">
                    {t.therapistName || t.therapist_name} {t.bonesetterName && `+ ${t.bonesetterName}`}
                  </td>
                  <td className="px-8 py-5 text-right font-black text-slate-900 break-inside-avoid">₱{t.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center opacity-30">
        <p className="text-[10px] font-black uppercase tracking-[0.5em]">Network Archive Secured v3.0</p>
        <p className="text-[10px] font-black uppercase tracking-widest">Generated: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
});