import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Branch, SalesReport } from '../../types';
import { playSound } from '../../lib/audio';
import { getWeekRange, parseDate } from '../../src/utils/reportUtils';
import { getTrueDate } from '../../lib/time';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown, CheckCircle, XCircle, Plus, Minus, Trash2 } from 'lucide-react';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface WeeklyRemittancesHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
  isReadOnly?: boolean;
}

interface RemittanceAdjustment {
  id: string;
  branchId: string;
  periodLabel: string;
  description: string;
  amount: number;
  targetOwner?: string | null;
  createdAt: string;
}

type SubmissionStatus = 'submitted' | 'validated' | 'approved' | 'rejected' | null; // 'validated' kept for legacy records only
interface RemittanceSubmission {
  id: string;
  branchId: string;
  periodLabel: string;
  status: SubmissionStatus;
  reviewNote?: string | null;
  submittedAt: string;
}

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const WeeklyRemittancesHub: React.FC<WeeklyRemittancesHubProps> = ({ branches, salesReports, onRefresh, isReadOnly }) => {
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('rem_filter_periods') || '[]'); } catch { return []; }
  });
  const [branchSearch, setBranchSearch] = useState('');
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('rem_filter_branches') || '[]'); } catch { return []; }
  });
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'approved' | 'none'>(() => {
    const s = localStorage.getItem('rem_filter_status');
    return (s === 'ALL' || s === 'approved' || s === 'none') ? s : 'none';
  });
  const [levyOnly, setLevyOnly] = useState(() => localStorage.getItem('rem_filter_levy') === 'true');
  const [negativeOnly, setNegativeOnly] = useState(() => localStorage.getItem('rem_filter_negative') === 'true');
  const [adjustments, setAdjustments] = useState<RemittanceAdjustment[]>([]);
  const [submissions, setSubmissions] = useState<RemittanceSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);
  const [remitConfirm, setRemitConfirm] = useState<{ submissionId: string | null; branchId: string; periodLabel: string; branchName: string } | null>(null);
  const [markAllConfirm, setMarkAllConfirm] = useState(false);
  const [adjFormKey, setAdjFormKey] = useState<string | null>(null);
  const [adjFormMode, setAdjFormMode] = useState<'add' | 'deduct'>('add');
  const [adjForm, setAdjForm] = useState({ description: '', amount: '' });
  const [isSavingAdj, setIsSavingAdj] = useState(false);
  const [adjTargetOwner, setAdjTargetOwner] = useState<string>('');

  const mapSubmission = (r: any): RemittanceSubmission => ({
    id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
    status: r.status, reviewNote: r.review_note, submittedAt: r.submitted_at
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(e.target as Node)) {
        setPeriodDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    Promise.all([
      supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .select('*')
        .order(DB_COLUMNS.CREATED_AT, { ascending: true }),
      supabase
        .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
        .select('*')
        .order(DB_COLUMNS.SUBMITTED_AT, { ascending: false })
    ]).then(([adjResult, subResult]) => {
      if (adjResult.data) setAdjustments(adjResult.data.map(r => ({
        id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
        description: r.description, amount: Number(r.amount),
        targetOwner: r.target_owner || null,
        createdAt: r.created_at
      })));
      if (subResult.data) setSubmissions(subResult.data.map(mapSubmission));
      setIsLoading(false);
    }).catch(() => setIsLoading(false));

    // Realtime: update submission list whenever a branch submits or a review is saved
    const channel = supabase
      .channel('remittance_submissions_superadmin')
      .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.REMITTANCE_SUBMISSIONS }, payload => {
        const row = payload.new as any;
        if (!row?.id) return;
        const updated = mapSubmission(row);
        setSubmissions(prev => {
          const exists = prev.some(s => s.id === updated.id);
          if (exists) return prev.map(s => s.id === updated.id ? updated : s);
          return [updated, ...prev];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Persist filters across tab changes
  useEffect(() => { localStorage.setItem('rem_filter_periods', JSON.stringify(selectedPeriods)); }, [selectedPeriods]);
  useEffect(() => { localStorage.setItem('rem_filter_branches', JSON.stringify(selectedBranchIds)); }, [selectedBranchIds]);
  useEffect(() => { localStorage.setItem('rem_filter_status', statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem('rem_filter_levy', String(levyOnly)); }, [levyOnly]);
  useEffect(() => { localStorage.setItem('rem_filter_negative', String(negativeOnly)); }, [negativeOnly]);

  const handleReview = async (submissionId: string | null, branchId: string, periodLabel: string, status: 'approved' | 'rejected', note?: string) => {
    setIsReviewing(true);
    try {
      const now = new Date().toISOString();
      if (submissionId) {
        const { error } = await supabase
          .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
          .update({ status, review_note: note || null, reviewed_at: now })
          .eq(DB_COLUMNS.ID, submissionId);
        if (error) throw error;
        setSubmissions(prev => prev.map(s =>
          s.id === submissionId ? { ...s, status, reviewNote: note || null } : s
        ));
      } else {
        const { data, error } = await supabase
          .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
          .insert({ branch_id: branchId, period_label: periodLabel, status, review_note: note || null, submitted_at: now, reviewed_at: now })
          .select().single();
        if (error) throw error;
        setSubmissions(prev => [mapSubmission(data), ...prev]);
      }
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleDeleteAdjustment = async (id: string) => {
    try {
      await supabase.from(DB_TABLES.REMITTANCE_ADJUSTMENTS).delete().eq(DB_COLUMNS.ID, id);
      setAdjustments(prev => prev.filter(a => a.id !== id));
      playSound('click');
    } catch (err) {
      console.error(err);
      playSound('warning');
    }
  };

  const handleMarkAllRemitted = async () => {
    setMarkAllConfirm(false);
    setIsReviewing(true);
    try {
      const now = new Date().toISOString();
      for (const { report, group, sub } of quickProcessItems) {
        if (sub?.id) {
          await supabase.from(DB_TABLES.REMITTANCE_SUBMISSIONS)
            .update({ status: 'approved', reviewed_at: now })
            .eq(DB_COLUMNS.ID, sub.id);
          setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, status: 'approved' } : s));
        } else {
          const { data } = await supabase.from(DB_TABLES.REMITTANCE_SUBMISSIONS)
            .insert({ branch_id: report.branchId, period_label: group.label, status: 'approved', submitted_at: now, reviewed_at: now })
            .select().single();
          if (data) setSubmissions(prev => [mapSubmission(data), ...prev]);
        }
      }
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleAddAdjustment = async (branchId: string, periodLabel: string) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(raw) || raw === 0) return;
    const amt = adjFormMode === 'deduct' ? -Math.abs(raw) : Math.abs(raw);
    setIsSavingAdj(true);
    try {
      const targetOwnerVal = adjTargetOwner || null;
      const { data, error } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .insert({
          branch_id: branchId,
          period_label: periodLabel,
          description: adjForm.description.trim().toUpperCase(),
          amount: amt,
          target_owner: targetOwnerVal,
        })
        .select().single();
      if (error) throw error;
      setAdjustments(prev => [...prev, {
        id: data.id, branchId: data.branch_id, periodLabel: data.period_label,
        description: data.description, amount: Number(data.amount),
        targetOwner: data.target_owner || null,
        createdAt: data.created_at,
      }]);
      setAdjForm({ description: '', amount: '' });
      setAdjTargetOwner('');
      setAdjFormKey(null);
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsSavingAdj(false);
    }
  };

  const allGroupedReports = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; branchAggregates: Record<string, any> }> = {};
    const now = getTrueDate();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    salesReports.forEach(report => {
      const branch = branches.find(b => b.id === report.branchId);
      if (!branch) return;
      const date = parseDate(report.reportDate);
      const { label, weekStart, weekEnd } = getWeekRange(date, branch);
      const weekEndDate = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
      if (weekEndDate > todayDate) return;
      const key = weekStart.getTime().toString();

      if (!groups[key]) groups[key] = { label, weekEnd, branchAggregates: {} };

      if (!groups[key].branchAggregates[report.branchId]) {
        groups[key].branchAggregates[report.branchId] = {
          branchId: report.branchId, branchName: branch.name, owners: branch.owners || [],
          groupLevy: branch.groupLevy || null,
          grossSales: 0, totalStaffPay: 0, totalExpenses: 0, totalVaultProvision: 0, netRoi: 0,
          isValidated: true, reportIds: []
        };
      }

      const agg = groups[key].branchAggregates[report.branchId];
      agg.grossSales          += report.grossSales || 0;
      agg.totalStaffPay       += report.totalStaffPay || 0;
      agg.totalExpenses       += report.totalExpenses || 0;
      agg.totalVaultProvision += report.totalVaultProvision || 0;
      agg.netRoi              += report.netRoi || 0;
      if (!report.isValidated) agg.isValidated = false;
      agg.reportIds.push(report.id);
    });

    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(key => ({
        label: groups[key].label,
        reports: Object.values(groups[key].branchAggregates)
          .sort((a: any, b: any) => a.branchName.localeCompare(b.branchName))
      }));
  }, [salesReports, branches]);

  const periodTabs = useMemo(() => {
    const tabs = allGroupedReports.map(group => {
      const total = group.reports.length;
      const submitted = group.reports.filter((r: any) => {
        const s = submissions.find(s => s.branchId === r.branchId && s.periodLabel === group.label);
        return s?.status === 'submitted';
      }).length;
      const approved = group.reports.filter((r: any) => {
        const s = submissions.find(s => s.branchId === r.branchId && s.periodLabel === group.label);
        return s?.status === 'approved';
      }).length;
      const rejected = group.reports.filter((r: any) => {
        const s = submissions.find(s => s.branchId === r.branchId && s.periodLabel === group.label);
        return s?.status === 'rejected';
      }).length;
      return { label: group.label, total, submitted, approved, rejected };
    });
    return tabs;
  }, [allGroupedReports, submissions]);

  const displayGroups = useMemo(() => {
    let groups = selectedPeriods.length === 0 ? allGroupedReports : allGroupedReports.filter(g => selectedPeriods.includes(g.label));
    if (selectedBranchIds.length > 0) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => selectedBranchIds.includes(r.branchId))
      })).filter(g => g.reports.length > 0);
    }
    if (statusFilter !== 'ALL') {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => {
          const sub = submissions.find(s => s.branchId === r.branchId && s.periodLabel === g.label);
          const status = sub?.status ?? null;
          if (statusFilter === 'none') return status === null || status === 'submitted' || status === 'validated';
          return status === statusFilter;
        })
      })).filter(g => g.reports.length > 0);
    }
    if (levyOnly) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => !!r.groupLevy),
      })).filter(g => g.reports.length > 0);
    }
    if (negativeOnly) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => {
          const rowAdj = adjustments.filter(a => a.branchId === r.branchId && a.periodLabel === g.label);
          const totalGlobalAdj = rowAdj.filter(a => !a.targetOwner).reduce((s, a) => s + a.amount, 0);
          return (r.netRoi + totalGlobalAdj) < 0;
        }),
      })).filter(g => g.reports.length > 0);
    }
    if (branchSearch.trim()) {
      const q = branchSearch.trim().toLowerCase();
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => {
          if (r.branchName.toLowerCase().includes(q)) return true;
          if (g.label.toLowerCase().includes(q)) return true;
          if ((r.owners || []).some((o: any) => o.name.toLowerCase().includes(q))) return true;
          const sub = submissions.find(s => s.branchId === r.branchId && s.periodLabel === g.label);
          const statusStr = sub?.status === 'approved' ? 'remitted' : sub?.status === 'rejected' ? 'rejected' : sub?.status === 'submitted' ? 'submitted' : 'pending';
          return statusStr.includes(q);
        })
      })).filter(g => g.reports.length > 0);
    }
    return groups;
  }, [allGroupedReports, selectedPeriods, selectedBranchIds, statusFilter, submissions, branchSearch, levyOnly, negativeOnly, adjustments]);

  // Pending branches for the quick-process strip (respects period + branch filter, ignores status filter)
  const quickProcessItems = useMemo(() => {
    let groups = selectedPeriods.length === 0 ? allGroupedReports : allGroupedReports.filter(g => selectedPeriods.includes(g.label));
    if (selectedBranchIds.length > 0) {
      groups = groups.map(g => ({ ...g, reports: g.reports.filter((r: any) => selectedBranchIds.includes(r.branchId)) })).filter(g => g.reports.length > 0);
    }
    const items: { report: any; group: any; sub: RemittanceSubmission | undefined; adjustedRoi: number }[] = [];
    groups.forEach(group => {
      group.reports.forEach((report: any) => {
        const sub = submissions.find(s => s.branchId === report.branchId && s.periodLabel === group.label);
        if (sub?.status === 'approved' || sub?.status === 'rejected') return;
        const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
        const totalGlobalAdj = rowAdj.filter(a => !a.targetOwner).reduce((s, a) => s + a.amount, 0);
        items.push({ report, group, sub, adjustedRoi: report.netRoi + totalGlobalAdj });
      });
    });
    return items;
  }, [allGroupedReports, selectedPeriods, selectedBranchIds, submissions, adjustments]);

  const handleExportPDF = () => {
    playSound('click');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const p = (n: number) => `₱${n.toLocaleString()}`;

      // Document header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('WEEKLY REMITTANCES REPORT', 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('Owner Distribution & Remittance Summary', 14, 27);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${dateStr}`, pageWidth - 14, 20, { align: 'right' });

      // Consolidated accumulators
      let totalGross = 0, totalSalary = 0, totalExpenses = 0, totalVault = 0, totalNet = 0, totalAdjRoi = 0;

      let currentY = 35;

      displayGroups.forEach((group, gIdx) => {
        if (gIdx > 0) currentY = (doc as any).lastAutoTable.finalY + 12;

        // Period section label
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(group.label.toUpperCase(), 14, currentY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`${group.reports.length} branch${group.reports.length !== 1 ? 'es' : ''}`, 14 + doc.getTextWidth(group.label.toUpperCase()) + 4, currentY);

        // Collect unique owner names for this period
        const ownerNames: string[] = [];
        group.reports.forEach((report: any) => {
          report.owners?.forEach((o: any) => {
            if (!ownerNames.includes(o.name)) ownerNames.push(o.name);
          });
        });

        const hasLevy = group.reports.some((r: any) => r.groupLevy);
        const head = [
          'Branch', 'Gross', 'Salary', 'Expenses', 'Vault', 'Net ROI', 'Adj.', 'Adj. ROI',
          ...(hasLevy ? ['Levy'] : []),
          ...ownerNames,
          'Status'
        ];
        const statusColIdx = head.length - 1;

        const body = group.reports.map((report: any) => {
          const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
          const globalAdj = rowAdj.filter(a => !a.targetOwner).reduce((s, a) => s + a.amount, 0);
          const ownerAdj = rowAdj.filter(a => !!a.targetOwner);
          const adjustedRoi = report.netRoi + globalAdj;
          const levy = report.groupLevy as { name: string; percentage: number } | null;
          const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
          const distributableRoi = adjustedRoi - levyCut;
          const sub = submissions.find(s => s.branchId === report.branchId && s.periodLabel === group.label);
          const status = sub?.status === 'approved' ? 'REMITTED' : sub?.status === 'rejected' ? 'REJECTED' : sub?.status === 'submitted' ? 'SUBMITTED' : 'PENDING';

          totalGross    += report.grossSales;
          totalSalary   += report.totalStaffPay;
          totalExpenses += report.totalExpenses;
          totalVault    += report.totalVaultProvision;
          totalNet      += report.netRoi;
          totalAdjRoi   += adjustedRoi;

          return [
            report.branchName.replace('BRANCH - ', ''),
            p(report.grossSales), p(report.totalStaffPay), p(report.totalExpenses), p(report.totalVaultProvision),
            p(report.netRoi), globalAdj !== 0 ? p(globalAdj) : '—', p(adjustedRoi),
            ...(hasLevy ? [levy ? p(-levyCut) : '—'] : []),
            ...ownerNames.map(name => {
              const owner = report.owners?.find((o: any) => o.name === name);
              if (!owner) return '—';
              const ot = ownerAdj.filter(a => a.targetOwner === name).reduce((s, a) => s + a.amount, 0);
              return p(distributableRoi * (owner.percentage / 100) + ot);
            }),
            status
          ];
        });

        // Build column styles dynamically
        const colStyles: Record<number, any> = {
          0: { fontStyle: 'bold', cellWidth: 36 },
          1: { halign: 'right' }, 2: { halign: 'right' },
          3: { halign: 'right' }, 4: { halign: 'right' },
          5: { halign: 'right' }, 6: { halign: 'right' },
          7: { halign: 'right', fontStyle: 'bold' },
        };
        let ci = 8;
        if (hasLevy) { colStyles[ci] = { halign: 'right' }; ci++; }
        ownerNames.forEach((_, i) => { colStyles[ci + i] = { halign: 'right' }; });
        colStyles[statusColIdx] = { halign: 'center', fontStyle: 'bold' };

        autoTable(doc, {
          startY: currentY + 4,
          head: [head],
          body,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 3, font: 'helvetica', valign: 'middle' },
          headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
          columnStyles: colStyles,
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === statusColIdx) {
              const val = data.cell.raw;
              if (val === 'REMITTED')  data.cell.styles.textColor = [5, 150, 105];
              else if (val === 'REJECTED')  data.cell.styles.textColor = [220, 38, 38];
              else if (val === 'SUBMITTED') data.cell.styles.textColor = [99, 102, 241];
              else                          data.cell.styles.textColor = [100, 116, 139];
            }
          }
        });
      });

      // Consolidated totals summary
      const finalY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('CONSOLIDATED TOTALS:', 14, finalY);
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        body: [
          ['Total Gross Sales',      p(totalGross)],
          ['Total Salary',           p(totalSalary)],
          ['Total Expenses',         p(totalExpenses)],
          ['Total Vault Provision',  p(totalVault)],
          ['Total Net ROI',          p(totalNet)],
          ['Total Adjusted ROI',     p(totalAdjRoi)],
        ],
        startY: finalY + 5,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { halign: 'left', fontStyle: 'bold' }
        }
      });

      doc.save(`Weekly_Remittances_${new Date().toISOString().split('T')[0]}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('PDF export failed:', err);
      playSound('warning');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-200/60 rounded-2xl animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-200/60 rounded-lg animate-pulse w-1/3" />
            <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/2" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-[24px] border border-slate-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 bg-slate-200/60 rounded-lg animate-pulse w-1/3" />
              <div className="h-7 bg-slate-200/60 rounded-xl animate-pulse w-20" />
            </div>
            <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/2" />
            <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {/* ── Single Remit Confirmation Modal ── */}
      {remitConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setRemitConfirm(null)}>
          <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight mb-1">Confirm Remittance</h3>
              <p className="text-sm text-slate-600">
                Mark <span className="font-black text-slate-900">{remitConfirm.branchName.replace('BRANCH - ', '')}</span> as remitted for period <span className="font-black text-slate-900">{remitConfirm.periodLabel}</span>?
              </p>
              <p className="text-xs text-slate-400 mt-2">This will record the remittance as approved. You can still reject it afterward if needed.</p>
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button onClick={() => setRemitConfirm(null)} className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all">
                Cancel
              </button>
              <button
                onClick={() => { handleReview(remitConfirm.submissionId, remitConfirm.branchId, remitConfirm.periodLabel, 'approved'); setRemitConfirm(null); }}
                disabled={isReviewing}
                className="px-7 py-3 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Confirm Remitted
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Mark All Confirmation Modal ── */}
      {markAllConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setMarkAllConfirm(false)}>
          <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight mb-1">Mark All Remitted</h3>
              <p className="text-sm text-slate-600">
                This will mark all <span className="font-black text-slate-900">{quickProcessItems.length} pending branch{quickProcessItems.length !== 1 ? 'es' : ''}</span> as remitted for the selected period.
              </p>
              <p className="text-xs text-slate-400 mt-2">This action applies to all branches currently visible in the pending list.</p>
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button onClick={() => setMarkAllConfirm(false)} className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all">
                Cancel
              </button>
              <button
                onClick={handleMarkAllRemitted}
                disabled={isReviewing}
                className="px-7 py-3 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Confirm All
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Header ── */}
      <div className="bg-white p-5 sm:p-6 rounded-[32px] border border-slate-200 shadow-sm">
        {/* Title row */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tighter leading-none mb-0.5">Weekly Remittances</h3>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-widest">Owner Distributions & Validation</p>
          </div>
          {/* Export — top-right on desktop */}
          <button
            onClick={handleExportPDF}
            className="hidden lg:flex items-center gap-2 px-4 h-9 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all shadow active:scale-95 shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export
          </button>
        </div>

        {/* Filters row — single line on desktop */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5">

          {/* Branch filter */}
          <div className="w-full lg:w-56 shrink-0">
            <BranchCheckboxDropdown
              branches={branches}
              selectedIds={selectedBranchIds}
              onChange={setSelectedBranchIds}
            />
          </div>

          {/* Period multi-select dropdown */}
          <div ref={periodDropdownRef} className="relative w-full lg:w-60 shrink-0">
            <button
              onClick={() => { setPeriodDropdownOpen(o => !o); playSound('click'); }}
              className={`h-10 flex items-center justify-between gap-2 px-4 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all outline-none w-full ${
                periodDropdownOpen
                  ? 'bg-white border-indigo-500 ring-4 ring-indigo-500/10 text-slate-900'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600'
              } ${selectedPeriods.length > 0 ? 'text-slate-900' : ''}`}
            >
              <span className="truncate">
                {selectedPeriods.length === 0
                  ? 'All Periods'
                  : selectedPeriods.length === 1
                  ? selectedPeriods[0]
                  : `${selectedPeriods.length} Periods`}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {selectedPeriods.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[8px] font-black flex items-center justify-center leading-none">
                    {selectedPeriods.length}
                  </span>
                )}
                <svg className={`w-3 h-3 transition-transform duration-200 ${periodDropdownOpen ? 'rotate-180 text-indigo-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {periodDropdownOpen && (
              <div className="absolute z-[200] top-[calc(100%+6px)] left-0 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
                <div className="max-h-72 overflow-y-auto overscroll-contain">
                  {/* All Periods option */}
                  <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 border-b border-slate-100 group">
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedPeriods.length === 0 ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 group-hover:border-indigo-400'
                    }`}>
                      {selectedPeriods.length === 0 && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <input type="checkbox" checked={selectedPeriods.length === 0} onChange={() => setSelectedPeriods([])} className="sr-only" />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${selectedPeriods.length === 0 ? 'text-indigo-600' : 'text-slate-500'}`}>
                      All Periods
                    </span>
                    <span className="ml-auto text-[10px] font-bold text-slate-500">
                      {new Set(allGroupedReports.flatMap(g => g.reports.map((r: any) => r.branchId))).size} branches
                    </span>
                  </label>

                  {periodTabs.map(tab => {
                    const checked = selectedPeriods.includes(tab.label);
                    const toggle = () => {
                      playSound('click');
                      setSelectedPeriods(prev =>
                        checked ? prev.filter(p => p !== tab.label) : [...prev, tab.label]
                      );
                    };
                    return (
                      <label key={tab.label} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 group">
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 group-hover:border-indigo-400'
                        }`}>
                          {checked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <input type="checkbox" checked={checked} onChange={toggle} className="sr-only" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] font-black uppercase tracking-widest truncate ${checked ? 'text-slate-900' : 'text-slate-500'}`}>
                            {tab.label}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-slate-500">{tab.total} branches</span>
                            {tab.submitted > 0 && <span className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="text-[9px] font-black text-amber-500">{tab.submitted}</span></span>}
                            {tab.approved > 0 && <span className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-[9px] font-black text-emerald-600">{tab.approved}</span></span>}
                            {tab.rejected > 0 && <span className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-400" /><span className="text-[9px] font-black text-rose-500">{tab.rejected}</span></span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {selectedPeriods.length > 0 && (
                  <div className="border-t border-slate-100 px-4 py-2">
                    <button
                      onClick={() => { setSelectedPeriods([]); playSound('click'); }}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors"
                    >
                      Clear selection
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-6 bg-slate-200 shrink-0" />

          {/* Branch search */}
          <div className="relative w-full lg:w-52 shrink-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <input
              type="text"
              value={branchSearch}
              onChange={e => setBranchSearch(e.target.value)}
              placeholder="Search branch, period, owner, status…"
              className="h-10 w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-4 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-slate-400 focus:bg-white transition-colors placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
            />
            {branchSearch && (
              <button onClick={() => setBranchSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-6 bg-slate-200 shrink-0" />

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { key: 'ALL',      label: 'All',     dot: 'bg-slate-300' },
              { key: 'approved', label: 'Remitted', dot: 'bg-emerald-400' },
              { key: 'none',     label: 'Pending',  dot: 'bg-slate-200' },
            ] as const).map(({ key, label, dot }) => {
              const isActive = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => { setStatusFilter(key); playSound('click'); }}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white shadow'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white' : dot}`} />
                  {label}
                </button>
              );
            })}

            {/* Levy filter toggle */}
            <button
              onClick={() => { setLevyOnly(v => !v); playSound('click'); }}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                levyOnly
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <span className="text-[11px] leading-none">🏦</span>
              With Levy
            </button>

            {/* Negative ROI filter toggle */}
            <button
              onClick={() => { setNegativeOnly(v => !v); playSound('click'); }}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                negativeOnly
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${negativeOnly ? 'bg-white' : 'bg-rose-400'}`} />
              Negative
            </button>
          </div>

          {/* Export — mobile only (hidden on lg+) */}
          <button
            onClick={handleExportPDF}
            className="lg:hidden flex items-center gap-2 px-4 h-9 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all shadow active:scale-95"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* ── Quick Process Strip ── */}
      {quickProcessItems.length > 0 && (
        <div className="bg-white rounded-[28px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                Pending — {quickProcessItems.length} branch{quickProcessItems.length !== 1 ? 'es' : ''}
              </span>
            </div>
            {!isReadOnly && (
              <button
                onClick={() => setMarkAllConfirm(true)}
                disabled={isReviewing}
                className="flex items-center gap-1.5 h-7 px-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40"
              >
                <CheckCircle className="w-3 h-3" /> Mark All Remitted
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {quickProcessItems.map(({ report, group, sub, adjustedRoi: itemRoi }) => (
              <div key={`${report.branchId}::${group.label}`} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">
                    {report.branchName.replace('BRANCH - ', '')}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{group.label}</p>
                </div>
                <div className="shrink-0 text-right w-28">
                  {itemRoi <= 0
                    ? <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nothing to remit</span>
                    : <span className="text-sm font-black tabular-nums text-slate-900">{fmt(itemRoi)}</span>
                  }
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => setRemitConfirm({ submissionId: sub?.id ?? null, branchId: report.branchId, periodLabel: group.label, branchName: report.branchName })}
                    disabled={isReviewing}
                    className="flex items-center gap-1.5 h-7 px-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                  >
                    <CheckCircle className="w-3 h-3" /> Remitted
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty ── */}
      {displayGroups.length === 0 ? (
        <div className="bg-white p-20 rounded-[40px] border border-slate-100 text-center space-y-4">
          <div className="text-6xl opacity-20">📭</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No weekly reports found for remittance.</p>
        </div>
      ) : (
        <div className="space-y-14">
          {displayGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-4">

              {/* Period header */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-sm font-black text-slate-900 uppercase tracking-[0.2em] whitespace-nowrap">
                  {group.label}
                </span>
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
                  {group.reports.length} branch{group.reports.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {/* Branch cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.reports.map((report: any) => {
                  const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
                  const globalAdj = rowAdj.filter(a => !a.targetOwner);
                  const ownerAdj = rowAdj.filter(a => !!a.targetOwner);
                  const totalGlobalAdj = globalAdj.reduce((s, a) => s + a.amount, 0);
                  const adjustedRoi = report.netRoi + totalGlobalAdj;
                  const levy = report.groupLevy as { name: string; percentage: number } | null;
                  const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
                  const distributableRoi = adjustedRoi - levyCut;
                  const hasAdj = rowAdj.length > 0;
                  const sub = submissions.find(s => s.branchId === report.branchId && s.periodLabel === group.label);
                  const rKey = `${report.branchId}::${group.label}`;
                  const cardId = `branch-card-${report.branchId}-${group.label.replace(/[\s,/]/g, '-')}`;

                  return (
                    <div key={report.branchId} id={cardId} className={`bg-white rounded-[28px] shadow-sm overflow-hidden border ${
                      sub?.status === 'approved'  ? 'border-emerald-300' :
                      sub?.status === 'rejected'  ? 'border-rose-300' :
                      'border-slate-100'
                    }`}>

                      {/* Card header */}
                      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
                        <div>
                          <p className="font-black text-slate-900 uppercase tracking-tight text-sm leading-none">
                            {report.branchName.replace('BRANCH - ', '')}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                            {report.reportIds.length} day{report.reportIds.length !== 1 ? 's' : ''} aggregated
                          </p>
                        </div>
                      </div>

                      {/* ── Remittance ribbon ── */}
                      {(!sub || sub.status === 'submitted' || sub.status === 'validated') && (
                        <div className="flex items-center justify-between gap-2.5 px-6 py-2.5 bg-slate-50 border-b border-slate-100">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${adjustedRoi <= 0 ? 'bg-slate-400' : 'bg-slate-300'}`} />
                            <span className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
                              {adjustedRoi <= 0 ? 'Nothing To Remit' : 'Pending'}
                            </span>
                          </div>
                          {!isReadOnly && (
                            <button
                              onClick={() => setRemitConfirm({ submissionId: sub?.id ?? null, branchId: report.branchId, periodLabel: group.label, branchName: report.branchName })}
                              disabled={isReviewing}
                              className="flex items-center gap-1.5 h-7 px-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 hover:bg-emerald-700"
                            >
                              <CheckCircle className="w-3 h-3" /> Mark Remitted
                            </button>
                          )}
                        </div>
                      )}

                      {sub?.status === 'approved' && (
                        <div className="flex items-center gap-2.5 px-6 py-2.5 bg-emerald-50 border-b border-emerald-200">
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">
                            {adjustedRoi <= 0 ? 'Nothing to Remit — Done' : 'Remitted — Done'}
                          </span>
                        </div>
                      )}

                      {sub?.status === 'rejected' && (
                        <div className="flex items-center gap-2.5 px-6 py-2.5 bg-rose-50 border-b border-rose-200">
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-black text-rose-600 uppercase tracking-widest">Remittance Rejected</span>
                            {sub.reviewNote && <span className="text-[9px] font-bold text-rose-400 ml-2">— {sub.reviewNote}</span>}
                          </div>
                        </div>
                      )}

                      <div className="p-5 sm:p-6 space-y-5">

                        {/* Adjusted ROI — hero */}
                        <div>
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">
                            {hasAdj ? 'Adjusted ROI' : 'Net ROI'}
                          </p>
                          <p className={`text-3xl font-black tabular-nums leading-none ${adjustedRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {fmt(adjustedRoi)}
                          </p>
                          {hasAdj && (
                            <p className="text-xs font-medium text-slate-600 mt-1">
                              Base {fmt(report.netRoi)}&nbsp;&nbsp;{totalGlobalAdj >= 0 ? '+' : '−'}&nbsp;{fmt(Math.abs(totalGlobalAdj))} adj
                              {ownerAdj.length > 0 && <span className="ml-1 text-[10px] text-slate-400">+ {ownerAdj.length} owner-targeted</span>}
                            </p>
                          )}
                        </div>

                        {/* Financial breakdown */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Gross Sales', value: report.grossSales, prefix: '' },
                            { label: 'Salary',      value: report.totalStaffPay, prefix: '−' },
                            { label: 'Expenses',    value: report.totalExpenses, prefix: '−' },
                            { label: 'Vault / Bills', value: report.totalVaultProvision, prefix: '−' },
                          ].map(col => (
                            <div key={col.label} className="bg-slate-50 rounded-xl px-3 py-3">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{col.label}</p>
                              <p className="text-sm font-black text-slate-700 tabular-nums">{col.prefix} {fmt(col.value || 0)}</p>
                            </div>
                          ))}
                        </div>

                        {/* Group levy */}
                        {levy && (
                          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-7 h-7 rounded-xl bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 shrink-0">🏦</div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-indigo-900 uppercase tracking-tight leading-none truncate">{levy.name}</p>
                                <p className="text-[10px] font-bold text-indigo-600 mt-0.5">{levy.percentage}% group levy</p>
                              </div>
                            </div>
                            <span className="text-base font-black tabular-nums shrink-0 text-indigo-700">
                              −{fmt(levyCut)}
                            </span>
                          </div>
                        )}

                        {/* Owner distribution */}
                        {report.owners.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                              Owner Cut{levy ? ` (of ${fmt(distributableRoi)} after levy)` : ''}
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {report.owners.map((owner: any, oIdx: number) => {
                                const ownerTargeted = ownerAdj.filter(a => a.targetOwner === owner.name).reduce((s, a) => s + a.amount, 0);
                                const share = distributableRoi * (owner.percentage / 100) + ownerTargeted;
                                return (
                                  <div key={oIdx} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-7 h-7 rounded-xl bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600 shrink-0">
                                        {owner.name.charAt(0)}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none truncate">{owner.name}</p>
                                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                                          {owner.percentage}%
                                          {ownerTargeted !== 0 && <span className="ml-1 text-[10px] text-rose-500">adj {ownerTargeted >= 0 ? '+' : ''}{fmt(ownerTargeted)}</span>}
                                        </p>
                                      </div>
                                    </div>
                                    <span className={`text-base font-black tabular-nums shrink-0 ${share < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                      {fmt(share)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            {report.owners.length > 1 && (
                              <div className="flex items-center justify-between px-4 py-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Distributed</span>
                                <span className="text-sm font-black tabular-nums text-slate-700">
                                  {fmt(report.owners.reduce((s: number, o: any) => {
                                    const ot = ownerAdj.filter(a => a.targetOwner === o.name).reduce((sum, a) => sum + a.amount, 0);
                                    return s + distributableRoi * (o.percentage / 100) + ot;
                                  }, 0))}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {report.owners.length === 0 && (
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest italic">
                            No owners configured — add them in Branch Editor → Owner Shares
                          </p>
                        )}

                        {/* Adjustments */}
                        <div className="h-px bg-slate-100" />
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Adjustments</p>
                            {!isReadOnly && adjFormKey !== rKey && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setAdjFormMode('add'); setAdjFormKey(rKey); setAdjForm({ description: '', amount: '' }); playSound('click'); }}
                                  className="flex items-center gap-1 h-7 px-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-black text-slate-700 uppercase tracking-widest transition-colors"
                                >
                                  <Plus className="w-3 h-3" /> Add
                                </button>
                                <button
                                  onClick={() => { setAdjFormMode('deduct'); setAdjFormKey(rKey); setAdjForm({ description: '', amount: '' }); playSound('click'); }}
                                  className="flex items-center gap-1 h-7 px-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-black text-slate-700 uppercase tracking-widest transition-colors"
                                >
                                  <Minus className="w-3 h-3" /> Deduct
                                </button>
                              </div>
                            )}
                          </div>

                          {rowAdj.map(adj => (
                            <div
                              key={adj.id}
                              className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 gap-4"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${adj.amount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-slate-800 uppercase tracking-tight truncate block">{adj.description}</span>
                                  {adj.targetOwner && (
                                    <span className="text-[8px] font-bold text-rose-400 uppercase tracking-widest">→ {adj.targetOwner}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[11px] font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                                  {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                                </span>
                                {!isReadOnly && (
                                  <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-0.5">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {rowAdj.length === 0 && adjFormKey !== rKey && (
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest italic">No adjustments</p>
                          )}

                          {adjFormKey === rKey && (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                              <div className="flex items-center gap-2">
                                {adjFormMode === 'add' ? <Plus className="w-3.5 h-3.5 text-slate-500" /> : <Minus className="w-3.5 h-3.5 text-slate-500" />}
                                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                                  {adjFormMode === 'add'
                                    ? adjTargetOwner ? `Add to ${adjTargetOwner}` : 'Add to ROI'
                                    : adjTargetOwner ? `Deduct from ${adjTargetOwner}` : 'Deduct from ROI'}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={adjForm.description}
                                onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
                                placeholder={adjFormMode === 'add' ? 'Reason (e.g. Boosting)' : 'Reason (e.g. Extra Expense)'}
                                autoFocus
                                className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase outline-none focus:border-slate-400 transition-colors"
                              />
                              {report.owners.length > 0 && (
                                <select
                                  value={adjTargetOwner}
                                  onChange={e => setAdjTargetOwner(e.target.value)}
                                  className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase outline-none focus:border-slate-400 transition-colors appearance-none"
                                >
                                  <option value="">All Owners (Global)</option>
                                  {report.owners.map((o: any) => (
                                    <option key={o.name} value={o.name}>{o.name}</option>
                                  ))}
                                </select>
                              )}
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[12px] font-black text-slate-400">₱</span>
                                <input
                                  type="number" step="0.01" min="0"
                                  value={adjForm.amount}
                                  onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-full bg-white border border-slate-200 pl-8 pr-4 py-2.5 rounded-xl text-[13px] font-black outline-none focus:border-slate-400 transition-colors tabular-nums"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => { setAdjFormKey(null); setAdjForm({ description: '', amount: '' }); setAdjTargetOwner(''); }}
                                  className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleAddAdjustment(report.branchId, group.label)}
                                  disabled={isSavingAdj || !adjForm.description.trim() || !adjForm.amount}
                                  className="h-10 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                                >
                                  {isSavingAdj ? '…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>


                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
