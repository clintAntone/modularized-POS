import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { playSound } from '../../../../lib/audio';

interface PayslipModalProps {
  data: {
    name: string;
    formattedEmpId?: string;
    branchName: string;
    period: string;
    sessions: number;
    commission: number;
    allowance: number;
    ot: number;
    late: number;
    advance: number;
    netPay: number;
    isSettled?: boolean;
    dailyBreakdown?: {
      date: string;
      commission: number;
      allowance: number;
      ot: number;
      late: number;
      advance: number;
      net: number;
    }[];
  };
  onClose: () => void;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({ data, onClose }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();

      // Dark header block
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 52, 'F');

      // Decorative bubble (top-right, partially clipped)
      doc.setFillColor(16, 60, 50);
      doc.circle(208, -4, 30, 'F');

      doc.setFontSize(8);
      doc.setTextColor(16, 185, 129);
      doc.text('OFFICIAL EARNINGS STATEMENT', 14, 12);

      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(data.name.toUpperCase(), 14, 22);

      if (data.formattedEmpId) {
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(data.formattedEmpId, 14, 29);
      }

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`${data.branchName.toUpperCase()}`, 14, 36);
      doc.text(`Pay Period: ${data.period}`, 14, 43);

      if (data.isSettled) {
        doc.setFontSize(9);
        doc.setTextColor(16, 185, 129);
        doc.text('● SETTLED', 196, 43, { align: 'right' });
      }

      // Net pay hero
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('NET PAYOUT', 196, 22, { align: 'right' });
      doc.setFontSize(18);
      doc.setTextColor(16, 185, 129);
      doc.text(`P${data.netPay.toLocaleString()}`, 196, 34, { align: 'right' });

      // Summary table (jsPDF default fonts don't support ₱ — use P prefix)
      const fmt = (n: number) => `P${n.toLocaleString()}`;
      autoTable(doc, {
        startY: 60,
        head: [['Description', 'Amount']],
        body: [
          ['Commission', fmt(data.commission)],
          ['Allowance', fmt(data.allowance)],
          ['OT Pay', data.ot > 0 ? `+${fmt(data.ot)}` : '—'],
          ['Late Deductions', data.late > 0 ? `-${fmt(data.late)}` : '—'],
          ['Cash Advance', data.advance > 0 ? `-${fmt(data.advance)}` : '—'],
        ],
        theme: 'plain',
        headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontSize: 8, halign: 'left' },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right', fontStyle: 'bold' } },
        styles: { cellPadding: 4 },
        margin: { left: 14, right: 14 },
      });

      // Daily breakdown
      const lastY = (doc as any).lastAutoTable?.finalY ?? 120;
      const tableData = (data.dailyBreakdown ?? [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(day => [
          new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
          fmt(day.commission),
          fmt(day.allowance),
          day.ot > 0 ? `+${fmt(day.ot)}` : '—',
          day.late > 0 ? `-${fmt(day.late)}` : '—',
          day.advance > 0 ? `-${fmt(day.advance)}` : '—',
          fmt(day.net),
        ]);

      autoTable(doc, {
        startY: lastY + 10,
        head: [['Date', 'Comm.', 'Allw.', 'OT', 'Late', 'Adv.', 'Net']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { halign: 'right' }, 2: { halign: 'right' },
          3: { halign: 'right' }, 4: { halign: 'right' },
          5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' },
        },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });

      doc.save(`${data.name}_Payslip_${data.period.replace(/\s+/g, '_')}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('PDF Export Failed:', err);
      playSound('warning');
    }
  };

  if (!mounted) return null;

  const sorted = (data.dailyBreakdown ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="w-full max-w-lg sm:max-w-2xl bg-white rounded-3xl overflow-hidden flex flex-col max-h-[90dvh] shadow-2xl animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="relative bg-[#0F172A] px-6 py-6 shrink-0 overflow-hidden">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-emerald-500/10 pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-black text-emerald-500 uppercase tracking-[0.3em]">Official Earnings Statement</p>
              <h2 className="text-lg font-black text-white uppercase tracking-tight truncate">{data.name}</h2>
              {data.formattedEmpId && (
                <p className="text-xs font-bold text-slate-500 font-mono">{data.formattedEmpId}</p>
              )}
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest pt-0.5">{data.branchName} · {data.period}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Net Pay</p>
              <p className="text-2xl font-black text-emerald-400 tabular-nums leading-tight">₱{data.netPay.toLocaleString()}</p>
              {data.isSettled && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Settled</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar">

          {/* Earnings breakdown */}
          <div className="px-6 pt-4 pb-2 space-y-0.5">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Earnings Breakdown</p>

            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <p className="text-xs font-bold text-slate-500">Commission</p>
              <p className="text-sm font-black text-slate-900 tabular-nums">₱{data.commission.toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <p className="text-xs font-bold text-slate-500">Allowance</p>
              <p className="text-sm font-black text-slate-900 tabular-nums">₱{data.allowance.toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <p className={`text-xs font-bold ${data.ot > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>OT Pay</p>
              <p className={`text-sm font-black tabular-nums ${data.ot > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{data.ot > 0 ? `+₱${data.ot.toLocaleString()}` : '₱0'}</p>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <p className={`text-xs font-bold ${data.late > 0 ? 'text-rose-500' : 'text-slate-400'}`}>Late Deduction</p>
              <p className={`text-sm font-black tabular-nums ${data.late > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{data.late > 0 ? `−₱${data.late.toLocaleString()}` : '₱0'}</p>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <p className={`text-xs font-bold ${data.advance > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>Cash Advance</p>
              <p className={`text-sm font-black tabular-nums ${data.advance > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>{data.advance > 0 ? `−₱${data.advance.toLocaleString()}` : '₱0'}</p>
            </div>

            {/* Net total row */}
            <div className="flex items-center justify-between pt-2.5 pb-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Net Payout</p>
                <span className="text-xs font-bold text-slate-400">{data.sessions} session{data.sessions !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-[18px] font-black text-emerald-600 tabular-nums">₱{data.netPay.toLocaleString()}</p>
            </div>
          </div>

          {/* Daily breakdown */}
          {sorted.length > 0 && (
            <div className="px-6 pt-3 pb-5 space-y-2">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Daily Records</p>
              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                {/* Header: Date | Allw | Comm | Late | OT | CA | Net */}
                <div className="grid grid-cols-[52px_repeat(6,minmax(0,1fr))] sm:grid-cols-[80px_repeat(6,minmax(0,1fr))] bg-slate-900 px-3 py-2.5">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Date</p>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest text-right">Allw.</p>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest text-right">Comm.</p>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest text-right">Late</p>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest text-right">OT</p>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest text-right">CA</p>
                  <p className="text-xs font-black text-emerald-500 uppercase tracking-widest text-right">Net</p>
                </div>
                {sorted.map((day, i) => {
                  const [y, m, d] = day.date.split('-').map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const shortLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
                  const fullLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                  return (
                    <div key={day.date} className={`grid grid-cols-[52px_repeat(6,minmax(0,1fr))] sm:grid-cols-[80px_repeat(6,minmax(0,1fr))] px-3 py-2.5 border-t border-slate-50 ${i % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}>
                      <p className="text-xs font-bold text-slate-600 uppercase leading-tight">
                        <span className="sm:hidden">{shortLabel}</span>
                        <span className="hidden sm:inline">{fullLabel}</span>
                      </p>
                      <p className="text-xs font-bold text-slate-900 tabular-nums text-right">₱{day.allowance.toLocaleString()}</p>
                      <p className="text-xs font-bold text-slate-900 tabular-nums text-right">₱{day.commission.toLocaleString()}</p>
                      <p className={`text-xs font-bold tabular-nums text-right ${day.late > 0 ? 'text-rose-500' : 'text-slate-300'}`}>{day.late > 0 ? `−₱${day.late.toLocaleString()}` : '—'}</p>
                      <p className={`text-xs font-bold tabular-nums text-right ${day.ot > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{day.ot > 0 ? `+₱${day.ot.toLocaleString()}` : '—'}</p>
                      <p className={`text-xs font-bold tabular-nums text-right ${day.advance > 0 ? 'text-indigo-500' : 'text-slate-300'}`}>{day.advance > 0 ? `−₱${day.advance.toLocaleString()}` : '—'}</p>
                      <p className="text-xs font-black text-slate-900 tabular-nums text-right">₱{day.net.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={handleExportPDF}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" /></svg>
            Save PDF
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
