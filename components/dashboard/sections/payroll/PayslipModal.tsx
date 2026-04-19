import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { UI_THEME } from '../../../../constants/ui_designs';
import { playSound } from '../../../../lib/audio';

interface PayslipModalProps {
  data: {
    name: string;
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
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('OFFICIAL EARNINGS STATEMENT', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
      
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`Employee: ${data.name.toUpperCase()}`, 14, 38);
      doc.text(`Branch: ${data.branchName.toUpperCase()}`, 14, 44);
      doc.text(`Pay Period: ${data.period}`, 14, 50);
      
      if (data.isSettled) {
        doc.setFontSize(24);
        doc.setTextColor(16, 185, 129, 0.1); // emerald-600 with very low opacity
        doc.text('SETTLED', 105, 150, { align: 'center', angle: 45 });
        
        doc.setFontSize(10);
        doc.setTextColor(16, 185, 129);
        doc.text('STATUS: SETTLED', 196, 38, { align: 'right' });
      }
      
      // Summary Section
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.line(14, 55, 196, 55);
      
      doc.setFontSize(12);
      doc.text('Financial Summary', 14, 65);
      
      doc.setFontSize(10);
      doc.text(`Total Commission:`, 14, 75);
      doc.text(`P${data.commission.toLocaleString()}`, 80, 75, { align: 'right' });
      
      doc.text(`Total Allowance:`, 14, 82);
      doc.text(`P${data.allowance.toLocaleString()}`, 80, 82, { align: 'right' });
      
      doc.text(`Total OT Pay:`, 14, 89);
      doc.setTextColor(16, 185, 129); // emerald-600
      doc.text(`P${data.ot.toLocaleString()}`, 80, 89, { align: 'right' });
      
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Deductions:`, 14, 96);
      doc.setTextColor(225, 29, 72); // rose-600
      doc.text(`-P${(data.late + data.advance).toLocaleString()}`, 80, 96, { align: 'right' });
      
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.5);
      doc.line(14, 102, 80, 102);
      
      doc.setFontSize(14);
      doc.setTextColor(16, 185, 129);
      doc.text(`NET PAYOUT:`, 14, 112);
      doc.text(`P${data.netPay.toLocaleString()}`, 80, 112, { align: 'right' });
      
      // Daily Breakdown Table
      const tableData = data.dailyBreakdown?.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(day => [
        new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        `P${day.commission.toLocaleString()}`,
        `P${day.allowance.toLocaleString()}`,
        `P${day.ot.toLocaleString()}`,
        `P${(day.late + day.advance).toLocaleString()}`,
        `P${day.net.toLocaleString()}`
      ]) || [];
      
      autoTable(doc, {
        startY: 125,
        head: [['Date', 'Comm.', 'Allw.', 'OT', 'Ded.', 'Net']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 9, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' }
        },
        styles: { fontSize: 8 }
      });
      
      doc.save(`${data.name}_Payslip_${data.period.replace(/\s+/g, '_')}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('PDF Export Failed:', err);
      playSound('warning');
    }
  };

  if (!mounted) return null;

  return createPortal(
      <div className={UI_THEME.layout.modalWrapper}>
        <div className={`${UI_THEME.layout.modalFull} ${UI_THEME.radius.modal} p-0 overflow-hidden flex flex-col max-h-[95vh] shadow-2xl animate-in zoom-in-95 duration-300`}>

          {/* PRINTABLE AREA */}
          <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar bg-white">
            {/* PAYSLIP HEADER */}
            <div className="bg-[#0F172A] p-6 md:p-10 text-white relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full"></div>
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.4em]">Official Earnings Statement</p>
                  <h2 className="text-xl font-bold uppercase tracking-tight">{data.name}</h2>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Pay Period</p>
                  <p className="text-sm font-bold uppercase tracking-tight">{data.period}</p>
                  {data.isSettled && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Settled</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 md:p-10 space-y-8">
              {/* SUMMARY CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Commission</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums">₱{data.commission.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Allowance</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums">₱{data.allowance.toLocaleString()}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total OT Pay</p>
                  <p className="text-lg font-bold text-emerald-700 tabular-nums">₱{data.ot.toLocaleString()}</p>
                </div>
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                  <p className="text-[8px] font-bold text-rose-600 uppercase tracking-widest mb-1">Total Deductions</p>
                  <p className="text-lg font-bold text-rose-700 tabular-nums">₱{(data.late + data.advance).toLocaleString()}</p>
                </div>
              </div>

              {/* DAILY BREAKDOWN TABLE */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Daily Detailed Breakdown</h4>
                <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Commission</th>
                        <th className="p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Allowance</th>
                        <th className="p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">OT</th>
                        <th className="p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Deductions</th>
                        <th className="p-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Net</th>
                      </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                      {data.dailyBreakdown?.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((day) => (
                          <tr key={day.date} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4 text-[11px] font-bold text-slate-600 uppercase">
                              {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="p-4 text-[11px] font-bold text-slate-900 text-right tabular-nums">₱{day.commission.toLocaleString()}</td>
                            <td className="p-4 text-[11px] font-bold text-slate-900 text-right tabular-nums">₱{day.allowance.toLocaleString()}</td>
                            <td className="p-4 text-[11px] font-bold text-emerald-600 text-right tabular-nums">₱{day.ot.toLocaleString()}</td>
                            <td className="p-4 text-[11px] font-bold text-rose-500 text-right tabular-nums">₱{(day.late + day.advance).toLocaleString()}</td>
                            <td className="p-4 text-[11px] font-bold text-slate-900 text-right tabular-nums bg-slate-50/30">₱{day.net.toLocaleString()}</td>
                          </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* SESSIONS STAT */}
              <div className="bg-slate-900 rounded-3xl p-6 flex items-center justify-between text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full"></div>
                <div className="relative z-10">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Service Volume</p>
                  <p className="text-2xl font-bold tracking-tighter leading-none">{data.sessions} <span className="text-xs font-medium uppercase tracking-widest text-slate-400">Sessions</span></p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">💆</div>
              </div>
            </div>

            {/* FINAL NET PAY FOOTER */}
            <div className="bg-slate-50 p-6 md:p-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-6 shrink-0 mt-auto relative overflow-hidden">
              {data.isSettled && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] rotate-12">
                  <span className="text-8xl font-black uppercase tracking-[0.2em]">Settled</span>
                </div>
              )}
              <div className="text-center sm:text-left relative z-10">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em] mb-1">Total Net Payout</p>
                <h4 className="text-3xl sm:text-4xl font-bold text-emerald-600 tracking-tighter tabular-nums leading-none">
                  ₱{data.netPay.toLocaleString()}
                </h4>
              </div>
            </div>
          </div>

          {/* MODAL ACTIONS (NOT PRINTED) */}
          <div className="bg-white p-4 sm:p-6 border-t border-slate-200 flex flex-row justify-end items-center gap-3 shrink-0 no-print">
            <button
                onClick={() => handleExportPDF()}
                className="flex-1 sm:flex-none px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" /></svg>
              Save PDF
            </button>
            <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-6 py-3 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>,
      document.body
  );
};
