import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Branch, SalesReport } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toDateStr, getWeekRange, getReportMonth, parseDate } from '@/src/utils/reportUtils';
import { BranchCheckboxDropdown } from '../../../shared/BranchCheckboxDropdown';
import { getTrueDate } from '../../../../lib/time';

export type ExportViewType = 'daily' | 'weekly' | 'monthly';

interface ExportPDFDialogProps {
  view: ExportViewType;
  branches: Branch[];
  salesReports: SalesReport[];
  currentBranch: Branch;
  onClose: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt2 = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

function getAvailableWeeks(salesReports: SalesReport[], branches: Branch[], currentBranch: Branch) {
  const map = new Map<string, { key: string; label: string; start: string; end: string }>();
  salesReports.forEach(r => {
    const targetBranch = branches.find(b => b.id === r.branchId) || currentBranch;
    try {
      const d = parseDate(r.reportDate);
      const { weekStart, weekEnd, label } = getWeekRange(d, targetBranch);
      const key = `${toDateStr(weekStart)}_${toDateStr(weekEnd)}`;
      if (!map.has(key)) map.set(key, { key, label, start: toDateStr(weekStart), end: toDateStr(weekEnd) });
    } catch { /* skip malformed */ }
  });
  return Array.from(map.values()).sort((a, b) => b.start.localeCompare(a.start));
}

function getAvailableMonths(salesReports: SalesReport[]) {
  const map = new Map<string, { key: string; label: string }>();
  salesReports.forEach(r => {
    try {
      const d = parseDate(r.reportDate);
      const { month, year } = getReportMonth(d);
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!map.has(key)) {
        const label = new Date(year, month - 1, 1)
          .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          .toUpperCase();
        map.set(key, { key, label });
      }
    } catch { /* skip */ }
  });
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── PDF generators ──────────────────────────────────────────────────────────

function generateDailyPDF(
  reports: SalesReport[],
  branches: Branch[],
  branchLabel: string,
  dateFrom: string,
  dateTo: string,
  logoDataUrl: string | null,
  appName: string,
  showBranchBreakdown: boolean,
) {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedOn = getTrueDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const periodLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : dateFrom || dateTo || 'ALL DATES';

  // ── Header ───────────────────────────────────────────────────────────────
  const headerH = 32;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, headerH, 'F');

