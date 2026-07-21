import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { Branch, Employee, SalesReport } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { getManilaYear } from '../../../../lib/time';

interface MonthlyPayslipModalProps {
  employee: Employee;
  branch: Branch;
  salesReports: SalesReport[];
  onClose: () => void;
}

interface DayRecord {
  date: string;
  commission: number;
  allowance: number;
  ot: number;
  late: number;
  advance: number;
  net: number;
}

interface WeekGroup {
  label: string;
  dateRange: string;
  gross: number;
  net: number;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function buildWeekGroups(days: DayRecord[], year: number, month: number): WeekGroup[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const ranges = [
    { start: 1,  end: 7  },
    { start: 8,  end: 14 },
    { start: 15, end: 21 },
    { start: 22, end: 28 },
    { start: 29, end: 31 },
  ];
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return ranges
    .filter(r => r.start <= daysInMonth)
    .map((r, i) => {
      const end = Math.min(r.end, daysInMonth);
      const week = days.filter(d => {
        const n = parseInt(d.date.split('-')[2]);
        return n >= r.start && n <= end;
      });
      if (week.length === 0) return null;
      return {
        label: `Week ${i + 1}`,
        dateRange: `${fmt(new Date(year, month, r.start))} – ${fmt(new Date(year, month, end))}`,
        gross: week.reduce((s, d) => s + d.commission + d.allowance + d.ot, 0),
        net:   week.reduce((s, d) => s + d.net, 0),
      };
    })
    .filter(Boolean) as WeekGroup[];
}

export const MonthlyPayslipModal: React.FC<MonthlyPayslipModalProps> = ({
  employee, branch, salesReports, onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(getManilaYear());

  useEffect(() => {
    setMounted(true);
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const data = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const days: DayRecord[] = [];
    let sessions = 0;

    for (const report of salesReports) {
      if (report.branchId !== branch.id || !report.reportDate.startsWith(prefix)) continue;
      const rec = (report.staffBreakdown ?? []).find((s: any) => s.employeeId === employee.id);
      if (!rec) continue;
      const att = rec.attendance ?? {};
      const ot       = Number(att.otPay       ?? att.ot_pay       ?? 0);
      const late     = Number(att.lateDeduction ?? att.late_deduction ?? 0);
      const advance  = Number(att.cashAdvance  ?? att.cash_advance  ?? 0);
      const commission = Number(rec.commission ?? 0);
      const allowance  = Number(rec.allowance  ?? 0);
      sessions += Number(rec.count ?? 0);
      days.push({ date: report.reportDate, commission, allowance, ot, late, advance,
        net: commission + allowance + ot - late - advance });
    }

    days.sort((a, b) => a.date.localeCompare(b.date));

    const commission = days.reduce((s, d) => s + d.commission, 0);
    const allowance  = days.reduce((s, d) => s + d.allowance,  0);
    const ot         = days.reduce((s, d) => s + d.ot,         0);
    const late       = days.reduce((s, d) => s + d.late,       0);
    const advance    = days.reduce((s, d) => s + d.advance,    0);
    const grossPay   = commission + allowance + ot;
    const netPay     = grossPay - late - advance;

    return {
      days, sessions, commission, allowance, ot, late, advance,
      grossPay, netPay, hasData: days.length > 0,
      weekGroups: buildWeekGroups(days, year, month),
    };
  }, [salesReports, branch.id, employee.id, month, year]);

  const isFuture = () => {
    const n = new Date();
    return year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth());
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (isFuture()) return;
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
  };

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const fmt = (n: number) => `P${n.toLocaleString()}`;
      const W = 210;
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // ── Header band ──
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, W, 58, 'F');
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 0, 3, 58, 'F');

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('OFFICIAL MONTHLY PAYSLIP', 12, 10);

      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined as any, 'bold');
      doc.text(employee.name.toUpperCase(), 12, 20);
      doc.setFont(undefined as any, 'normal');

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      if (employee.formattedEmpId) doc.text(employee.formattedEmpId, 12, 27);
      doc.text(branch.name.toUpperCase(), 12, 33);
      doc.text(`Period: ${MONTHS[month].toUpperCase()} 1 – ${daysInMonth}, ${year}`, 12, 39);
      doc.text(`Sessions: ${data.sessions}`, 12, 45);

      // Net pay (right)
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('NET PAY', W - 12, 14, { align: 'right' });
      doc.setFontSize(20);
      doc.setTextColor(16, 185, 129);
      doc.setFont(undefined as any, 'bold');
      doc.text(`P${data.netPay.toLocaleString()}`, W - 12, 27, { align: 'right' });
      doc.setFont(undefined as any, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Gross: P${data.grossPay.toLocaleString()}`, W - 12, 34, { align: 'right' });

      // ── Earnings / Deductions ──
      autoTable(doc, {
        startY: 66,
        body: [
          ['Commission',      fmt(data.commission)],
          ['Basic Allowance', fmt(data.allowance)],
          ['Overtime Pay',    data.ot   > 0 ? `+${fmt(data.ot)}`   : '—'],
          ['', ''],
          ['GROSS PAY',       fmt(data.grossPay)],
          ['', ''],
          ['Late Deductions', data.late    > 0 ? `-${fmt(data.late)}`    : '—'],
          ['Cash Advances',   data.advance > 0 ? `-${fmt(data.advance)}` : '—'],
          ['', ''],
          ['NET PAY',         fmt(data.netPay)],
        ],
        theme: 'plain',
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { halign: 'left', cellWidth: 120 }, 1: { halign: 'right', fontStyle: 'bold' } },
        styles: { cellPadding: 2.5 },
        margin: { left: 12, right: 12 },
        didParseCell: (cell) => {
          const t = cell.cell.text[0];
          if (t === 'GROSS PAY' || t === 'NET PAY') {
            cell.cell.styles.fontSize = 11;
            cell.cell.styles.textColor = t === 'NET PAY' ? [16, 185, 129] : [15, 23, 42];
          }
        },
      });

      // ── Weekly breakdown ──
      const y1 = (doc as any).lastAutoTable?.finalY ?? 120;
      if (data.weekGroups.length > 0) {
        autoTable(doc, {
          startY: y1 + 8,
          head: [['WEEK', 'PERIOD', 'GROSS', 'NET']],
          body: data.weekGroups.map(w => [w.label, w.dateRange, fmt(w.gross), fmt(w.net)]),
          theme: 'striped',
          headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontSize: 8 },
          bodyStyles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 22 }, 1: { cellWidth: 72 },
            2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' },
          },
          margin: { left: 12, right: 12 },
        });
      }

      // ── Certification ──
      const y2 = (doc as any).lastAutoTable?.finalY ?? 200;
      const certY = Math.max(y2 + 18, 232);

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont(undefined as any, 'italic');
      doc.text(
        'This certifies that the above information is true and correct based on official company records.',
        12, certY
      );
      doc.setFont(undefined as any, 'normal');

      const sigY = certY + 14;
      doc.setDrawColor(180, 190, 200);
      doc.line(12, sigY, 88, sigY);
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Branch Manager / Prepared by', 12, sigY + 5);
      doc.text('Date: ___________________', 12, sigY + 10);

      doc.line(108, sigY, 196, sigY);
      doc.text('HR / Owner / Noted by', 108, sigY + 5);
      doc.text('Date: ___________________', 108, sigY + 10);

      doc.setFontSize(7);
      doc.setTextColor(180, 190, 200);
      doc.text('*** FOR OFFICIAL USE / LOAN APPLICATION ***', W / 2, 290, { align: 'center' });

      doc.save(`${employee.name}_Payslip_${MONTHS[month]}_${year}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('Monthly payslip PDF error:', err);
      playSound('warning');
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl overflow-hidden flex flex-col max-h-[90dvh] shadow-xl animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">Monthly Payslip</p>
              <h2 className="text-base font-bold text-white mt-0.5 truncate">{employee.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wide">{branch.name}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Month navigator */}
          <div className="flex items-center gap-3 mt-4">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="flex-1 text-center text-sm font-black text-white uppercase tracking-wide">
              {MONTHS[month]} {year}
            </p>
            <button onClick={nextMonth} disabled={isFuture()} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {!data.hasData ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
              <FileText className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-500">No records for {MONTHS[month]} {year}</p>
              <p className="text-xs text-slate-400">No sales reports found for this employee in this month.</p>
            </div>
          ) : (
            <>
              {/* Earnings summary */}
              <div className="px-6 pt-5 pb-3 space-y-0">
                {[
                  { label: 'Commission',      value: data.commission, color: 'text-slate-900 dark:text-white' },
                  { label: 'Basic Allowance', value: data.allowance,  color: 'text-slate-900 dark:text-white' },
                  ...(data.ot > 0   ? [{ label: 'Overtime Pay',    value: data.ot,      color: 'text-emerald-600', prefix: '+' }] : []),
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-500">{row.label}</p>
                    <p className={`text-sm font-black tabular-nums ${row.color}`}>
                      {(row as any).prefix ?? ''}₱{row.value.toLocaleString()}
                    </p>
                  </div>
                ))}

                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400">Gross Pay</p>
                  <p className="text-sm font-black text-slate-600 dark:text-slate-300 tabular-nums">₱{data.grossPay.toLocaleString()}</p>
                </div>

                {data.late > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-bold text-rose-500">Late Deductions</p>
                    <p className="text-sm font-black text-rose-500 tabular-nums">−₱{data.late.toLocaleString()}</p>
                  </div>
                )}
                {data.advance > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-bold text-indigo-500">Cash Advances</p>
                    <p className="text-sm font-black text-indigo-500 tabular-nums">−₱{data.advance.toLocaleString()}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 pb-1">
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Net Pay</p>
                    <p className="text-xs text-slate-400 mt-0.5">{data.sessions} session{data.sessions !== 1 ? 's' : ''} · {MONTHS[month]} {year}</p>
                  </div>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">₱{data.netPay.toLocaleString()}</p>
                </div>
              </div>

              {/* Weekly breakdown */}
              {data.weekGroups.length > 0 && (
                <div className="px-6 pb-6 space-y-2">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Weekly Breakdown</p>
                  <div className="rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <div className="grid grid-cols-[56px_1fr_76px_76px] bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Week</p>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</p>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Gross</p>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide text-right">Net</p>
                    </div>
                    {data.weekGroups.map((w, i) => (
                      <div key={w.label} className={`grid grid-cols-[56px_1fr_76px_76px] px-3 py-2.5 border-t border-slate-50 dark:border-slate-700/50 ${i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/30' : 'bg-white dark:bg-transparent'}`}>
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">{w.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{w.dateRange}</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums text-right">₱{w.gross.toLocaleString()}</p>
                        <p className="text-xs font-black text-emerald-600 tabular-nums text-right">₱{w.net.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0 bg-white dark:bg-slate-900">
          <button
            onClick={handleExportPDF}
            disabled={!data.hasData}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 dark:hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            Save PDF
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
