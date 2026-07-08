import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Branch, Employee, SalesReport } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { getManilaYear } from '../../../../lib/time';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function buildWeekGroups(days: DayRecord[], year: number, month: number) {
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
    .filter(Boolean) as { label: string; dateRange: string; gross: number; net: number }[];
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
    isMonthly?: boolean;
    employeeId?: string;
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
  // Pass these to enable the Monthly tab
  employee?: Employee | null;
  salesReports?: SalesReport[];
  branch?: Branch;
  defaultTab?: 'weekly' | 'monthly';
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  data, onClose, employee, salesReports, branch, defaultTab,
}) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>(defaultTab ?? (data.isMonthly ? 'monthly' : 'weekly'));
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(getManilaYear());


  useEffect(() => {
    setMounted(true);
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  // ── Monthly data ──────────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!employee || !salesReports || !branch) return null;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const days: DayRecord[] = [];
    let sessions = 0;
    for (const report of salesReports) {
      if (report.branchId !== branch.id || !report.reportDate.startsWith(prefix)) continue;
      const rec = (report.staffBreakdown ?? []).find((s: any) => s.employeeId === employee.id);
      if (!rec) continue;
      const att = rec.attendance ?? {};
      const ot      = Number(att.otPay       ?? att.ot_pay       ?? 0);
      const late    = Number(att.lateDeduction ?? att.late_deduction ?? 0);
      const advance = Number(att.cashAdvance  ?? att.cash_advance  ?? 0);
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
  }, [employee, salesReports, branch, month, year]);

  const isFutureMonth = () => {
    const n = new Date();
    return year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth());
  };
  const prevMonth = () => {
    playSound('click');
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (isFutureMonth()) return;
    playSound('click');
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
  };

  // ── Shared: load logo as base64 ──────────────────────────────────────────
  const loadLogoBase64 = async (): Promise<string | null> => {
    try {
      const url = localStorage.getItem('hilot_cached_logo');
      if (!url) return null;
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  // ── Weekly PDF ────────────────────────────────────────────────────────────
  const handleExportWeeklyPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const fmt = (n: number) => `P${n.toLocaleString()}`;
      const W = 210; const M = 14;
      const companyName = document.title || 'Hilot Center';
      const logoBase64 = await loadLogoBase64();

      // Header band
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 58, 'F');
      doc.setFillColor(16, 60, 50);
      doc.circle(W + 4, -4, 35, 'F');

      // Logo (top-left, inside header)
      let logoX = M + 2;
      if (logoBase64) {
        try { doc.addImage(logoBase64, 'PNG', M + 2, 7, 10, 10); logoX = M + 15; } catch { logoX = M + 2; }
      }
      // Company name
      doc.setFontSize(7); doc.setTextColor(16, 185, 129);
      doc.text(companyName.toUpperCase(), logoX, 11);
      // Label
      doc.setFontSize(6); doc.setTextColor(100, 116, 139);
      doc.text('OFFICIAL EARNINGS STATEMENT', logoX, 16);

      doc.setFontSize(13); doc.setTextColor(255, 255, 255);
      doc.setFont(undefined as any, 'bold');
      doc.text(data.name.toUpperCase(), M + 2, 26);
      doc.setFont(undefined as any, 'normal');
      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      if (data.formattedEmpId) doc.text(data.formattedEmpId, M + 2, 33);
      doc.text(data.branchName.toUpperCase(), M + 2, 40);
      doc.text(`Pay Period: ${data.period}`, M + 2, 47);
      if (data.isSettled) {
        doc.setTextColor(16, 185, 129);
        doc.text('● SETTLED', W - M, 47, { align: 'right' });
      }

      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text('NET PAYOUT', W - M, 20, { align: 'right' });
      doc.setFontSize(24); doc.setFont(undefined as any, 'bold'); doc.setTextColor(16, 185, 129);
      doc.text(`P${data.netPay.toLocaleString()}`, W - M, 34, { align: 'right' });
      doc.setFont(undefined as any, 'normal');
      doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      doc.text(`${data.sessions} session${data.sessions !== 1 ? 's' : ''}`, W - M, 42, { align: 'right' });

      // Earnings summary table
      const pad = { top: 4.5, bottom: 4.5, left: 6, right: 6 };
      autoTable(doc, {
        startY: 66,
        body: [
          [{ content: 'EARNINGS', colSpan: 2, styles: { fillColor: [241, 245, 249] as any, textColor: [100, 116, 139] as any, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 6, right: 6 } } }],
          ['Commission',    { content: fmt(data.commission), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11 } }],
          ['Allowance',     { content: fmt(data.allowance),  styles: { halign: 'right', fontStyle: 'bold', fontSize: 11 } }],
          ['Overtime Pay', { content: data.ot > 0 ? `+${fmt(data.ot)}` : '—', styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: data.ot > 0 ? [16, 185, 129] as any : [150, 160, 175] as any } }],
          [{ content: 'DEDUCTIONS', colSpan: 2, styles: { fillColor: [241, 245, 249] as any, textColor: [100, 116, 139] as any, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 6, right: 6 } } }],
          ['Late Deductions', { content: data.late > 0 ? `-${fmt(data.late)}` : '—', styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: data.late > 0 ? [220, 38, 38] as any : [150, 160, 175] as any } }],
          ['Cash Advance',    { content: data.advance > 0 ? `-${fmt(data.advance)}` : '—', styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: data.advance > 0 ? [99, 102, 241] as any : [150, 160, 175] as any } }],
          [{ content: 'NET PAYOUT', styles: { fillColor: [15, 23, 42] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 11 } },
           { content: fmt(data.netPay), styles: { fillColor: [15, 23, 42] as any, textColor: [16, 185, 129] as any, fontStyle: 'bold', fontSize: 14, halign: 'right' } }],
        ],
        theme: 'plain',
        bodyStyles: { fontSize: 10, cellPadding: pad, textColor: [30, 41, 59] as any },
        tableLineColor: [226, 232, 240] as any,
        tableLineWidth: 0.2,
        margin: { left: M, right: M },
      });

      // Daily records
      const lastY = (doc as any).lastAutoTable?.finalY ?? 120;
      const tableData = (data.dailyBreakdown ?? [])
        .slice().sort((a, b) => a.date.localeCompare(b.date))
        .map(day => [
          new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
          fmt(day.commission), fmt(day.allowance),
          day.ot > 0 ? `+${fmt(day.ot)}` : '—',
          day.late > 0 ? `-${fmt(day.late)}` : '—',
          day.advance > 0 ? `-${fmt(day.advance)}` : '—',
          fmt(day.net),
        ]);

      if (tableData.length > 0) {
        doc.setFontSize(8); doc.setFont(undefined as any, 'bold'); doc.setTextColor(100, 116, 139);
        doc.text('DAILY RECORDS', M, lastY + 9);
        autoTable(doc, {
          startY: lastY + 13,
          head: [['Date', 'Comm.', 'Allw.', 'OT', 'Late', 'Adv.', 'Net']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [15, 23, 42] as any, textColor: [255, 255, 255] as any, fontSize: 9, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] as any },
          columnStyles: {
            0: { cellWidth: 36 },
            1: { halign: 'right' }, 2: { halign: 'right' },
            3: { halign: 'right' }, 4: { halign: 'right' },
            5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' },
          },
          styles: { fontSize: 10, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } },
          margin: { left: M, right: M },
        });
      }

      doc.save(`${data.name}_Payslip_${data.period.replace(/\s+/g, '_')}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('PDF Export Failed:', err);
      playSound('warning');
    }
  };

  // ── Monthly PDF ───────────────────────────────────────────────────────────
  const handleExportMonthlyPDF = async () => {
    if (!monthlyData || !employee || !branch) return;
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const fmt = (n: number) => `P${n.toLocaleString()}`;
      const W = 210; const M = 14;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const companyName = document.title || 'Hilot Center';
      const logoBase64 = await loadLogoBase64();

      // ── Header ────────────────────────────────────────────────────────────
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 58, 'F');
      doc.setFillColor(16, 60, 50);
      doc.circle(W + 4, -4, 35, 'F');

      let logoX = M + 2;
      if (logoBase64) {
        try { doc.addImage(logoBase64, 'PNG', M + 2, 7, 10, 10); logoX = M + 15; } catch { logoX = M + 2; }
      }
      doc.setFontSize(7); doc.setTextColor(16, 185, 129);
      doc.text(companyName.toUpperCase(), logoX, 11);
      doc.setFontSize(6); doc.setTextColor(100, 116, 139);
      doc.text('OFFICIAL MONTHLY PAYSLIP', logoX, 16);

      doc.setFontSize(13); doc.setTextColor(255, 255, 255);
      doc.setFont(undefined as any, 'bold');
      doc.text(employee.name.toUpperCase(), M + 2, 26);
      doc.setFont(undefined as any, 'normal');
      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text(branch.name.toUpperCase(), M + 2, 34);
      doc.text(`${MONTHS[month].toUpperCase()} 1 – ${daysInMonth}, ${year}`, M + 2, 41);
      doc.text(`${monthlyData.sessions} session${monthlyData.sessions !== 1 ? 's' : ''}`, M + 2, 48);

      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text('NET PAY', W - M, 20, { align: 'right' });
      doc.setFontSize(24); doc.setFont(undefined as any, 'bold'); doc.setTextColor(16, 185, 129);
      doc.text(`P${monthlyData.netPay.toLocaleString()}`, W - M, 34, { align: 'right' });
      doc.setFont(undefined as any, 'normal');
      doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      doc.text(`Gross  P${monthlyData.grossPay.toLocaleString()}`, W - M, 43, { align: 'right' });

      // ── Earnings & Deductions table ──────────────────────────────────────
      const pad = { top: 4.5, bottom: 4.5, left: 6, right: 6 };
      autoTable(doc, {
        startY: 66,
        body: [
          [{ content: 'EARNINGS', colSpan: 2, styles: { fillColor: [241, 245, 249] as any, textColor: [100, 116, 139] as any, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 6, right: 6 } } }],
          ['Commission',    { content: fmt(monthlyData.commission), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11 } }],
          ['Allowance', { content: fmt(monthlyData.allowance), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11 } }],
          ['Overtime Pay', { content: monthlyData.ot > 0 ? `+${fmt(monthlyData.ot)}` : '—', styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: monthlyData.ot > 0 ? [16, 185, 129] as any : [150, 160, 175] as any } }],
          [{ content: 'GROSS PAY', styles: { fillColor: [248, 250, 252] as any, fontStyle: 'bold', fontSize: 11 } },
           { content: fmt(monthlyData.grossPay), styles: { fillColor: [248, 250, 252] as any, fontStyle: 'bold', fontSize: 11, halign: 'right' } }],
          [{ content: 'DEDUCTIONS', colSpan: 2, styles: { fillColor: [241, 245, 249] as any, textColor: [100, 116, 139] as any, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 6, right: 6 } } }],
          ['Late Deductions', { content: monthlyData.late > 0 ? `-${fmt(monthlyData.late)}` : '—', styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: monthlyData.late > 0 ? [220, 38, 38] as any : [150, 160, 175] as any } }],
          ['Cash Advances',   { content: monthlyData.advance > 0 ? `-${fmt(monthlyData.advance)}` : '—', styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: monthlyData.advance > 0 ? [99, 102, 241] as any : [150, 160, 175] as any } }],
          [{ content: 'NET PAY', styles: { fillColor: [15, 23, 42] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 11 } },
           { content: fmt(monthlyData.netPay), styles: { fillColor: [15, 23, 42] as any, textColor: [16, 185, 129] as any, fontStyle: 'bold', fontSize: 14, halign: 'right' } }],
        ],
        theme: 'plain',
        bodyStyles: { fontSize: 10, cellPadding: pad, textColor: [30, 41, 59] as any },
        tableLineColor: [226, 232, 240] as any,
        tableLineWidth: 0.2,
        margin: { left: M, right: M },
      });

      // ── Weekly breakdown ─────────────────────────────────────────────────
      const y1 = (doc as any).lastAutoTable?.finalY ?? 120;
      if (monthlyData.weekGroups.length > 0) {
        doc.setFontSize(8); doc.setFont(undefined as any, 'bold'); doc.setTextColor(100, 116, 139);
        doc.text('WEEKLY BREAKDOWN', M, y1 + 9);
        autoTable(doc, {
          startY: y1 + 13,
          head: [['WEEK', 'PERIOD', 'GROSS', 'NET']],
          body: monthlyData.weekGroups.map(w => [w.label, w.dateRange, fmt(w.gross), fmt(w.net)]),
          theme: 'striped',
          headStyles: { fillColor: [15, 23, 42] as any, textColor: [255, 255, 255] as any, fontSize: 9, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] as any },
          columnStyles: {
            0: { cellWidth: 22 }, 1: { cellWidth: 78 },
            2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] as any },
          },
          styles: { fontSize: 10, cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 } },
          margin: { left: M, right: M },
        });
      }

      // ── Daily records ────────────────────────────────────────────────────
      const y2raw = (doc as any).lastAutoTable?.finalY ?? 120;
      if (monthlyData.days.length > 0) {
        doc.setFontSize(8); doc.setFont(undefined as any, 'bold'); doc.setTextColor(100, 116, 139);
        doc.text('DAILY RECORDS', M, y2raw + 9);
        autoTable(doc, {
          startY: y2raw + 13,
          head: [['Date', 'Allw.', 'Comm.', 'Late', 'OT', 'CA', 'Net']],
          body: monthlyData.days.map(day => {
            const [dy, dm, dd] = day.date.split('-').map(Number);
            const dateObj = new Date(dy, dm - 1, dd);
            return [
              dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
              fmt(day.allowance),
              fmt(day.commission),
              day.late > 0 ? `-${fmt(day.late)}` : '—',
              day.ot > 0 ? `+${fmt(day.ot)}` : '—',
              day.advance > 0 ? `-${fmt(day.advance)}` : '—',
              fmt(day.net),
            ];
          }),
          theme: 'striped',
          headStyles: { fillColor: [15, 23, 42] as any, textColor: [255, 255, 255] as any, fontSize: 9, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] as any },
          columnStyles: {
            0: { cellWidth: 36 },
            1: { halign: 'right' }, 2: { halign: 'right' },
            3: { halign: 'right' }, 4: { halign: 'right' },
            5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' },
          },
          styles: { fontSize: 10, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } },
          margin: { left: M, right: M },
        });
      }

      // ── Certification ────────────────────────────────────────────────────
      const y2 = (doc as any).lastAutoTable?.finalY ?? 200;
      const certY = Math.max(y2 + 16, 230);

      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.setFont(undefined as any, 'italic');
      doc.text('This certifies that the above information is true and correct based on official company records.', M, certY);
      doc.setFont(undefined as any, 'normal');

      const sigY = certY + 15;
      doc.setDrawColor(180, 190, 200); doc.setLineWidth(0.3);
      doc.line(M, sigY, 90, sigY);
      doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
      doc.text('Branch Manager / Prepared by', M, sigY + 5);
      doc.text('Date: _______________________', M, sigY + 11);
      doc.line(108, sigY, W - M, sigY);
      doc.text('HR / Owner / Noted by', 108, sigY + 5);
      doc.text('Date: _______________________', 108, sigY + 11);

      doc.setFontSize(7); doc.setTextColor(200, 210, 220);
      doc.text('*** FOR OFFICIAL USE / LOAN APPLICATION ***', W / 2, 288, { align: 'center' });

      doc.save(`${employee.name}_Payslip_${MONTHS[month]}_${year}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('Monthly PDF export failed:', err);
      playSound('warning');
    }
  };

  if (!mounted) return null;

  const sorted = (data.dailyBreakdown ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="w-full max-w-lg sm:max-w-2xl bg-white dark:bg-slate-900 rounded-3xl overflow-hidden flex flex-col max-h-[90dvh] shadow-xl animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="relative bg-[#0F172A] px-6 py-6 shrink-0 overflow-hidden">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-emerald-500/10 pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-black text-emerald-500 uppercase tracking-wide">Official Earnings Statement</p>
              <h2 className="text-lg font-bold text-white tracking-tight truncate">{data.name}</h2>
              {data.formattedEmpId && (
                <p className="text-xs font-bold text-slate-500 font-mono">{data.formattedEmpId}</p>
              )}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-0.5">
                {data.branchName} · {activeTab === 'weekly' ? data.period : `${MONTHS[month]} ${year}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Net Pay</p>
              <p className="text-2xl font-black text-emerald-400 tabular-nums leading-tight">
                ₱{(activeTab === 'weekly' ? data.netPay : (monthlyData?.netPay ?? 0)).toLocaleString()}
              </p>
              {activeTab === 'weekly' && data.isSettled && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Settled</span>
                </span>
              )}
            </div>
          </div>
        </div>


        {/* Month navigator — only on monthly tab */}
        {activeTab === 'monthly' && monthlyData && (
          <div className="flex items-center gap-3 px-6 py-3 bg-slate-800 border-b border-slate-700/60 shrink-0">
            <button
              onClick={prevMonth}
              className="w-9 h-9 rounded-lg bg-slate-600 flex items-center justify-center text-white hover:bg-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="flex-1 text-center text-sm font-black text-white uppercase tracking-wide">
              {MONTHS[month]} {year}
            </p>
            <button
              onClick={nextMonth}
              disabled={isFutureMonth()}
              className="w-9 h-9 rounded-lg bg-slate-600 flex items-center justify-center text-white hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar">

          {/* ── WEEKLY TAB ── */}
          {activeTab === 'weekly' && (
            <>
              <div className="px-6 pt-4 pb-2 space-y-0.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Earnings Breakdown</p>
                <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500">Commission</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums">₱{data.commission.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500">Allowance</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums">₱{data.allowance.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800">
                  <p className={`text-xs font-bold ${data.ot > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>OT Pay</p>
                  <p className={`text-sm font-black tabular-nums ${data.ot > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{data.ot > 0 ? `+₱${data.ot.toLocaleString()}` : '₱0'}</p>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800">
                  <p className={`text-xs font-bold ${data.late > 0 ? 'text-rose-500' : 'text-slate-400'}`}>Late Deduction</p>
                  <p className={`text-sm font-black tabular-nums ${data.late > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{data.late > 0 ? `−₱${data.late.toLocaleString()}` : '₱0'}</p>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800">
                  <p className={`text-xs font-bold ${data.advance > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>Cash Advance</p>
                  <p className={`text-sm font-black tabular-nums ${data.advance > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>{data.advance > 0 ? `−₱${data.advance.toLocaleString()}` : '₱0'}</p>
                </div>
                <div className="flex items-center justify-between pt-2.5 pb-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Net Payout</p>
                    <span className="text-xs font-bold text-slate-400">{data.sessions} session{data.sessions !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-[18px] font-black text-emerald-600 tabular-nums">₱{data.netPay.toLocaleString()}</p>
                </div>
              </div>

              {sorted.length > 0 && (
                <div className="px-6 pt-3 pb-5 space-y-2">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Daily Records</p>
                  <div className="rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <div className="grid grid-cols-[52px_repeat(6,minmax(0,1fr))] sm:grid-cols-[80px_repeat(6,minmax(0,1fr))] bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 px-3 py-2.5">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</p>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Allw.</p>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Comm.</p>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Late</p>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">OT</p>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">CA</p>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide text-right">Net</p>
                    </div>
                    {sorted.map((day, i) => {
                      const [y, m, d] = day.date.split('-').map(Number);
                      const dateObj = new Date(y, m - 1, d);
                      const shortLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
                      const fullLabel  = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                      return (
                        <div key={day.date} className={`grid grid-cols-[52px_repeat(6,minmax(0,1fr))] sm:grid-cols-[80px_repeat(6,minmax(0,1fr))] px-3 py-2.5 border-t border-slate-50 dark:border-slate-700/50 ${i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-700/20' : 'bg-white dark:bg-transparent'}`}>
                          <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase leading-tight">
                            <span className="sm:hidden">{shortLabel}</span>
                            <span className="hidden sm:inline">{fullLabel}</span>
                          </p>
                          <p className="text-xs font-bold text-slate-900 dark:text-white tabular-nums text-right">₱{day.allowance.toLocaleString()}</p>
                          <p className="text-xs font-bold text-slate-900 dark:text-white tabular-nums text-right">₱{day.commission.toLocaleString()}</p>
                          <p className={`text-xs font-bold tabular-nums text-right ${day.late > 0 ? 'text-rose-500' : 'text-slate-300'}`}>{day.late > 0 ? `−₱${day.late.toLocaleString()}` : '—'}</p>
                          <p className={`text-xs font-bold tabular-nums text-right ${day.ot > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{day.ot > 0 ? `+₱${day.ot.toLocaleString()}` : '—'}</p>
                          <p className={`text-xs font-bold tabular-nums text-right ${day.advance > 0 ? 'text-indigo-500' : 'text-slate-300'}`}>{day.advance > 0 ? `−₱${day.advance.toLocaleString()}` : '—'}</p>
                          <p className="text-xs font-black text-slate-900 dark:text-white tabular-nums text-right">₱{day.net.toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── MONTHLY TAB ── */}
          {activeTab === 'monthly' && monthlyData && (
            <>
              {!monthlyData.hasData ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
                  <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm font-bold text-slate-500">No records for {MONTHS[month]} {year}</p>
                  <p className="text-xs text-slate-400">No sales reports found for this employee in this month.</p>
                </div>
              ) : (
                <>
                  <div className="px-6 pt-5 pb-3 space-y-0">
                    {[
                      { label: 'Commission',      value: monthlyData.commission, color: 'text-slate-900 dark:text-white' },
                      { label: 'Allowance', value: monthlyData.allowance,  color: 'text-slate-900 dark:text-white' },
                      { label: 'Overtime Pay', value: monthlyData.ot, color: monthlyData.ot > 0 ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-600', prefix: monthlyData.ot > 0 ? '+' : '' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-slate-500">{row.label}</p>
                        <p className={`text-sm font-black tabular-nums ${row.color}`}>
                          {row.value > 0 ? `${(row as any).prefix ?? ''}₱${row.value.toLocaleString()}` : '—'}
                        </p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400">Gross Pay</p>
                      <p className="text-sm font-black text-slate-600 dark:text-slate-300 tabular-nums">₱{monthlyData.grossPay.toLocaleString()}</p>
                    </div>
                    {monthlyData.late > 0 && (
                      <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-rose-500">Late Deductions</p>
                        <p className="text-sm font-black text-rose-500 tabular-nums">−₱{monthlyData.late.toLocaleString()}</p>
                      </div>
                    )}
                    {monthlyData.advance > 0 && (
                      <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-indigo-500">Cash Advances</p>
                        <p className="text-sm font-black text-indigo-500 tabular-nums">−₱{monthlyData.advance.toLocaleString()}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-3 pb-1">
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Net Pay</p>
                        <p className="text-xs text-slate-400 mt-0.5">{monthlyData.sessions} session{monthlyData.sessions !== 1 ? 's' : ''} · {MONTHS[month]} {year}</p>
                      </div>
                      <p className="text-2xl font-black text-emerald-600 tabular-nums">₱{monthlyData.netPay.toLocaleString()}</p>
                    </div>
                  </div>

                  {monthlyData.weekGroups.length > 0 && (
                    <div className="px-6 pb-4 space-y-2">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Weekly Breakdown</p>
                      <div className="rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                        <div className="grid grid-cols-[56px_1fr_76px_76px] bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-3 py-2">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Week</p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Gross</p>
                          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide text-right">Net</p>
                        </div>
                        {monthlyData.weekGroups.map((w, i) => (
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

                  {monthlyData.days.length > 0 && (
                    <div className="px-6 pb-6 space-y-2">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Daily Records</p>
                      <div className="rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                        <div className="grid grid-cols-[52px_repeat(6,minmax(0,1fr))] sm:grid-cols-[80px_repeat(6,minmax(0,1fr))] bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 px-3 py-2.5">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Allw.</p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Comm.</p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Late</p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">OT</p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">CA</p>
                          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide text-right">Net</p>
                        </div>
                        {monthlyData.days.map((day, i) => {
                          const [dy, dm, dd] = day.date.split('-').map(Number);
                          const dateObj = new Date(dy, dm - 1, dd);
                          const shortLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
                          const fullLabel  = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                          return (
                            <div key={day.date} className={`grid grid-cols-[52px_repeat(6,minmax(0,1fr))] sm:grid-cols-[80px_repeat(6,minmax(0,1fr))] px-3 py-2.5 border-t border-slate-50 dark:border-slate-700/50 ${i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-700/20' : 'bg-white dark:bg-transparent'}`}>
                              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase leading-tight">
                                <span className="sm:hidden">{shortLabel}</span>
                                <span className="hidden sm:inline">{fullLabel}</span>
                              </p>
                              <p className="text-xs font-bold text-slate-900 dark:text-white tabular-nums text-right">₱{day.allowance.toLocaleString()}</p>
                              <p className="text-xs font-bold text-slate-900 dark:text-white tabular-nums text-right">₱{day.commission.toLocaleString()}</p>
                              <p className={`text-xs font-bold tabular-nums text-right ${day.late > 0 ? 'text-rose-500' : 'text-slate-300'}`}>{day.late > 0 ? `−₱${day.late.toLocaleString()}` : '—'}</p>
                              <p className={`text-xs font-bold tabular-nums text-right ${day.ot > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{day.ot > 0 ? `+₱${day.ot.toLocaleString()}` : '—'}</p>
                              <p className={`text-xs font-bold tabular-nums text-right ${day.advance > 0 ? 'text-indigo-500' : 'text-slate-300'}`}>{day.advance > 0 ? `−₱${day.advance.toLocaleString()}` : '—'}</p>
                              <p className="text-xs font-black text-slate-900 dark:text-white tabular-nums text-right">₱{day.net.toLocaleString()}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white dark:bg-slate-900 px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0">
          <button
            onClick={activeTab === 'weekly' ? handleExportWeeklyPDF : handleExportMonthlyPDF}
            disabled={activeTab === 'monthly' && !monthlyData?.hasData}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" />
            </svg>
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