  const logoW = 16;
  const logoH = 16;
  const logoX = 14;
  const logoY = (headerH - logoH) / 2;
  let textX = 14;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, logoX, logoY, logoW, logoH); textX = logoX + logoW + 4; } catch { /* skip */ }
  }

  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
  doc.text(appName.toUpperCase(), textX, 8);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(branchLabel, textX, 16);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
  doc.text('DAILY SALES REPORT', textX, 23);
  doc.text(`Period: ${periodLabel}`, textX, 29);
  doc.text(`Generated: ${generatedOn}`, pageWidth - 14, 23, { align: 'right' });
  doc.text(`Records: ${reports.length}`, pageWidth - 14, 29, { align: 'right' });

  // ── Financial Summary ─────────────────────────────────────────────────────
  const totGross = reports.reduce((s, r) => s + r.grossSales, 0);
  const totPay   = reports.reduce((s, r) => s + r.totalStaffPay, 0);
  const totExp   = reports.reduce((s, r) => s + r.totalExpenses, 0);
  const totVault = reports.reduce((s, r) => s + r.totalVaultProvision, 0);
  const totNet   = reports.reduce((s, r) => s + r.netRoi, 0);

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('FINANCIAL SUMMARY', 14, headerH + 6);
  autoTable(doc, {
    startY: headerH + 9,
    head: [['Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'NET INCOME']],
    body: [[`PHP ${fmt2(totGross)}`, `PHP ${fmt2(totPay)}`, `PHP ${fmt2(totExp)}`, `PHP ${fmt2(totVault)}`, `PHP ${fmt2(totNet)}`]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'right', cellPadding: 2 },
    bodyStyles: { fontSize: 8, fontStyle: 'bold', halign: 'right', cellPadding: 2 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.fillColor = [240, 253, 244];
        data.cell.styles.textColor = [22, 101, 52];
      }
    },
  });

  // ── Daily table ───────────────────────────────────────────────────────────
  const tableStartY = ((doc as any).lastAutoTable?.finalY ?? 0) + 8;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('DAILY RECORDS', 14, tableStartY);

  let head: string[][];
  let body: string[][];

  if (showBranchBreakdown) {
    head = [['Date', 'Branch', 'Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'Net Income']];
    const sorted = [...reports].sort((a, b) => {
      const dc = a.reportDate.localeCompare(b.reportDate);
      if (dc !== 0) return dc;
      return (branches.find(br => br.id === a.branchId)?.name || '').localeCompare(branches.find(br => br.id === b.branchId)?.name || '');
    });
    body = sorted.map(r => {
      const dateStr = new Date(r.reportDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      return [dateStr, (branches.find(br => br.id === r.branchId)?.name || r.branchId).toUpperCase(), fmt2(r.grossSales), fmt2(r.totalStaffPay), fmt2(r.totalExpenses), fmt2(r.totalVaultProvision), fmt2(r.netRoi)];
    });
    body.push(['TOTAL', '', fmt2(totGross), fmt2(totPay), fmt2(totExp), fmt2(totVault), fmt2(totNet)]);
  } else {
    head = [['Date', 'Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'Net Income']];
    const byDate: Record<string, { gross: number; pay: number; exp: number; vault: number; net: number }> = {};
    reports.forEach(r => {
      if (!byDate[r.reportDate]) byDate[r.reportDate] = { gross: 0, pay: 0, exp: 0, vault: 0, net: 0 };
      byDate[r.reportDate].gross += r.grossSales;
      byDate[r.reportDate].pay   += r.totalStaffPay;
      byDate[r.reportDate].exp   += r.totalExpenses;
      byDate[r.reportDate].vault += r.totalVaultProvision;
      byDate[r.reportDate].net   += r.netRoi;
    });
    body = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => [
      new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      fmt2(t.gross), fmt2(t.pay), fmt2(t.exp), fmt2(t.vault), fmt2(t.net),
    ]);
    body.push(['TOTAL', fmt2(totGross), fmt2(totPay), fmt2(totExp), fmt2(totVault), fmt2(totNet)]);
  }

  autoTable(doc, {
    startY: tableStartY + 3,
    head,
    body,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: showBranchBreakdown ? {
      0: { cellWidth: 32 }, 1: { cellWidth: 36 },
      2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    } : {
      0: { cellWidth: 40 },
      1: { halign: 'right' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fillColor = [15, 23, 42];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`DAILY_REPORT_${branchLabel.replace(/\s+/g, '_')}_${periodLabel.replace(/\s+/g, '_')}.pdf`);
}

function generateWeeklyPDF(
  reports: SalesReport[],
  branches: Branch[],
  currentBranch: Branch,
  branchLabel: string,
  weekStart: string,
  weekEnd: string,
  weekLabel: string,
  logoDataUrl: string | null,
  appName: string,
  showBranchBreakdown: boolean,
) {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedOn = getTrueDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const headerH = 32;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, headerH, 'F');

  const logoW = 16; const logoH = 16;
  let textX = 14;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 14, (headerH - logoH) / 2, logoW, logoH); textX = 14 + logoW + 4; } catch { /* skip */ }
  }
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
  doc.text(appName.toUpperCase(), textX, 8);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(branchLabel, textX, 16);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
  doc.text('WEEKLY SALES REPORT', textX, 23);
  doc.text(`Week: ${weekLabel}   |   ${weekStart} to ${weekEnd}`, textX, 29);
  doc.text(`Generated: ${generatedOn}`, pageWidth - 14, 23, { align: 'right' });

  // Financial summary
  const totGross = reports.reduce((s, r) => s + r.grossSales, 0);
  const totPay   = reports.reduce((s, r) => s + r.totalStaffPay, 0);
  const totExp   = reports.reduce((s, r) => s + r.totalExpenses, 0);
  const totVault = reports.reduce((s, r) => s + r.totalVaultProvision, 0);
  const totNet   = reports.reduce((s, r) => s + r.netRoi, 0);

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('FINANCIAL SUMMARY', 14, headerH + 6);
  autoTable(doc, {
    startY: headerH + 9,
    head: [['Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'NET INCOME']],
    body: [[fmt2(totGross), fmt2(totPay), fmt2(totExp), fmt2(totVault), fmt2(totNet)]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'right', cellPadding: 2 },
    bodyStyles: { fontSize: 8, fontStyle: 'bold', halign: 'right', cellPadding: 2 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.fillColor = [240, 253, 244];
        data.cell.styles.textColor = [22, 101, 52];
      }
    },
  });

  // Daily breakdown
  let dailyBody: string[][];
  if (showBranchBreakdown) {
    const sorted = [...reports].sort((a, b) => {
      const dc = a.reportDate.localeCompare(b.reportDate);
      if (dc !== 0) return dc;
      return (branches.find(br => br.id === a.branchId)?.name || '').localeCompare(branches.find(br => br.id === b.branchId)?.name || '');
    });
    dailyBody = sorted.map(r => {
      const dateStr = new Date(r.reportDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return [dateStr, (branches.find(br => br.id === r.branchId)?.name || r.branchId).toUpperCase(), fmt2(r.grossSales), fmt2(r.totalStaffPay), fmt2(r.totalExpenses), fmt2(r.totalVaultProvision), fmt2(r.netRoi)];
    });
    dailyBody.push(['TOTAL', '', fmt2(totGross), fmt2(totPay), fmt2(totExp), fmt2(totVault), fmt2(totNet)]);
  } else {
    const byDate: Record<string, { gross: number; pay: number; exp: number; vault: number; net: number }> = {};
    reports.forEach(r => {
      if (!byDate[r.reportDate]) byDate[r.reportDate] = { gross: 0, pay: 0, exp: 0, vault: 0, net: 0 };
      byDate[r.reportDate].gross  += r.grossSales;
      byDate[r.reportDate].pay    += r.totalStaffPay;
      byDate[r.reportDate].exp    += r.totalExpenses;
      byDate[r.reportDate].vault  += r.totalVaultProvision;
      byDate[r.reportDate].net    += r.netRoi;
    });
    dailyBody = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => [
      new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      fmt2(t.gross), fmt2(t.pay), fmt2(t.exp), fmt2(t.vault), fmt2(t.net),
    ]);
    dailyBody.push(['TOTAL', fmt2(totGross), fmt2(totPay), fmt2(totExp), fmt2(totVault), fmt2(totNet)]);
  }

  const secY = ((doc as any).lastAutoTable?.finalY ?? 0) + 6;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('DAILY BREAKDOWN', 14, secY);
  autoTable(doc, {
    startY: secY + 2,
    head: showBranchBreakdown
      ? [['Date', 'Branch', 'Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'Net Income']]
      : [['Date', 'Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'Net Income']],
    body: dailyBody,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: showBranchBreakdown ? {
      0: { cellWidth: 28 }, 1: { cellWidth: 34 },
      2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    } : {
      0: { cellWidth: 30 },
      1: { halign: 'right' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === dailyBody.length - 1) {
        data.cell.styles.fillColor = [15, 23, 42];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`WEEKLY_REPORT_${branchLabel.replace(/\s+/g, '_')}_${weekStart}.pdf`);
}

function generateMonthlyPDF(
  reports: SalesReport[],
  monthKeys: string[],
  branchLabel: string,
  logoDataUrl: string | null,
  appName: string,
  showBranchBreakdown: boolean,
  branches: Branch[],
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const generatedOn = getTrueDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  monthKeys.forEach((monthKey, idx) => {
    if (idx > 0) doc.addPage();

    const [year, mon] = monthKey.split('-').map(Number);
    const monthStart = `${monthKey}-01`;
    const monthEnd = `${monthKey}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`;
    const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

    const monthReports = reports.filter(r => r.reportDate >= monthStart && r.reportDate <= monthEnd);

    const totGross = monthReports.reduce((s, r) => s + r.grossSales, 0);
    const totPay   = monthReports.reduce((s, r) => s + r.totalStaffPay, 0);
    const totExp   = monthReports.reduce((s, r) => s + r.totalExpenses, 0);
    const totVault = monthReports.reduce((s, r) => s + r.totalVaultProvision, 0);
    const totNet   = monthReports.reduce((s, r) => s + r.netRoi, 0);

    // Header
    const headerH = 30;
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, headerH, 'F');

    const logoW = 14; const logoH = 14;
    let textX = 14;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 14, (headerH - logoH) / 2, logoW, logoH); textX = 14 + logoW + 4; } catch { /* skip */ }
    }
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
    doc.text(appName.toUpperCase(), textX, 7);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(branchLabel, textX, 14);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
    doc.text('MONTHLY SALES REPORT — FOR GOVERNMENT / REGULATORY USE', textX, 20);
    doc.text(`Period: ${monthLabel}   |   Scope: ${monthStart} to ${monthEnd}`, textX, 26);
    doc.text(`Generated: ${generatedOn}`, pageWidth - 14, 20, { align: 'right' });

    // Financial summary (horizontal)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('FINANCIAL SUMMARY', 14, headerH + 6);
    autoTable(doc, {
      startY: headerH + 8,
      head: [['Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'NET INCOME']],
      body: [[`PHP ${fmt2(totGross)}`, `PHP ${fmt2(totPay)}`, `PHP ${fmt2(totExp)}`, `PHP ${fmt2(totVault)}`, `PHP ${fmt2(totNet)}`]],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'right', cellPadding: 2 },
      bodyStyles: { fontSize: 8, fontStyle: 'bold', halign: 'right', cellPadding: 2 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.fillColor = [240, 253, 244];
          data.cell.styles.textColor = [22, 101, 52];
        }
      },
    });

    // Daily breakdown
    let dailyBody: string[][];
    if (showBranchBreakdown) {
      const sorted = [...monthReports].sort((a, b) => {
        const dc = a.reportDate.localeCompare(b.reportDate);
        if (dc !== 0) return dc;
        return (branches.find(br => br.id === a.branchId)?.name || '').localeCompare(branches.find(br => br.id === b.branchId)?.name || '');
      });
      dailyBody = sorted.map(r => [
        new Date(r.reportDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        (branches.find(br => br.id === r.branchId)?.name || r.branchId).toUpperCase(),
        fmt2(r.grossSales), fmt2(r.totalStaffPay), fmt2(r.totalExpenses), fmt2(r.totalVaultProvision), fmt2(r.netRoi),
      ]);
      dailyBody.push(['TOTAL', '', fmt2(totGross), fmt2(totPay), fmt2(totExp), fmt2(totVault), fmt2(totNet)]);
    } else {
      const byDate: Record<string, { gross: number; pay: number; exp: number; vault: number; net: number }> = {};
      monthReports.forEach(r => {
        if (!byDate[r.reportDate]) byDate[r.reportDate] = { gross: 0, pay: 0, exp: 0, vault: 0, net: 0 };
        byDate[r.reportDate].gross  += r.grossSales;
        byDate[r.reportDate].pay    += r.totalStaffPay;
        byDate[r.reportDate].exp    += r.totalExpenses;
        byDate[r.reportDate].vault  += r.totalVaultProvision;
        byDate[r.reportDate].net    += r.netRoi;
      });
      dailyBody = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => [
        new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        fmt2(t.gross), fmt2(t.pay), fmt2(t.exp), fmt2(t.vault), fmt2(t.net),
      ]);
      dailyBody.push(['TOTAL', fmt2(totGross), fmt2(totPay), fmt2(totExp), fmt2(totVault), fmt2(totNet)]);
    }

    const secY = ((doc as any).lastAutoTable?.finalY ?? 0) + 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('DAILY BREAKDOWN', 14, secY);
    autoTable(doc, {
      startY: secY + 2,
      head: showBranchBreakdown
        ? [['Date', 'Branch', 'Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'Net Income']]
        : [['Date', 'Gross Sales', 'Payroll', 'Expenses', 'Vault / R&B', 'Net Income']],
      body: dailyBody,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, cellPadding: 2 },
      bodyStyles: { fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
      columnStyles: showBranchBreakdown ? {
        0: { cellWidth: 22 }, 1: { cellWidth: 28 },
        2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 23 },
        4: { halign: 'right', cellWidth: 23 }, 5: { halign: 'right', cellWidth: 23 },
        6: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
      } : {
        0: { cellWidth: 26 },
        1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 27 },
        3: { halign: 'right', cellWidth: 27 }, 4: { halign: 'right', cellWidth: 27 },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.row.index === dailyBody.length - 1) {
          data.cell.styles.fillColor = [15, 23, 42];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Certification footer
    const tableEnd = ((doc as any).lastAutoTable?.finalY ?? 0) + 8;
    const footerY = Math.max(tableEnd, pageH - 36);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text('I hereby certify that the above information is true and correct to the best of my knowledge.', 14, footerY);
    const sigY = footerY + 14;
    doc.line(14, sigY, 90, sigY);
    doc.line(pageWidth - 90, sigY, pageWidth - 14, sigY);
    doc.setFontSize(7);
    doc.text('Prepared by / Signature over Printed Name', 14, sigY + 4);
    doc.text('Approved by / Signature over Printed Name', pageWidth - 90, sigY + 4);
    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text(`System-generated report · ${generatedOn}`, pageWidth / 2, pageH - 6, { align: 'center' });
  });

  const slug = monthKeys.length === 1 ? monthKeys[0] : `${monthKeys.length}_MONTHS`;
  doc.save(`MONTHLY_REPORT_${branchLabel.replace(/\s+/g, '_')}_${slug}.pdf`);
}

// ─── Dialog UI ───────────────────────────────────────────────────────────────

export const ExportPDFDialog: React.FC<ExportPDFDialogProps> = ({ view, branches, salesReports, currentBranch, onClose }) => {
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);  // empty = all
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedWeekKey, setSelectedWeekKey] = useState('');
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);
  const [showBranchBreakdown, setShowBranchBreakdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const availableWeeks = useMemo(() => getAvailableWeeks(salesReports, branches, currentBranch), [salesReports, branches, currentBranch]);
  const availableMonths = useMemo(() => getAvailableMonths(salesReports), [salesReports]);

  const activeBranches = useMemo(
    () => branches.filter(b => b.isEnabled !== false && !b.name.toUpperCase().includes('TEST')),
    [branches]
  );

  const toggleMonth = (key: string) => {
    playSound('click');
    setSelectedMonthKeys(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  };

  const effectiveBranchIds = selectedBranchIds.length === 0
    ? activeBranches.map(b => b.id)
    : selectedBranchIds;

  // Only show breakdown toggle when more than one branch is in scope
  const isMultiBranch = effectiveBranchIds.length > 1;

  const branchLabel = selectedBranchIds.length === 0
    ? (currentBranch.id === 'all' ? 'ALL BRANCHES' : currentBranch.name.toUpperCase())
    : selectedBranchIds.length === 1
      ? (branches.find(b => b.id === selectedBranchIds[0])?.name || '').toUpperCase()
      : `${selectedBranchIds.length} BRANCHES`;

  const previewCount = useMemo(() => {
    const branchFiltered = salesReports.filter(r => effectiveBranchIds.includes(r.branchId));
    if (view === 'daily') {
      return branchFiltered.filter(r =>
        (!dateFrom || r.reportDate >= dateFrom) && (!dateTo || r.reportDate <= dateTo)
      ).length;
    }
    if (view === 'weekly') {
      if (!selectedWeekKey) return 0;
      const [ws, we] = selectedWeekKey.split('_');
      return branchFiltered.filter(r => r.reportDate >= ws && r.reportDate <= we).length;
    }
    if (view === 'monthly') {
      if (!selectedMonthKeys.length) return 0;
      return branchFiltered.filter(r => {
        const d = parseDate(r.reportDate);
        const { month, year } = getReportMonth(d);
        const key = `${year}-${String(month).padStart(2, '0')}`;
        return selectedMonthKeys.includes(key);
      }).length;
    }
    return 0;
  }, [salesReports, effectiveBranchIds, view, dateFrom, dateTo, selectedWeekKey, selectedMonthKeys]);

  const canExport = previewCount > 0 && (
    view === 'daily' ||
    (view === 'weekly' && !!selectedWeekKey) ||
    (view === 'monthly' && selectedMonthKeys.length > 0)
  );

  const handleExport = async () => {
    if (!canExport) return;
    setIsExporting(true);
    playSound('click');
    try {
      // Load logo from localStorage cache (set by useGlobalData)
      const cachedLogoUrl = localStorage.getItem('hilot_cached_logo');
      const logoDataUrl = cachedLogoUrl ? await urlToDataUrl(cachedLogoUrl) : null;
      const appName = localStorage.getItem('hilot_cached_app_name') || 'Hilot Center';

      const filtered = salesReports.filter(r => effectiveBranchIds.includes(r.branchId));

      if (view === 'daily') {
        const periodFiltered = filtered.filter(r =>
          (!dateFrom || r.reportDate >= dateFrom) && (!dateTo || r.reportDate <= dateTo)
        );
        generateDailyPDF(periodFiltered, branches, branchLabel, dateFrom, dateTo, logoDataUrl, appName, showBranchBreakdown);
      }

      if (view === 'weekly' && selectedWeekKey) {
        const [ws, we] = selectedWeekKey.split('_');
        const weekFiltered = filtered.filter(r => r.reportDate >= ws && r.reportDate <= we);
        const weekInfo = availableWeeks.find(w => w.key === selectedWeekKey)!;
        generateWeeklyPDF(weekFiltered, branches, currentBranch, branchLabel, weekInfo.start, weekInfo.end, weekInfo.label, logoDataUrl, appName, showBranchBreakdown);
      }

      if (view === 'monthly' && selectedMonthKeys.length > 0) {
        generateMonthlyPDF(filtered, selectedMonthKeys.sort(), branchLabel, logoDataUrl, appName, showBranchBreakdown, branches);
      }

      playSound('success');
      onClose();
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setIsExporting(false);
    }
  };

  const viewMeta = {
    daily:   { label: 'Daily Report',   icon: 'D', color: 'bg-blue-600' },
    weekly:  { label: 'Weekly Report',  icon: 'W', color: 'bg-violet-600' },
    monthly: { label: 'Monthly Report', icon: 'M', color: 'bg-emerald-600' },
  }[view];

  return createPortal(
    <div className="fixed inset-0 z-[7000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-slate-100 shrink-0">
          <div className={`w-10 h-10 ${viewMeta.color} rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0`}>
            {viewMeta.icon}
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Export {viewMeta.label}</h3>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Configure your PDF export</p>
          </div>
          <button onClick={() => { onClose(); playSound('click'); }} className="ml-auto w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Branch dropdown — outside scroll container so the dropdown isn't clipped */}
        {currentBranch.id === 'all' && (
          <div className="px-6 pt-5 pb-3 shrink-0">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Branch</p>
            <BranchCheckboxDropdown
              branches={activeBranches}
              selectedIds={selectedBranchIds}
              onChange={(ids) => { setSelectedBranchIds(ids); playSound('click'); }}
              placeholder="All Branches"
              className="w-full"
            />
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-6">
          {/* top padding only when branch section is absent */}
          {currentBranch.id !== 'all' && <div className="pt-6" />}

          {/* Period — Daily: date range picker */}
          {view === 'daily' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Date Range</p>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); playSound('click'); }}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-600 uppercase tracking-wide transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* From */}
                <label className={`relative flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-all group ${dateFrom ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'}`}>
                  <svg className={`w-4 h-4 shrink-0 transition-colors ${dateFrom ? 'text-emerald-500' : 'text-slate-300 group-hover:text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs font-black uppercase tracking-wider leading-none mb-1 ${dateFrom ? 'text-emerald-600' : 'text-slate-400'}`}>From</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => { setDateFrom(e.target.value); playSound('click'); }}
                      className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer w-full"
                    />
                  </div>
                </label>
                {/* To */}
                <label className={`relative flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-all group ${dateTo ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'}`}>
                  <svg className={`w-4 h-4 shrink-0 transition-colors ${dateTo ? 'text-emerald-500' : 'text-slate-300 group-hover:text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs font-black uppercase tracking-wider leading-none mb-1 ${dateTo ? 'text-emerald-600' : 'text-slate-400'}`}>To</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={e => { setDateTo(e.target.value); playSound('click'); }}
                      className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer w-full"
                    />
                  </div>
                </label>
              </div>
              {!dateFrom && !dateTo && (
                <p className="text-xs text-slate-400 mt-2 ml-1">Leave blank to export all dates</p>
              )}
            </div>
          )}

          {/* Period — Weekly */}
          {view === 'weekly' && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Select Week</p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {availableWeeks.map(w => (
                  <button
                    key={w.key}
                    onClick={() => { setSelectedWeekKey(w.key); playSound('click'); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${selectedWeekKey === w.key ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-400'}`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wide">{w.label}</span>
                    <span className={`text-xs font-medium ${selectedWeekKey === w.key ? 'text-slate-400' : 'text-slate-400'}`}>{w.start} – {w.end}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Period — Monthly */}
          {view === 'monthly' && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Select Month(s)</p>
              <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {availableMonths.map(m => (
                  <button
                    key={m.key}
                    onClick={() => toggleMonth(m.key)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-all ${selectedMonthKeys.includes(m.key) ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-400'}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selectedMonthKeys.includes(m.key) ? 'bg-emerald-400 border-emerald-400' : 'border-slate-300'}`}>
                      {selectedMonthKeys.includes(m.key) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      )}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wide truncate">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 shrink-0 space-y-3">
          {/* Branch breakdown toggle — only when multi-branch */}
          {isMultiBranch && (
            <button
              onClick={() => { setShowBranchBreakdown(v => !v); playSound('click'); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${showBranchBreakdown ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${showBranchBreakdown ? 'bg-violet-600 border-violet-600' : 'border-slate-300'}`}>
                  {showBranchBreakdown && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-xs font-bold uppercase tracking-wide ${showBranchBreakdown ? 'text-violet-700' : 'text-slate-600'}`}>Show branch breakdown</p>
                  <p className="text-xs text-slate-400 mt-0.5">{showBranchBreakdown ? 'One row per branch per day' : 'Consolidated total per day'}</p>
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${showBranchBreakdown ? 'bg-violet-600' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${showBranchBreakdown ? 'left-4' : 'left-0.5'}`} />
              </div>
            </button>
          )}

          {/* Preview pill */}
          <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${previewCount > 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-200'}`}>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Records selected</span>
            <span className={`text-sm font-black tabular-nums ${previewCount > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>{previewCount.toLocaleString()}</span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { onClose(); playSound('click'); }}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={!canExport || isExporting}
              className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isExporting
                ? <><div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Generating…</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg> Export PDF</>
              }
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
