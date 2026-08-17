import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SalesReport, Expense, Branch, BranchVault } from '../../../../types';
import { UI_THEME } from '../../../../constants/ui_designs';
import { playSound } from '../../../../lib/audio';
import { toDateStr, getWeekRange, parseDate } from '@/src/utils/reportUtils';
import { PerformanceRow } from './PerformanceRow';
import { SalesKPIStrip } from '../sales-today/SalesKPIStrip';
import { SessionLogs } from '../sales-today/SessionLogs';
import { ExpenseDetailModal } from '../sales-today/ExpenseDetailModal';
import { ReportEditorModal } from '../../../superadmin/ReportEditorModal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../../constants/db_schema';

interface ReportDashboardModalProps {
  report: SalesReport;
  constituents?: SalesReport[];
  branchName: string;
  employees?: any[];
  onClose: () => void;
  canEdit?: boolean;
  branch?: Branch;
  branches?: Branch[];
  branchVaults?: BranchVault[];
  vaultStartDate?: string | null;
}

export const ReportDashboardModal: React.FC<ReportDashboardModalProps> = ({ report: reportProp, constituents: constituentsProp = [], branchName, employees = [], onClose, canEdit, branch, branches = [], branchVaults = [], vaultStartDate }) => {
  const [report, setReport] = useState<SalesReport>(reportProp);
  const [constituents, setConstituents] = useState<SalesReport[]>(constituentsProp);
  const [vaultDepositTxs, setVaultDepositTxs] = useState<any[]>([]);
  const [isFetchingLatest, setIsFetchingLatest] = useState(false); // background-only — never blocks render
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [drilldownReport, setDrilldownReport] = useState<SalesReport | null>(null);
  const [drilldownConstituents, setDrilldownConstituents] = useState<SalesReport[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPDFConfirm, setShowPDFConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Stale-while-revalidate: show prop data immediately, silently refresh in background.
  // isFetchingLatest is only used for a subtle indicator — never blocks rendering.
  useEffect(() => {
    const isAggregateSyntheticId = reportProp.id.includes('-') && !reportProp.id.match(/^[0-9a-f-]{36}$/i);
    if (isAggregateSyntheticId || !supabase) return;

    let cancelled = false;
    (async () => {
      setIsFetchingLatest(true);
      try {
        const [{ data, error }, { data: vaultTxData }] = await Promise.all([
          supabase
            .from(DB_TABLES.SALES_REPORTS)
            .select('*')
            .eq(DB_COLUMNS.ID, reportProp.id)
            .single(),
          supabase
            .from(DB_TABLES.VAULT_TRANSACTIONS)
            .select('id, amount, name, timestamp, performed_by')
            .eq(DB_COLUMNS.BRANCH_ID, reportProp.branchId)
            .eq(DB_COLUMNS.TYPE, 'DEPOSIT')
            .gte(DB_COLUMNS.TIMESTAMP, `${reportProp.reportDate}T00:00:00+08:00`)
            .lt(DB_COLUMNS.TIMESTAMP, `${reportProp.reportDate}T23:59:59.999+08:00`),
        ]);
        if (cancelled || error || !data) return;

        const liveVaultProvision = (vaultTxData || []).reduce(
          (s: number, t: any) => s + Number(t[DB_COLUMNS.AMOUNT] ?? 0), 0
        );
        const dbVaultProvision = Number(data[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0);
        const resolvedVaultProvision = Math.max(liveVaultProvision, dbVaultProvision);
        const resolvedNetRoi = Number(data[DB_COLUMNS.NET_ROI] ?? 0);

        setVaultDepositTxs(vaultTxData || []);
        setReport({
          id: data[DB_COLUMNS.ID],
          branchId: data[DB_COLUMNS.BRANCH_ID],
          reportDate: data[DB_COLUMNS.REPORT_DATE],
          submittedAt: data[DB_COLUMNS.SUBMITTED_AT],
          grossSales: Number(data[DB_COLUMNS.GROSS_SALES] ?? 0),
          totalStaffPay: Number(data[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
          totalExpenses: Number(data[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
          totalVaultProvision: resolvedVaultProvision,
          netRoi: resolvedNetRoi,
          sessionData: data[DB_COLUMNS.SESSION_DATA] ?? [],
          staffBreakdown: data[DB_COLUMNS.STAFF_BREAKDOWN] ?? [],
          expenseData: data[DB_COLUMNS.EXPENSE_DATA] ?? [],
          vaultData: data[DB_COLUMNS.VAULT_DATA] ?? [],
          reportType: reportProp.reportType,
          sortDate: reportProp.sortDate,
          periodEnd: reportProp.periodEnd,
        });
      } catch { /* silent — prop data remains visible */ } finally {
        if (!cancelled) setIsFetchingLatest(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportProp.id]);

  const isAggregate = constituents.length > 0;

  const isLateClockIn = (clockInStr?: string, openingTime?: string): boolean => {
    if (!clockInStr || !openingTime) return false;
    const manilaClockIn = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(clockInStr));
    const [clockH, clockM] = manilaClockIn.split(':').map(Number);
    const [openH, openM] = openingTime.split(':').map(Number);
    return (clockH * 60 + clockM) > (openH * 60 + openM + 10);
  };

  const reportDateStr = report.reportDate?.slice(0, 10) ?? '';
  const isBackfill = report.id.includes('_BACKFILL_');
  const resolvedVaultStartDate = branchVaults.find(v => v.branchId === report.branchId)?.startDate ?? vaultStartDate ?? null;
  const reportBranchVaultEnabled = (branch ?? branches.find(b => b.id === report.branchId))?.vaultEnabled ?? false;
  const isLegacy = !reportBranchVaultEnabled || !resolvedVaultStartDate || reportDateStr < resolvedVaultStartDate;
  const branchVault = branchVaults.find(v => v.branchId === report.branchId);
  const vaultBalance = branchVault?.balance ?? 0;
  const vaultTarget = branchVault?.target ?? 0;

  // Derive net operational expense from report-level fields (avoids relying on expenseData snapshot).
  // Formula: gross − netRoi − totalStaffPay − totalVaultProvision
  // Works for both legacy (totalVaultProvision = provision) and non-legacy (totalVaultProvision = vault deposit).
  const getConstituentCashOut = (r: SalesReport): number => {
    return Math.max(0, r.grossSales - r.netRoi - r.totalStaffPay - Number(r.totalVaultProvision || 0));
  };

  // ROI-only operational expense — mirrors the same logic as ReportTable.tsx.
  // Uses r.totalExpenses as base (already ROI-only when VAULT_WITHDRAWAL records exist),
  // with a from_vault fallback for transition-period reports.
  const getConstituentROIExp = (r: SalesReport): number => {
    const base = Number(r.totalExpenses || 0);
    if (getConstituentIsLegacy(r)) return base;
    const expData: any[] = r.expenseData || [];
    const hasVaultRecords = expData.some(e => e.category === 'VAULT_WITHDRAWAL');
    if (hasVaultRecords) return base; // totalExpenses is already ROI-only
    const vaultCovered = expData
      .filter(e => e.category === 'OPERATIONAL')
      .reduce((s, e) => s + Number(e.from_vault || 0), 0);
    return Math.max(0, base - vaultCovered);
  };

  // Vault deposit for non-legacy constituents — stored as totalVaultProvision
  const getConstituentVaultDeposit = (r: SalesReport): number => {
    if (getConstituentIsLegacy(r)) return 0;
    return Number(r.totalVaultProvision || 0);
  };

  // Per-constituent legacy check using each branch's own vault start date and vaultEnabled flag
  const getConstituentIsLegacy = (r: SalesReport) => {
    const constituentBranch = branches.find(b => b.id === r.branchId);
    if (!constituentBranch?.vaultEnabled) return true;
    const startDate = branchVaults.find(v => v.branchId === r.branchId)?.startDate ?? null;
    return !startDate || r.reportDate < startDate;
  };

  // For legacy constituents, totalVaultProvision stores the sum of PROVISION (rent & bills) expenses.
  // For non-legacy constituents, return 0 — vault deposits are tracked separately.
  const getConstituentProvision = (r: SalesReport): number => {
    if (!getConstituentIsLegacy(r)) return 0;
    return Number(r.totalVaultProvision || 0);
  };

  // Vault-covered expense amount for a constituent — the portion of expenses paid from vault fund.
  const getConstituentVaultCoveredExp = (r: SalesReport): number => {
    if (getConstituentIsLegacy(r)) return 0;
    const expData: any[] = r.expenseData || [];
    const fromRecords = expData
      .filter(e => e.category === 'VAULT_WITHDRAWAL')
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    if (fromRecords > 0) return fromRecords;
    return expData
      .filter(e => e.category === 'OPERATIONAL')
      .reduce((s, e) => s + Number(e.from_vault || 0), 0);
  };

  const rentAndBillsEntries = useMemo(() => [
    ...(report.vaultData || []).filter((e: any) => e.category === 'PROVISION'),
    ...(report.expenseData || []).filter((e: any) => e.category === 'PROVISION'),
  ], [report.vaultData, report.expenseData]);
  const vaultDepositEntries = useMemo(() =>
    (report.vaultData || []).filter((e: any) => e.category === 'VAULT_DEPOSIT'),
  [report.vaultData]);
  const operationalExpenses = useMemo(() =>
    (report.expenseData || []).filter((e: any) => e.category === 'OPERATIONAL'),
  [report.expenseData]);
  const vaultWithdrawalTotal = useMemo(() => {
    const expenseData = report.expenseData || [];
    // Primary: sum VAULT_WITHDRAWAL category records
    const fromRecords = expenseData
      .filter((e: any) => e.category === 'VAULT_WITHDRAWAL')
      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    if (fromRecords > 0) return fromRecords;
    // Fallback: sum from_vault fields on OPERATIONAL expenses (newer annotated format)
    return expenseData
      .filter((e: any) => e.category === 'OPERATIONAL')
      .reduce((s: number, e: any) => s + (Number(e.from_vault) || 0), 0);
  }, [report.expenseData]);

  // Total displayed in KPI strip. When VAULT_WITHDRAWAL records exist, total_expenses column
  // stores ROI-only so we add them back. When using the from_vault fallback, OPERATIONAL
  // amounts already include the vault portion so we sum expense_data directly.
  const displayOperationalExp = useMemo(() => {
    const expenseData = report.expenseData || [];
    const hasVaultRecords = expenseData.some((e: any) => e.category === 'VAULT_WITHDRAWAL');
    if (hasVaultRecords) {
      return Number(report.totalExpenses || 0) + vaultWithdrawalTotal;
    }
    const opSum = expenseData
      .filter((e: any) => e.category === 'OPERATIONAL')
      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    return opSum > 0 ? opSum : Number(report.totalExpenses || 0);
  }, [report.expenseData, report.totalExpenses, vaultWithdrawalTotal]);
  // vault-covered = sum of VAULT_WITHDRAWAL expense amounts (the actual vault-funded portion).
  // Summing the matched OPERATIONAL amounts was wrong when only part of an expense is vault-covered.
  const vaultCoveredExpTotal = useMemo(() => {
    const expenseData = report.expenseData || [];
    // Primary: VAULT_WITHDRAWAL records carry the exact vault-funded amount
    const fromRecords = expenseData
      .filter((e: any) => e.category === 'VAULT_WITHDRAWAL')
      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    if (fromRecords > 0) return fromRecords;
    // Fallback: from_vault annotations on OPERATIONAL records (older format)
    return expenseData
      .filter((e: any) => e.category === 'OPERATIONAL')
      .reduce((s: number, e: any) => s + (Number(e.from_vault) || 0), 0);
  }, [report.expenseData]);

  // Maps expense name → vault amount covered (e.g. "ELECTRICITY" → 300)
  const vaultCoverageMap = useMemo(() => {
    const map: Record<string, number> = {};
    (report.expenseData || [])
      .filter((e: any) => e.category === 'VAULT_WITHDRAWAL')
      .forEach((e: any) => {
        const expName = (e.name || '').replace(/^VAULT:\s*/i, '').trim().toUpperCase();
        map[expName] = (map[expName] ?? 0) + (Number(e.amount) || 0);
      });
    return map;
  }, [report.expenseData]);

  const displayDate = useMemo(() => {
    if (isAggregate) return report.reportDate;
    return parseDate(report.reportDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  }, [report.reportDate, isAggregate]);

  const financialBreakdown = useMemo(() => {
    const breakdown = {
      allowances: 0,
      ot: 0,
      late: 0,
      advances: 0,
      cashTotal: 0,
      gcashTotal: 0
    };

    (report.staffBreakdown || []).filter((s: any) => !s.isReliever).forEach((s: any) => {
      breakdown.allowances += Number(s.allowance || 0);
      breakdown.ot += Number(s.attendance?.otPay || s.attendance?.ot_pay || 0);
      breakdown.late += Number(s.attendance?.lateDeduction || s.attendance?.late_deduction || 0);
      breakdown.advances += Number(s.attendance?.cashAdvance || s.attendance?.cash_advance || 0);
    });

    (report.sessionData || []).forEach((t: any) => {
      const total = Number(t.total || 0);
      if (t.paymentMethod === 'GCASH') {
        breakdown.gcashTotal += total;
      } else {
        // Default to CASH if not specified
        breakdown.cashTotal += total;
      }
    });

    return breakdown;
  }, [report.staffBreakdown, report.sessionData]);

  // Recompute staff pay excluding relievers — fixes legacy reports where totalStaffPay
  // was stored including reliever allowances/commissions before the reliever-as-expense model.
  // Only use the recomputed value when it is strictly lower than the stored total; if it is
  // higher the staffBreakdown allowance fields are inflated (e.g. cash advances baked in),
  // and the stored totalStaffPay is the authoritative correct figure.
  const displayStaffPay = useMemo(() => {
    const stored = Number(report.totalStaffPay || 0);
    if (!report.staffBreakdown?.length) return stored;
    const recomputed = (report.staffBreakdown as any[])
      .filter((s: any) => !s.isReliever)
      .reduce((sum: number, s: any) => {
        const att = s.attendance;
        return sum
          + (Number(s.commission) || 0)
          + (Number(s.allowance) || 0)
          + (Number(att?.otPay || att?.ot_pay) || 0)
          - (Number(att?.lateDeduction || att?.late_deduction) || 0);
      }, 0);
    return recomputed < stored ? recomputed : stored;
  }, [report.staffBreakdown, report.totalStaffPay]);


  const handleExportPDF = async (confirmed = false) => {
    if (!confirmed) {
      playSound('warning');
      setShowPDFConfirm(true);
      return;
    }

    setShowPDFConfirm(false);
    setIsExporting(true);
    playSound('click');

    try {
      // Re-fetch fresh report data so totals (totalExpenses, netRoi, etc.) are never stale
      let freshReport = report;
      if (!isAggregate && supabase) {
        const { data: freshData } = await supabase
          .from(DB_TABLES.SALES_REPORTS)
          .select('*')
          .eq(DB_COLUMNS.ID, report.id)
          .maybeSingle();
        if (freshData) {
          freshReport = {
            ...report,
            totalExpenses: Number(freshData[DB_COLUMNS.TOTAL_EXPENSES] ?? report.totalExpenses),
            totalStaffPay: Number(freshData[DB_COLUMNS.TOTAL_STAFF_PAY] ?? report.totalStaffPay),
            totalVaultProvision: Number(freshData[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? report.totalVaultProvision),
            netRoi: Number(freshData[DB_COLUMNS.NET_ROI] ?? report.netRoi),
            grossSales: Number(freshData[DB_COLUMNS.GROSS_SALES] ?? report.grossSales),
            expenseData: typeof freshData[DB_COLUMNS.EXPENSE_DATA] === 'string'
              ? JSON.parse(freshData[DB_COLUMNS.EXPENSE_DATA])
              : (freshData[DB_COLUMNS.EXPENSE_DATA] || report.expenseData),
          };
        }
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // 1. Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text((branchName || '').toUpperCase(), 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-400
      doc.text(isAggregate ? 'CONSOLIDATED PERIOD REPORT' : 'DAILY OPERATIONAL LEDGER', 14, 26);

      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(displayDate, pageWidth - 14, 20, { align: 'right' });

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Report ID: ${report.id.toUpperCase()}`, pageWidth - 14, 26, { align: 'right' });

      // 2. Financial Summary
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('FINANCIAL SUMMARY', 14, 40);

      const provisionLabel = isLegacy ? 'Provision (Rent & Bills)' : 'Vault Deposit';

      // Use freshReport for all financial figures — avoids stale React Query cache
      // total_expenses is stored as ROI-only; full operational = totalExpenses + vault covered
      const freshRoiOperational = Number(freshReport.totalExpenses || 0);
      const freshExpenseData: any[] = typeof freshReport.expenseData === 'string'
        ? JSON.parse(freshReport.expenseData)
        : (freshReport.expenseData || []);
      const freshVaultCoveredFromRecords = freshExpenseData
        .filter((e: any) => e.category === 'VAULT_WITHDRAWAL')
        .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
      const freshTotalOperational = freshVaultCoveredFromRecords > 0
        ? freshRoiOperational + freshVaultCoveredFromRecords
        : freshExpenseData.filter((e: any) => e.category === 'OPERATIONAL').reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0) || freshRoiOperational;
      const vaultCoveredInPDF = Math.max(0, freshTotalOperational - freshRoiOperational);

      const summaryBody: [string, string][] = [
        ['Gross Sales', `PHP ${Number(freshReport.grossSales || 0).toLocaleString()}`],
        ['  - Cash Payments', `PHP ${financialBreakdown.cashTotal.toLocaleString()}`],
        ['  - GCash Payments', `PHP ${financialBreakdown.gcashTotal.toLocaleString()}`],
        ['Operational Expenses (from ROI)', `PHP ${freshRoiOperational.toLocaleString()}`],
        ...(vaultCoveredInPDF > 0 ? [['  + Vault Covered', `PHP ${vaultCoveredInPDF.toLocaleString()}`] as [string, string]] : []),
        ['Staff Payroll', `PHP ${displayStaffPay.toLocaleString()}`],
        [provisionLabel, `PHP ${Number(freshReport.totalVaultProvision || 0).toLocaleString()}`],
        ['Net ROI', `PHP ${Number(freshReport.netRoi || 0).toLocaleString()}`],
      ];
      autoTable(doc, {
        startY: 43,
        head: [['Metric', 'Amount']],
        body: summaryBody,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold' }
        },
        rowPageBreak: 'avoid'
      });

      let currentY = ((doc as any).lastAutoTable?.finalY ?? 0) + 15;

      if (isAggregate) {
        // 3. Constituent Units
        doc.setFontSize(11);
        doc.text('CONSTITUENT UNIT BREAKDOWN', 14, currentY);

        autoTable(doc, {
          startY: currentY + 3,
          head: [['Date', 'Gross', 'Payroll', 'Expenses', 'Provision', 'Net ROI']],
          body: constituents.sort((a,b) => (a.reportDate || '').localeCompare(b.reportDate || '')).map(sub => {
            const subIsLegacy = getConstituentIsLegacy(sub);
            const subExp = getConstituentROIExp(sub);
            const subProvision = subIsLegacy ? getConstituentProvision(sub) : getConstituentVaultDeposit(sub);
            const provisionNote = subIsLegacy ? 'R&B' : 'VD';
            return [
              new Date(sub.reportDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase(),
              `PHP ${sub.grossSales.toLocaleString()}`,
              `PHP ${sub.totalStaffPay.toLocaleString()}`,
              `PHP ${subExp.toLocaleString()}`,
              subProvision > 0 ? `PHP ${subProvision.toLocaleString()} (${provisionNote})` : '—',
              `PHP ${sub.netRoi.toLocaleString()}`
            ];
          }),
          theme: 'grid',
          headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
          styles: { fontSize: 8 },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold' }
          },
          rowPageBreak: 'avoid'
        });
        currentY = ((doc as any).lastAutoTable?.finalY ?? 0) + 15;
      }

      // 4. Session Logs
      doc.setFontSize(11);
      doc.text('SESSION LOGS', 14, currentY);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Time', 'Client', 'Service', 'Total', 'Settlement', 'Providers', 'ROI']],
        body: (report.sessionData || []).map(t => {
          const therapistComm = Number(t.primaryCommission) || 0;
          const bonesetterComm = Number(t.secondaryCommission) || 0;
          const sessionDeduction = Number(t.deduction) || 0;
          const netTotal = (Number(t.basePrice) - (Number(t.discount) || 0));
          const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);

          let providers = '';
          if (t.therapistName) providers += `T: ${t.therapistName} (P${therapistComm})`;
          if (t.bonesetterName) providers += `${providers ? '\n' : ''}B: ${t.bonesetterName} (P${bonesetterComm})`;

          const settlement = t.settlement 
            ? t.settlement.toUpperCase() 
            : `${t.paymentMethod || 'CASH'} (${t.paymentStatus || 'PAID'})`;

          return [
            new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(t.timestamp)),
            (t.clientName || '').toUpperCase(),
            (t.serviceName || '').toUpperCase(),
            `PHP ${netTotal.toLocaleString()}`,
            settlement.toUpperCase(),
            providers,
            `PHP ${netRoi.toLocaleString()}`
          ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 7 },
        columnStyles: {
          3: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold' }
        },
        rowPageBreak: 'avoid'
      });

      currentY = ((doc as any).lastAutoTable?.finalY ?? 0) + 15;

      // Check for page overflow
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // 5. Staff Performance
      doc.setFontSize(11);
      doc.text('STAFF PERFORMANCE MATRIX', 14, currentY);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Employee', 'Sessions', 'Base Pay', 'Late', 'OT', 'Advance', 'Final Pay']],
        body: (report.staffBreakdown || []).map(s => {
          const late = Number(s.attendance?.lateDeduction || s.attendance?.late_deduction || 0);
          const ot = Number(s.attendance?.otPay || s.attendance?.ot_pay || 0);
          const adv = Number(s.attendance?.cashAdvance || s.attendance?.cash_advance || 0);
          const baseComm = Number(s.commission || 0);
          const baseAllw = Number(s.allowance || 0);
          const finalPay = baseComm + baseAllw + ot - late;
          const resolvedName = employees.find(e => e.id === s.employeeId)?.name || s.name || 'Unknown Staff';
          const isReliever = typeof s.isReliever === 'boolean' ? s.isReliever : (s.employeeId && report.branchId !== 'all' && employees.find(e => e.id === s.employeeId)?.branchId !== report.branchId);
          const isHalfDay = s.attendance?.isHalfDay || s.attendance?.is_half_day || false;

          let displayName = resolvedName.toUpperCase();
          if (isReliever) displayName += ' (RELIEVER)';
          if (isHalfDay) displayName += ' (HALF DAY)';

          return [
            displayName,
            Number(s.count || 0),
            `PHP ${(baseComm + baseAllw).toLocaleString()}`,
            `-PHP ${late.toLocaleString()}`,
            `+PHP ${ot.toLocaleString()}`,
            `PHP ${adv.toLocaleString()}`,
            `PHP ${finalPay.toLocaleString()}`
          ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold' }
        },
        rowPageBreak: 'avoid'
      });

      currentY = ((doc as any).lastAutoTable?.finalY ?? 0) + 15;

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // 6. Expenses
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('OPERATIONAL EXPENSES', 14, currentY);

      // For non-legacy: show OPERATIONAL items with vault coverage note; exclude VAULT_WITHDRAWAL rows.
      // For legacy: show all non-provision expense entries.
      const allExpenseData = report.expenseData || [];
      const vaultWithdrawalEntries = allExpenseData.filter((e: any) => e.category === 'VAULT_WITHDRAWAL');
      const vaultWithdrawalMap: Record<string, number> = {};
      vaultWithdrawalEntries.forEach((e: any) => {
        const expName = (e.name || '').replace(/^VAULT:\s*/i, '').trim().toUpperCase();
        vaultWithdrawalMap[expName] = (vaultWithdrawalMap[expName] ?? 0) + Number(e.amount || 0);
      });

      const operationalOnlyEntries = allExpenseData.filter((e: any) => e.category === 'OPERATIONAL');
      const expenseBody = operationalOnlyEntries.map((e: any) => {
        const name = (e.name || '').toUpperCase();
        const amt = Number(e.amount || 0);
        const vaultCovered = vaultWithdrawalMap[name] ?? 0;
        const cashOut = amt - vaultCovered;
        const note = vaultCovered > 0 ? ` (PHP ${vaultCovered.toLocaleString()} from vault)` : '';
        return [name + note, `-PHP ${cashOut.toLocaleString()}`];
      });

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Expense Item', 'Cash Out']],
        body: expenseBody.length > 0 ? expenseBody : [['No expenses recorded', '—']],
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        rowPageBreak: 'avoid'
      });

      currentY = ((doc as any).lastAutoTable?.finalY ?? 0) + 10;

      // 6b. Vault Withdrawals (non-legacy only — vault-covered expense portions)
      if (!isLegacy && vaultWithdrawalEntries.length > 0) {
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text('VAULT-COVERED EXPENSES', 14, currentY);
        const withdrawalBody = vaultWithdrawalEntries.map((e: any) => [
          (e.name || '').replace(/^VAULT:\s*/i, '').toUpperCase(),
          `PHP ${Number(e.amount || 0).toLocaleString()}`
        ]);
        autoTable(doc, {
          startY: currentY + 3,
          head: [['Expense Item', 'Vault Used']],
          body: withdrawalBody,
          theme: 'grid',
          headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255] },
          styles: { fontSize: 8 },
          columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          rowPageBreak: 'avoid'
        });
        currentY = ((doc as any).lastAutoTable?.finalY ?? 0) + 10;
      }

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // 7. Provision: Rent & Bills (legacy) / Vault Deposits (non-legacy)
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      if (isLegacy) {
        doc.text('PROVISION — RENT & BILLS', 14, currentY);
        const rentBody = rentAndBillsEntries.map((e: any) => [
          (e.name || '').toUpperCase(),
          `-PHP ${Number(e.amount || 0).toLocaleString()}`
        ]);
        autoTable(doc, {
          startY: currentY + 3,
          head: [['Item', 'Amount']],
          body: rentBody.length > 0 ? rentBody : [['No rent & bills recorded', '—']],
          theme: 'grid',
          headStyles: { fillColor: [67, 56, 202], textColor: [255, 255, 255] },
          styles: { fontSize: 8 },
          columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          rowPageBreak: 'avoid'
        });
      } else {
        doc.text('PROVISION — VAULT DEPOSITS', 14, currentY);
        // vault_data is always [] for vault branches — use vaultDepositTxs (from vault_transactions) instead
        const depositSource = vaultDepositTxs.length > 0 ? vaultDepositTxs : vaultDepositEntries;
        const vaultBody = depositSource.map((e: any) => {
          const ts = e.timestamp
            ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(e.timestamp))
            : '—';
          return [ts, `PHP ${Number(e.amount || 0).toLocaleString()}`];
        });
        autoTable(doc, {
          startY: currentY + 3,
          head: [['Time', 'Amount Deposited']],
          body: vaultBody.length > 0 ? vaultBody : [['No vault deposits recorded', '—']],
          theme: 'grid',
          headStyles: { fillColor: [67, 56, 202], textColor: [255, 255, 255] },
          styles: { fontSize: 8 },
          columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          rowPageBreak: 'avoid'
        });
      }

      doc.save(`REPORT_${branchName.replace(/\s+/g, '_')}_${report.reportDate.replace(/\s+/g, '_')}.pdf`);
      playSound('success');
    } catch (error) {
      console.error('PDF Export failed:', error);
      alert('Failed to generate PDF. Please try using the Print button.');
    } finally {
      setIsExporting(false);
    }
  };

  if (isEditing && branch) {
    return (
        <ReportEditorModal
            report={report}
            branch={branch}
            employees={employees}
            onClose={() => setIsEditing(false)}
            onSave={() => {
              setIsEditing(false);
              onClose(); // Close the dashboard modal to force a refresh of the parent
            }}
        />
    );
  }

  if (drilldownReport) {
    return <ReportDashboardModal
        report={drilldownReport}
        constituents={drilldownConstituents}
        branchName={branchName}
        employees={employees}
        onClose={() => {
          setDrilldownReport(null);
          setDrilldownConstituents([]);
        }}
        canEdit={canEdit}
        branch={branch}
        branches={branches}
        branchVaults={branchVaults}
        vaultStartDate={vaultStartDate}
    />;
  }

  if (!mounted) return null;

  return createPortal(
      <div className="fixed inset-0 z-[5000] backdrop-blur-sm flex items-end md:items-center justify-center px-3 pb-3 pt-0 md:p-4 animate-in fade-in duration-300 print:static print:bg-white print:p-0">
        <div className={`bg-slate-50 dark:bg-slate-900 w-full max-w-7xl h-[95vh] md:max-h-[92vh] ${UI_THEME.radius.modal} border border-slate-200 dark:border-slate-700 shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 md:zoom-in duration-300 print:h-auto print:max-h-none print:max-w-none print:shadow-none print:border-none print:bg-white print:overflow-visible print:block`}>

          {viewingExpense && (
              <ExpenseDetailModal expense={viewingExpense} onClose={() => setViewingExpense(null)} />
          )}

          {showPDFConfirm && (
            <div className={UI_THEME.layout.modalWrapper}>
              <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2-0 01-2-2V5a2 2-0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2-0 01-2 2z" /></svg>
                </div>
                <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Export PDF?</h4>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
                  Generate and download the report for {branchName}?
                </p>
                <div className="flex flex-col gap-4 mt-10">
                  <button
                    onClick={() => handleExportPDF(true)}
                    className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    Confirm Export
                  </button>
                  <button
                    onClick={() => setShowPDFConfirm(false)}
                    className="w-full text-slate-400 font-black py-4 rounded-xl text-xs uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Print Only Header */}
          <div className="hidden print:block p-8 border-b-2 border-slate-900 mb-8">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{branchName}</h1>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {isAggregate ? 'Consolidated Period Report' : 'Daily Operational Ledger'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold uppercase tracking-tight text-slate-900">{displayDate}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Report ID: {report.id.toUpperCase()}</p>
              </div>
            </div>
          </div>

          {/* HEADER BAR */}
          <div className="p-4 md:p-8 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 gap-3 no-print">
            <div className="flex items-center gap-3 md:gap-5 min-w-0">
              <div className={`w-10 h-10 md:w-12 md:h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg shrink-0`}>
                {isAggregate ? '📊' : '📂'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm sm:text-lg md:text-xl font-bold uppercase tracking-tighter text-slate-900 leading-tight truncate">{displayDate}</h3>
                  {isBackfill && (
                    <span className="shrink-0 px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold uppercase tracking-wide">Backfilled</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs sm:text-xs font-medium uppercase tracking-wide text-emerald-600 whitespace-nowrap">{branchName} Node</span>
                  <span className="text-slate-200 hidden sm:inline">/</span>
                  <span className="text-xs sm:text-xs font-medium uppercase tracking-wide text-slate-400 opacity-40 whitespace-nowrap">
                    {isAggregate ? `${constituents.length} PERIOD UNITS` : `ID: ${report.id}`}
                 </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 no-print">
              <button
                onClick={() => handleExportPDF()}
                disabled={isExporting}
                className="flex items-center gap-2 px-3 md:px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold uppercase tracking-wide rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                {isExporting ? (
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                )}
                <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export PDF'}</span>
              </button>


              <button onClick={onClose} className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 active:scale-90 transition-all border border-slate-100 dark:border-slate-700 shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* DASHBOARD CONTENT */}
          <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-12 no-scrollbar pb-32 print:hidden">

            {isFetchingLatest && (
              <div className="flex items-center gap-1.5 px-1 -mb-8">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:300ms]" />
              </div>
            )}

            {(() => {
              const rentAndBillsTotal = rentAndBillsEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
              // For aggregate reports, show Rent & Bills tile if any constituent day has provision entries
              const kpiIsLegacy = isLegacy || (isAggregate && rentAndBillsTotal > 0);
              // For aggregate reports, sum vault deposits from non-legacy constituents separately
              const aggregateVaultDeposit = isAggregate
                ? constituents.reduce((s, c) => s + getConstituentVaultDeposit(c), 0)
                : (kpiIsLegacy ? 0 : Number(report.totalVaultProvision || 0));
              return (
                <SalesKPIStrip
                    gross={Number(report.grossSales || 0)}
                    cashTotal={financialBreakdown.cashTotal}
                    gcashTotal={financialBreakdown.gcashTotal}
                    operationalExp={displayOperationalExp}
                    rentAndBillsTotal={rentAndBillsTotal}
                    vaultDeposit={aggregateVaultDeposit}
                    vaultWithdrawal={vaultWithdrawalTotal}
                    vaultCoveredExp={vaultCoveredExpTotal}
                    finalStaffPayTotal={displayStaffPay}
                    net={isAggregate
                      ? constituents.reduce((sum, c) => sum + c.netRoi, 0)
                      : Number(report.netRoi || 0)}
                    totalAllowances={financialBreakdown.allowances}
                    otAdditions={financialBreakdown.ot}
                    lateDeductions={financialBreakdown.late}
                    totalCashAdvances={financialBreakdown.advances}
                    isLegacy={kpiIsLegacy}
                />
              );
            })()}

            {(isAggregate ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-4">
                    <h4 className={`${UI_THEME.text.label}`}>Constituent Unit Breakdown</h4>
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Tabular Ledger View</span>
                  </div>

                  <div className="overflow-hidden bg-white md:rounded-2xl md:border border-slate-100 shadow-sm p-4 md:p-0">
                    <div className="hidden md:block overflow-x-auto no-scrollbar">
                      <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-6 py-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Period / Unit</th>
                          <th className="px-6 py-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Branch Node</th>
                          <th className="px-6 py-5 text-xs font-semibold uppercase tracking-wide text-slate-400 text-right">Gross Yield</th>
                          <th className="px-6 py-5 text-xs font-semibold uppercase tracking-wide text-slate-400 text-right">Staff Payroll</th>
                          <th className="px-6 py-5 text-xs font-semibold uppercase tracking-wide text-slate-400 text-right">Operational Exp</th>
                          <th className="px-6 py-5 text-xs font-semibold uppercase tracking-wide text-slate-400 text-right">Vault Deposit</th>
                          <th className="px-6 py-5 text-xs font-semibold uppercase tracking-wide text-slate-400 text-right">Net ROI</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                        {/* We will render the same rows but as table rows here */}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col">
                      {(() => {
                        if (report.reportType === 'monthly') {
                          const weeklyGroups: Record<string, {
                            label: string;
                            weekStart: Date;
                            weekEnd: Date;
                            constituents: SalesReport[];
                          }> = {};

                          constituents.forEach(c => {
                            const d = parseDate(c.reportDate);
                            const { weekIndex, weekStart, weekEnd } = getWeekRange(d, branch!);
                            const key = `W${weekIndex}-${weekStart.getMonth() + 1}-${weekStart.getFullYear()}`;

                            if (!weeklyGroups[key]) {
                              weeklyGroups[key] = {
                                label: `WEEK ${weekIndex}`,
                                weekStart,
                                weekEnd,
                                constituents: []
                              };
                            }
                            weeklyGroups[key].constituents.push(c);
                          });

                          const sortedWeekKeys = Object.keys(weeklyGroups).sort((a, b) => {
                            return weeklyGroups[a].weekStart.getTime() - weeklyGroups[b].weekStart.getTime();
                          });

                          return sortedWeekKeys.map((key) => {
                            const group = weeklyGroups[key];
                            const weekGross = group.constituents.reduce((sum, r) => sum + r.grossSales, 0);
                            const weekPayroll = group.constituents.reduce((sum, r) => sum + r.totalStaffPay, 0);
                            const weekExp = group.constituents.reduce((sum, r) => sum + r.totalExpenses, 0);
                            const weekCashOut = group.constituents.reduce((sum, r) => sum + getConstituentROIExp(r), 0);
                            const weekVault = group.constituents.reduce((sum, r) => sum + getConstituentProvision(r), 0);
                            const weekVaultDeposit = group.constituents.reduce((sum, r) => sum + getConstituentVaultDeposit(r), 0);
                            const weekVaultCovered = group.constituents.reduce((sum, r) => sum + getConstituentVaultCoveredExp(r), 0);
                            const weekRoi = group.constituents.reduce((sum, r) => sum + r.netRoi, 0);
                            const clippedStart = new Date(Math.max(group.weekStart.getTime(), parseDate(report.sortDate!).getTime()));
                            const clippedEnd = new Date(Math.min(group.weekEnd.getTime(), parseDate(report.periodEnd!).getTime()));
                            const dateRangeLabel = `${clippedStart.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} — ${clippedEnd.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}`;

                            const weekIsLegacy = group.constituents.some(c => getConstituentIsLegacy(c));
                            return (
                                <PerformanceRow
                                    key={key}
                                    label={group.label}
                                    sublabel={dateRangeLabel}
                                    branchName={branchName}
                                    gross={weekGross}
                                    pay={weekPayroll}
                                    exp={weekCashOut}
                                    vault={weekVault}
                                    vaultDeposit={weekVaultDeposit}
                                    vaultCoveredExp={weekVaultCovered}
                                    isLegacy={weekIsLegacy}
                                    net={weekRoi}
                                    onClick={() => {
                                      playSound('click');
                                      setDrilldownReport({
                                        ...report,
                                        id: `${report.id}-${key}`,
                                        reportDate: `${group.label}: ${dateRangeLabel}`,
                                        reportType: 'weekly',
                                        sortDate: toDateStr(clippedStart),
                                        periodEnd: toDateStr(clippedEnd),
                                        grossSales: weekGross,
                                        totalStaffPay: weekPayroll,
                                        totalExpenses: weekExp,
                                        totalVaultProvision: weekVault,
                                        netRoi: weekRoi
                                      });
                                      setDrilldownConstituents(group.constituents);
                                    }}
                                />
                            );
                          });
                        }

                        // Default logic for Weekly or other aggregate reports
                        const dailyGroups: Record<string, { report: SalesReport; constituents: SalesReport[] }> = {};
                        constituents.forEach(c => {
                          if (!dailyGroups[c.reportDate]) {
                            dailyGroups[c.reportDate] = {
                              report: { ...c },
                              constituents: [c]
                            };
                          } else {
                            const target = dailyGroups[c.reportDate].report;
                            target.grossSales += c.grossSales;
                            target.totalStaffPay += c.totalStaffPay;
                            target.totalExpenses += c.totalExpenses;
                            target.totalVaultProvision += c.totalVaultProvision;
                            target.netRoi += c.netRoi;
                            dailyGroups[c.reportDate].constituents.push(c);
                          }
                        });

                        let allDates: { date: string; group?: { report: SalesReport; constituents: SalesReport[] } }[] = [];
                        if (report.sortDate && report.periodEnd) {
                          const start = parseDate(report.sortDate);
                          const end = parseDate(report.periodEnd);
                          const current = new Date(start);
                          while (current <= end) {
                            const dateStr = toDateStr(current);
                            const existing = dailyGroups[dateStr];
                            allDates.push({ date: dateStr, group: existing });
                            current.setDate(current.getDate() + 1);
                          }
                        } else {
                          allDates = Object.keys(dailyGroups)
                              .sort((a, b) => (a || '').localeCompare(b || ''))
                              .map(date => ({ date, group: dailyGroups[date] }));
                        }

                        return allDates.map(({ date, group }) => {
                          const d = parseDate(date);
                          const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

                          if (!group) {
                            return (
                                <PerformanceRow
                                    key={date}
                                    label={label}
                                    sublabel="MISSING REPORT"
                                    branchName={branchName}
                                    gross={0}
                                    pay={0}
                                    exp={0}
                                    vault={0}
                                    net={0}
                                    isMissing={true}
                                    onClick={() => {}}
                                />
                            );
                          }

                          const sub = group.report;
                          const isConsolidatedDay = group.constituents.length > 1;
                          const subBranch = branches.find(b => b.id === sub.branchId);
                          const subIsLegacy = isConsolidatedDay
                            ? group.constituents.some(c => getConstituentIsLegacy(c))
                            : getConstituentIsLegacy(sub);
                          return (
                              <PerformanceRow
                                  key={sub.id}
                                  label={label}
                                  sublabel={isConsolidatedDay ? `${group.constituents.length} TERMINALS CONSOLIDATED` : `ID: ${sub.id}`}
                                  branchName={isConsolidatedDay ? "NETWORK CONSOLIDATED" : (subBranch?.name || branchName)}
                                  gross={sub.grossSales}
                                  pay={sub.totalStaffPay}
                                  exp={isConsolidatedDay
                                    ? group.constituents.reduce((s, c) => s + getConstituentROIExp(c) + getConstituentVaultCoveredExp(c), 0)
                                    : getConstituentROIExp(sub) + getConstituentVaultCoveredExp(sub)}
                                  vault={isConsolidatedDay
                                    ? group.constituents.reduce((s, c) => s + getConstituentProvision(c), 0)
                                    : getConstituentProvision(sub)}
                                  vaultDeposit={isConsolidatedDay
                                    ? group.constituents.reduce((s, c) => s + getConstituentVaultDeposit(c), 0)
                                    : getConstituentVaultDeposit(sub)}
                                  vaultCoveredExp={isConsolidatedDay
                                    ? group.constituents.reduce((s, c) => s + getConstituentVaultCoveredExp(c), 0)
                                    : getConstituentVaultCoveredExp(sub)}
                                  isLegacy={subIsLegacy}
                                  net={isConsolidatedDay
                                    ? group.constituents.reduce((s, c) => s + c.netRoi, 0)
                                    : sub.netRoi}
                                  onClick={() => {
                                    playSound('click');
                                    setDrilldownReport(sub);
                                    setDrilldownConstituents(isConsolidatedDay ? group.constituents : []);
                                  }}
                              />
                          );
                        });
                      })()}

                      {/* Totals footer row */}
                      {(() => {
                        const totalGross = constituents.reduce((s, c) => s + c.grossSales, 0);
                        const totalStaff = constituents.reduce((s, c) => s + c.totalStaffPay, 0);
                        const totalRoiExp = constituents.reduce((s, c) => s + getConstituentROIExp(c), 0);
                        const totalVaultExp = constituents.reduce((s, c) => s + getConstituentVaultCoveredExp(c), 0);
                        const totalVaultDeposit = constituents.reduce((s, c) => s + getConstituentVaultDeposit(c), 0);
                        const totalNet = constituents.reduce((s, c) => s + c.netRoi, 0);
                        return (
                          <div className="hidden md:flex border-t-2 border-slate-700 bg-slate-900/80 items-center sticky bottom-0">
                            <div className="px-8 py-4 w-[15%]">
                              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">TOTALS</span>
                            </div>
                            <div className="px-6 py-4 w-[17%]" />
                            <div className="px-6 py-4 w-[13%] text-right font-black text-slate-100 tabular-nums">₱{totalGross.toLocaleString()}</div>
                            <div className="px-6 py-4 w-[13%] text-right font-black text-amber-400 tabular-nums">₱{totalStaff.toLocaleString()}</div>
                            <div className="px-6 py-4 w-[13%] text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-black text-rose-400 tabular-nums">₱{totalRoiExp.toLocaleString()}</span>
                                {totalVaultExp > 0 && <span className="text-[10px] font-black text-indigo-400 tabular-nums">+₱{totalVaultExp.toLocaleString()} vault</span>}
                              </div>
                            </div>
                            <div className="px-6 py-4 w-[13%] text-right font-black text-indigo-400 tabular-nums">₱{totalVaultDeposit.toLocaleString()}</div>
                            <div className="px-8 py-4 w-[16%] text-right">
                              <span className={`font-black tabular-nums text-lg ${totalNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {totalNet < 0 ? '−' : ''}₱{Math.abs(totalNet).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
            ) : (
                <>
                  <SessionLogs transactions={report.sessionData || []} totalCount={(report.sessionData || []).length} />

                  <div className="space-y-4">
                    <h4 className={`${UI_THEME.text.label} ml-4`}>Staff Performance Matrix</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {(report.staffBreakdown || []).map((s: any) => {
                        const late = Number(s.attendance?.lateDeduction || s.attendance?.late_deduction || 0);
                        const ot = Number(s.attendance?.otPay || s.attendance?.ot_pay || 0);
                        const adv = Number(s.attendance?.cashAdvance || s.attendance?.cash_advance || 0);
                        const baseComm = Number(s.commission || 0);
                        const baseAllw = Number(s.allowance || 0);
                        const finalPay = baseComm + baseAllw + ot - late;

                        // Resolve name and profile from employeeId if possible
                        const resolvedEmployee = employees.find(e => e.id === s.employeeId);
                        const resolvedName = resolvedEmployee?.name || s.name || 'Unknown Staff';
                        const resolvedProfile = s.profile || resolvedEmployee?.profile || null;

                        const isHalfDay = s.attendance?.isHalfDay || s.attendance?.is_half_day || false;

                        const isReliever = typeof s.isReliever === 'boolean' ? s.isReliever : (s.employeeId && report.branchId !== 'all' && resolvedEmployee?.branchId !== report.branchId);

                        return (
                          <div
                            key={s.employeeId || s.name}
                            className={`${isReliever ? 'bg-purple-50/50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-700/40 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'} p-3 sm:p-5 ${UI_THEME.radius.card} border flex flex-col transition-all duration-300 group relative overflow-hidden cursor-default`}
                          >

                            <div className="flex flex-col gap-3 sm:gap-6">
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-2xl flex items-center justify-center text-sm sm:text-lg shadow-inner shrink-0 transition-all duration-500 overflow-hidden ${isReliever ? 'bg-purple-50 dark:bg-purple-800/40 text-purple-600 dark:text-purple-300' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                                    {resolvedProfile ? (
                                      <img
                                        src={resolvedProfile}
                                        alt={resolvedName}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                        onError={e => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="font-bold text-slate-900 uppercase text-xs sm:text-sm tracking-tight truncate leading-none mb-1 group-hover:text-emerald-700 transition-colors">{resolvedName}</h3>
                                    <div className="flex flex-wrap gap-1">
                                      {isReliever && (
                                        <span className="inline-block bg-purple-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded border border-purple-400 leading-none">RELIEVER</span>
                                      )}
                                      {isLateClockIn(s.attendance?.clockIn || s.attendance?.clock_in, branch?.openingTime) && (
                                        <span className="inline-block bg-amber-500 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded border border-amber-400 leading-none">LATE</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right shrink-0 pl-2 flex flex-col items-end">
                                  <p className="font-bold text-slate-900 tracking-tighter leading-none tabular-nums text-[18px] sm:text-[22px] whitespace-nowrap">₱{finalPay.toLocaleString()}</p>
                                  <p className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 whitespace-nowrap ${isReliever ? 'text-purple-600' : 'text-emerald-600'}`}>Take Home</p>
                                </div>
                              </div>

                              <div className="space-y-1 sm:space-y-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs sm:text-xs font-medium text-slate-400 uppercase tracking-wider">Service Track</span>
                                  <span className="text-xs sm:text-xs font-bold text-slate-900">{s.count} units</span>
                                </div>
                                <div className="flex gap-0.5 sm:gap-1 h-1 sm:h-1.5 px-0.5">
                                  {Array.from({ length: 10 }).map((_, i) => (
                                    <div
                                      key={i}
                                      className={`flex-1 rounded-full transition-all duration-700 ${i < s.count ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-slate-100'}`}
                                    ></div>
                                  ))}
                                </div>
                              </div>

                              <div className={`grid gap-1 sm:gap-2 ${adv > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                <div className="bg-slate-50/80 dark:bg-slate-700/50 p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border border-slate-100/50 dark:border-slate-700">
                                  <p className="text-xs sm:text-xs font-medium text-slate-500 dark:text-slate-200 uppercase tracking-wide mb-0.5">Allowance</p>
                                  <p className="text-xs sm:text-xs font-bold text-slate-700 dark:text-white tabular-nums">₱{baseAllw.toLocaleString()}</p>
                                </div>
                                {adv > 0 && (
                                  <div className="bg-indigo-50 p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border border-indigo-100">
                                    <p className="text-xs sm:text-xs font-medium text-indigo-600 uppercase tracking-wide mb-0.5">Advances</p>
                                    <p className="text-xs sm:text-xs font-bold text-indigo-700 tabular-nums">−₱{adv.toLocaleString()}</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-0.5">
                                <div className="flex gap-1 sm:gap-1.5 flex-wrap">
                                  {late > 0 && <span className="text-xs sm:text-xs font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border bg-rose-50 text-rose-700 border-rose-100">−₱{late}</span>}
                                  {ot > 0 && <span className="text-xs sm:text-xs font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-100">+₱{ot}</span>}
                                  {isHalfDay && <span className="text-xs sm:text-xs font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border bg-amber-50 text-amber-700 border-amber-100">Half</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {isLegacy ? (
                    /* Legacy: two-column layout — Vault Archive (left) + Operational Outflows (right) */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                      <div className="lg:col-span-4 space-y-4">
                        <h4 className={`${UI_THEME.text.label} ml-4`}>Vault Archive</h4>
                        <div className="space-y-3">
                          {rentAndBillsEntries.map((e: any) => (
                            <div
                              key={e.id}
                              onClick={() => { playSound('click'); setViewingExpense(e); }}
                              className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-500 transition-all cursor-pointer group flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" /></svg>
                                </div>
                                <div className="overflow-hidden">
                                  <p className="text-xs font-bold text-slate-900 uppercase truncate leading-none mb-1.5">{e.name}</p>
                                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest tabular-nums">
                                    {new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(e.timestamp))}
                                  </p>
                                </div>
                              </div>
                              <p className="text-sm font-bold tabular-nums text-emerald-700">+₱{Number(e.amount || 0).toLocaleString()}</p>
                            </div>
                          ))}
                          {rentAndBillsEntries.length === 0 && (
                            <div className="py-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-3xl opacity-20"><p className={UI_THEME.text.metadata}>Empty Archive</p></div>
                          )}
                        </div>
                      </div>
                      <div className="lg:col-span-8 space-y-4">
                        <h4 className={`${UI_THEME.text.label} ml-4`}>Operational Outflows</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {operationalExpenses.map((e: any) => (
                            <div
                              key={e.id}
                              onClick={() => { playSound('click'); setViewingExpense(e); }}
                              className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group flex items-center justify-between hover:border-rose-200"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-9 h-9 bg-rose-50 border border-rose-100 text-rose-400 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                              </div>
                                <div className="overflow-hidden">
                                  <p className="text-xs font-bold text-slate-900 uppercase truncate leading-none mb-1">{e.name}</p>
                                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest tabular-nums">
                                    {new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(e.timestamp))}
                                  </p>
                                </div>
                              </div>
                              <p className="text-sm font-bold text-rose-600 tabular-nums">₱{Number(e.amount || 0).toLocaleString()}</p>
                            </div>
                          ))}
                          {operationalExpenses.length === 0 && (
                            <div className="col-span-full py-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-3xl opacity-20"><p className={UI_THEME.text.metadata}>No Outflows Logged</p></div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Non-legacy: two-column layout — Vault Fund (left) + Expenses (right) */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                      {/* LEFT — Vault Fund / Deposits */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400"></div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vault Fund</p>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Deposits Today</p>
                            </div>
                          </div>
                          <p className="text-xs font-black text-violet-500 tabular-nums">
                            +₱{Number(report.totalVaultProvision || 0).toLocaleString()}
                          </p>
                        </div>
                        {vaultDepositTxs.length > 0 ? vaultDepositTxs.map((tx: any) => {
                          const timeLabel = tx.timestamp
                            ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(tx.timestamp))
                            : '—';
                          return (
                            <div key={tx.id} className="p-4 bg-white rounded-2xl border border-violet-100 shadow-sm flex items-center justify-between">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 text-violet-500 flex items-center justify-center shrink-0">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                </div>
                                <div className="overflow-hidden">
                                  <p className="text-xs font-bold text-slate-900 uppercase truncate leading-none mb-1">{tx.name || 'VAULT DEPOSIT'}</p>
                                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest tabular-nums">{timeLabel}</p>
                                </div>
                              </div>
                              <p className="text-sm font-bold tabular-nums text-violet-600">+₱{Number(tx.amount || 0).toLocaleString()}</p>
                            </div>
                          );
                        }) : (
                          <div className="py-10 text-center bg-white border-2 border-dashed border-slate-100 rounded-3xl opacity-20">
                            <p className={UI_THEME.text.metadata}>No Deposits</p>
                          </div>
                        )}
                      </div>

                      {/* RIGHT — Expenses */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expenses</p>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-300">
                                Leaves ₱{Number(report.totalExpenses || 0).toLocaleString()} Today
                              </p>
                            </div>
                          </div>
                          <p className="text-xs font-black text-rose-500 tabular-nums">
                            −₱{displayOperationalExp.toLocaleString()}
                          </p>
                        </div>
                        {operationalExpenses.length > 0 ? operationalExpenses
                          .sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''))
                          .map((e: any) => {
                          const vaultCovered = e.from_vault ?? vaultCoverageMap[(e.name || '').trim().toUpperCase()] ?? 0;
                          const roiAmount = Math.max(0, Number(e.amount || 0) - vaultCovered);
                          const timeLabel = e.timestamp
                            ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(e.timestamp))
                            : '—';
                          return (
                            <div
                              key={e.id}
                              onClick={() => { playSound('click'); setViewingExpense(e); }}
                              className={`p-4 bg-white rounded-2xl border shadow-sm hover:shadow-xl transition-all cursor-pointer group flex items-center justify-between ${vaultCovered > 0 ? 'border-amber-100 hover:border-amber-300' : 'border-slate-100 hover:border-rose-200'}`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${vaultCovered > 0 ? 'bg-amber-50 border border-amber-100 text-amber-500 group-hover:bg-amber-500 group-hover:text-white' : 'bg-rose-50 border border-rose-100 text-rose-400 group-hover:bg-rose-600 group-hover:text-white'}`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                                </div>
                                <div className="overflow-hidden">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <p className="text-xs font-bold text-slate-900 uppercase truncate leading-none">{e.name}</p>
                                    {vaultCovered > 0 && vaultCovered <= Number(e.amount || 0) && <span className="text-xs font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">₱{vaultCovered.toLocaleString()} Vault</span>}
                                    {vaultCovered > Number(e.amount || 0) && <span className="text-xs font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap tabular-nums">₱{Number(e.amount || 0).toLocaleString()}</span>}
                                    {vaultCovered > Number(e.amount || 0) && <span className="text-xs font-black text-slate-400 tabular-nums shrink-0">+₱{(vaultCovered - Number(e.amount || 0)).toLocaleString()} prior deficit</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest tabular-nums">{timeLabel}</p>
                                    {!e.receiptImage && <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">· No Receipt</span>}
                                  </div>
                                </div>
                              </div>
                              <p className={`text-sm font-bold tabular-nums ${vaultCovered > 0 ? 'text-amber-600' : 'text-rose-600'}`}>−₱{(vaultCovered > Number(e.amount || 0) ? vaultCovered : Number(e.amount || 0)).toLocaleString()}</p>
                            </div>
                          );
                        }) : (
                          <div className="py-10 text-center bg-white border-2 border-dashed border-slate-100 rounded-3xl opacity-20">
                            <p className={UI_THEME.text.metadata}>No Outflows Logged</p>
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </>
            ))}

          </div>

          {/* PRINT ONLY TABLE VIEW */}
          <div ref={printRef} className="hidden print:block p-8 space-y-8 print-container overflow-visible h-auto">
            {/* KPI SUMMARY TABLE */}
            <div className="space-y-2 break-inside-avoid">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Financial Summary</h4>
              <table className="w-full border-collapse border border-slate-200 text-xs">
                <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-4 py-2 text-left uppercase tracking-widest">Metric</th>
                  <th className="border border-slate-200 px-4 py-2 text-right uppercase tracking-widest">Amount</th>
                </tr>
                </thead>
                <tbody>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 font-bold uppercase">Gross Sales</td>
                  <td className="border border-slate-200 px-4 py-2 text-right font-bold tabular-nums">₱{Number(report.grossSales || 0).toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 text-xs uppercase text-slate-500 pl-8 italic">  - Cash Payments</td>
                  <td className="border border-slate-200 px-4 py-2 text-right text-xs tabular-nums text-slate-500 italic">₱{financialBreakdown.cashTotal.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 text-xs uppercase text-slate-500 pl-8 italic">  - GCash Payments</td>
                  <td className="border border-slate-200 px-4 py-2 text-right text-xs tabular-nums text-slate-500 italic">₱{financialBreakdown.gcashTotal.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 font-bold uppercase text-rose-600">Operational Expenses</td>
                  <td className="border border-slate-200 px-4 py-2 text-right font-bold tabular-nums text-rose-600">₱{Number(report.totalExpenses || 0).toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 font-bold uppercase text-amber-600">Staff Payroll</td>
                  <td className="border border-slate-200 px-4 py-2 text-right font-bold tabular-nums text-amber-600">₱{displayStaffPay.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 font-bold uppercase text-indigo-600">R&B Reserve</td>
                  <td className="border border-slate-200 px-4 py-2 text-right font-bold tabular-nums text-indigo-600">₱{Number(report.totalVaultProvision || 0).toLocaleString()}</td>
                </tr>
                <tr className="bg-slate-900 text-white">
                  <td className="border border-slate-900 px-4 py-2 font-semibold uppercase tracking-wide">Net ROI</td>
                  <td className="border border-slate-900 px-4 py-2 text-right font-black tabular-nums">₱{Number(report.netRoi || 0).toLocaleString()}</td>
                </tr>
                </tbody>
              </table>
            </div>

            {isAggregate && (
                <div className="space-y-2 break-inside-avoid">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Constituent Unit Breakdown</h4>
                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead>
                    <tr className="bg-slate-50 font-medium uppercase tracking-wide">
                      <th className="border border-slate-200 px-3 py-2 text-left">Date</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Gross</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Payroll</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Expenses</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Vault</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Net ROI</th>
                    </tr>
                    </thead>
                    <tbody>
                    {constituents.sort((a,b) => (a.reportDate || '').localeCompare(b.reportDate || '')).map((sub) => (
                        <tr key={sub.id} className="break-inside-avoid">
                          <td className="border border-slate-200 px-3 py-2 font-bold uppercase">
                            {new Date(sub.reportDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">₱{sub.grossSales.toLocaleString()}</td>
                          <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">₱{sub.totalStaffPay.toLocaleString()}</td>
                          <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">₱{sub.totalExpenses.toLocaleString()}</td>
                          <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">₱{sub.totalVaultProvision.toLocaleString()}</td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-bold tabular-nums">₱{sub.netRoi.toLocaleString()}</td>
                        </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
            )}

            <div className="space-y-2 break-inside-avoid">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Session Logs</h4>
              <table className="w-full border-collapse border border-slate-200 text-xs">
                <thead>
                <tr className="bg-slate-50 font-medium uppercase tracking-wide">
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Time</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Client</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Service</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-right">Total</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-center">Settlement</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Providers</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-right">ROI</th>
                </tr>
                </thead>
                <tbody>
                {(report.sessionData || []).map((t: any) => {
                  const therapistComm = Number(t.primaryCommission) || 0;
                  const bonesetterComm = Number(t.secondaryCommission) || 0;
                  const sessionDeduction = Number(t.deduction) || 0;
                  const netTotal = (Number(t.basePrice) - (Number(t.discount) || 0));
                  const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);
                  return (
                      <tr key={t.id} className="break-inside-avoid">
                        <td className="border border-slate-200 px-2 py-1.5 tabular-nums">
                          {new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(t.timestamp))}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 font-bold uppercase">{t.clientName}</td>
                        <td className="border border-slate-200 px-2 py-1.5 uppercase leading-tight">{t.serviceName}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">₱{netTotal.toLocaleString()}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">
                          <div className="font-bold uppercase">{t.settlement || t.paymentMethod || 'CASH'}</div>
                          {!t.settlement && <div className="text-xs text-slate-400">{t.paymentStatus || 'PAID'}</div>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 uppercase text-xs">
                          {t.therapistName && <div>T: {t.therapistName} (₱{therapistComm})</div>}
                          {t.bonesetterName && <div>B: {t.bonesetterName} (₱{bonesetterComm})</div>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-bold tabular-nums">₱{netRoi.toLocaleString()}</td>
                      </tr>
                  );
                })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 break-inside-avoid">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Staff Performance Matrix</h4>
              <table className="w-full border-collapse border border-slate-200 text-xs">
                <thead>
                <tr className="bg-slate-50 font-medium uppercase tracking-wide">
                  <th className="border border-slate-200 px-3 py-2 text-left">Employee</th>
                  <th className="border border-slate-200 px-3 py-2 text-center">Sessions</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">Base Pay</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">Late</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">OT</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">Advance</th>
                  <th className="border border-slate-200 px-3 py-2 text-right font-black">Final Pay</th>
                </tr>
                </thead>
                <tbody>
                {(report.staffBreakdown || []).map((s: any) => {
                  const late = Number(s.attendance?.lateDeduction || s.attendance?.late_deduction || 0);
                  const ot = Number(s.attendance?.otPay || s.attendance?.ot_pay || 0);
                  const adv = Number(s.attendance?.cashAdvance || s.attendance?.cash_advance || 0);
                  const baseComm = Number(s.commission || 0);
                  const baseAllw = Number(s.allowance || 0);
                  const finalPay = baseComm + baseAllw + ot - late;
                  const resolvedName = employees.find(e => e.id === s.employeeId)?.name || s.name || 'Unknown Staff';
                  const isReliever = typeof s.isReliever === 'boolean' ? s.isReliever : (s.employeeId && report.branchId !== 'all' && employees.find(e => e.id === s.employeeId)?.branchId !== report.branchId);
                  const isHalfDay = s.attendance?.isHalfDay || s.attendance?.is_half_day || false;
                  return (
                      <tr key={s.employeeId || s.name} className="break-inside-avoid">
                        <td className="border border-slate-200 px-3 py-2 font-bold uppercase">
                          {resolvedName}
                          {isReliever && <span className="ml-1 text-xs text-purple-600 font-black">(RELIEVER)</span>}
                          {isHalfDay && <span className="ml-1 text-xs text-amber-600 font-black">(HALF DAY)</span>}
                          {isLateClockIn(s.attendance?.clockIn || s.attendance?.clock_in, branch?.openingTime) && <span className="ml-1 text-xs text-amber-600 font-black">(LATE)</span>}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center tabular-nums">{Number(s.count || 0)}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">₱{(baseComm + baseAllw).toLocaleString()}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-rose-600">-₱{late.toLocaleString()}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-emerald-600">+₱{ot.toLocaleString()}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-indigo-600">₱{adv.toLocaleString()}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-black tabular-nums">₱{finalPay.toLocaleString()}</td>
                      </tr>
                  );
                })}
                </tbody>
              </table>
            </div>

            <div className="break-inside-avoid">
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Operational Outflows</h4>
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead>
                  <tr className="bg-slate-50 font-medium uppercase tracking-wide">
                    <th className="border border-slate-200 px-2 py-1.5 text-left">Expense</th>
                    {!isLegacy && <th className="border border-slate-200 px-2 py-1.5 text-center">Type</th>}
                    <th className="border border-slate-200 px-2 py-1.5 text-right">Amount</th>
                  </tr>
                  </thead>
                  <tbody>
                  {/* For non-legacy vault branches vault_data is always [] — use vaultDepositTxs as fallback */}
                  {[...(isLegacy ? vaultDepositEntries : vaultDepositTxs.length > 0 ? vaultDepositTxs : vaultDepositEntries), ...operationalExpenses]
                    .sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''))
                    .map((e: any) => {
                      const isVaultDep = e.category === 'VAULT_DEPOSIT' || e.type === 'DEPOSIT';
                      return (
                        <tr key={e.id} className="break-inside-avoid">
                          <td className="border border-slate-200 px-2 py-1.5 font-bold uppercase">{e.name || 'VAULT DEPOSIT'}</td>
                          {!isLegacy && <td className="border border-slate-200 px-2 py-1.5 text-center text-xs uppercase tracking-widest text-slate-400">{isVaultDep ? 'Vault Deposit' : 'Expense'}</td>}
                          <td className={`border border-slate-200 px-2 py-1.5 text-right font-bold tabular-nums ${isVaultDep ? 'text-violet-600' : 'text-rose-600'}`}>₱{Number(e.amount || 0).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {isLegacy && rentAndBillsEntries.length > 0 && (
              <div className="space-y-2 break-inside-avoid">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Rent & Bills</h4>
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead>
                  <tr className="bg-slate-50 font-medium uppercase tracking-wide">
                    <th className="border border-slate-200 px-2 py-1.5 text-left">Item</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-right">Amount</th>
                  </tr>
                  </thead>
                  <tbody>
                  {rentAndBillsEntries.map((e: any) => (
                      <tr key={e.id} className="break-inside-avoid">
                        <td className="border border-slate-200 px-2 py-1.5 font-bold uppercase">{e.name}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-bold tabular-nums text-indigo-600">₱{Number(e.amount || 0).toLocaleString()}</td>
                      </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* FOOTER ACTIONS */}
          <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-end items-center shrink-0 no-print">
            <div className="text-right">
              <p className="text-xs font-bold uppercase animate-pulse tracking-wide text-emerald-500/60 mb-1">Finalized Ledger ROI</p>
              {(() => {
                const footerNet = isAggregate
                  ? constituents.reduce((sum, c) => sum + c.netRoi, 0)
                  : Number(report.netRoi || 0);
                const absNet = Math.abs(footerNet);
                return (
                  <p className={`font-medium uppercase tracking-wide tabular-nums leading-none ${footerNet < 0 ? 'text-rose-400' : 'text-emerald-400'} ${
                    absNet.toLocaleString().length > 10 ? 'text-sm sm:text-base' :
                    absNet.toLocaleString().length > 7 ? 'text-base sm:text-lg' :
                    'text-xl sm:text-2xl'
                  }`}>
                    Total Net Yield: {footerNet < 0 ? '−' : ''}₱{absNet.toLocaleString()}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      </div>,
      document.body
  );
};