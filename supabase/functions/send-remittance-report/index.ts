import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MANILA_TZ = 'Asia/Manila';

function getManilaDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function getManilaTimestamp(): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TZ,
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date());
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmt(n: number): string {
  const abs = '₱' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? '−' + abs : abs;
}

/**
 * Compute the previous completed week's period label for a branch.
 */
function getPreviousPeriodLabel(
  todayStr: string,
  weeklyCutoff: number,
  cutoffHistory: { effectiveFrom: string; cutoff: number }[],
  cycleStartDate: string | null,
): { label: string; weekStart: Date; weekEnd: Date } {
  const today = parseDate(todayStr);
  const todayDay = today.getDay();

  let activeCutoff = weeklyCutoff;
  const history = [...(cutoffHistory ?? [])].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  );
  for (const entry of history) {
    if (parseDate(entry.effectiveFrom) <= today) activeCutoff = entry.cutoff;
  }

  let daysBack = (todayDay - activeCutoff + 7) % 7;
  if (daysBack === 0) daysBack = 7;

  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() - daysBack);

  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);

  if (cycleStartDate) {
    const cycleStart = parseDate(cycleStartDate);
    if (cycleStart > weekStart && cycleStart <= weekEnd) {
      weekStart.setFullYear(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate());
    }
  }

  const label = `${formatShort(weekStart)} — ${formatShort(weekEnd)}`;
  return { label, weekStart, weekEnd };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function cleanBranchName(name: string): string {
  return (name || '').replace(/BRANCH\s*-\s*/i, '').trim();
}

/** Normalizes owner names to Title Case regardless of how they were saved. */
function toTitleCase(str: string): string {
  return str.trim().split(/(\s+|-)/).map(part =>
    part === '-' || part.trim() === '' ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join('');
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface OwnerShare {
  name: string;
  percentage: number;
  amount: number; // final distributable share
}

interface BranchRow {
  name: string;
  period: string;
  note: string;
  status: 'remitted' | 'pending' | 'no_data' | 'nothing_to_remit';
  // Populated for remitted branches only
  grossSales?: number;
  totalStaffPay?: number;
  totalExpenses?: number;
  totalVaultProvision?: number;
  pureNetRoi?: number;
  totalGlobalAdj?: number;
  adjustedRoi?: number;
  levyName?: string;
  levyCut?: number;
  distributableRoi?: number;
  ownerShares?: OwnerShare[];
}

// ── Email template ─────────────────────────────────────────────────────────────
function roiSummary(row: BranchRow): string {
  if (row.pureNetRoi === undefined) return '';
  const roi = row.distributableRoi ?? row.pureNetRoi;
  return `
    <div style="margin-top:10px;border-top:1px solid #d1fae5;padding-top:10px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:12px;font-weight:900;color:#0f172a;">Net ROI</td>
          <td style="text-align:right;font-size:13px;font-weight:900;color:#0f172a;">${fmt(roi)}</td>
        </tr>
      </table>
      ${(row.ownerShares && row.ownerShares.length > 0) ? `
      <div style="margin-top:8px;">
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px;">Owner's Distribution:</div>
        <table style="width:100%;border-collapse:collapse;">
          ${row.ownerShares.map(o => `
          <tr>
            <td style="padding:2px 0;font-size:12px;color:#334155;">${toTitleCase(o.name)}</td>
            <td style="padding:2px 0;text-align:right;font-size:12px;font-weight:700;color:#0f172a;">${fmt(o.amount)}</td>
          </tr>`).join('')}
        </table>
      </div>` : ''}
    </div>
  `;
}

function buildSummaryHtml(
  remitted: BranchRow[],
  ownerSummary?: { name: string; amount: number }[],
  networkRoi?: number,
): string {
  if (remitted.length === 0) return '';

  // Use pre-computed values from the frontend Owners tab if provided.
  // This guarantees the email and Owners tab show identical numbers.
  const totalRoi = networkRoi ?? remitted.reduce((s, r) => s + (r.distributableRoi ?? r.pureNetRoi ?? 0), 0);
  const ownerEntries: { displayName: string; amount: number }[] = ownerSummary
    ? ownerSummary.map(o => ({ displayName: o.name, amount: o.amount }))
    : (() => {
        const ownerTotals: Record<string, { displayName: string; amount: number }> = {};
        for (const r of remitted) {
          for (const o of r.ownerShares ?? []) {
            const key = o.name.trim().toLowerCase();
            if (ownerTotals[key]) ownerTotals[key].amount += o.amount;
            else ownerTotals[key] = { displayName: o.name.trim(), amount: o.amount };
          }
        }
        return Object.values(ownerTotals).sort((a, b) => b.amount - a.amount);
      })();

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;margin-bottom:20px;">
      <tr><td style="padding:20px 28px;">

        <div style="font-size:10px;font-weight:900;letter-spacing:0.2em;color:#94a3b8;text-transform:uppercase;margin-bottom:14px;">Network Summary — Remitted Branches</div>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <!-- Total ROI box -->
            <td style="vertical-align:top;width:220px;">
              <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 18px;">
                <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:6px;">Total ROI</div>
                <div style="font-size:28px;font-weight:900;color:#34d399;letter-spacing:-0.02em;line-height:1;">${fmt(totalRoi)}</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">${remitted.length} branch${remitted.length !== 1 ? 'es' : ''} remitted</div>
              </div>
            </td>

            <td style="width:20px;"></td>

            <!-- Owner distribution -->
            <td style="vertical-align:top;">
              <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 18px;">
                <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;">Owner Distribution</div>
                ${ownerEntries.length === 0
                  ? `<div style="font-size:12px;color:#475569;font-style:italic;">No owner data available</div>`
                  : `<table width="100%" cellpadding="0" cellspacing="0">
                      ${ownerEntries.map((o, i) => `
                      <tr>
                        <td style="padding:4px 0;border-top:${i > 0 ? '1px solid #1e3a5f' : 'none'};">
                          <span style="font-size:10px;font-weight:700;color:#64748b;margin-right:8px;">${i + 1}.</span>
                          <span style="font-size:13px;font-weight:700;color:#cbd5e1;">${toTitleCase(o.displayName)}</span>
                        </td>
                        <td style="padding:4px 0;text-align:right;border-top:${i > 0 ? '1px solid #1e3a5f' : 'none'};">
                          <span style="font-size:14px;font-weight:900;color:#f1f5f9;">${fmt(o.amount)}</span>
                        </td>
                      </tr>`).join('')}
                    </table>`}
              </div>
            </td>
          </tr>
        </table>

      </td></tr>
    </table>
  `;
}

function buildEmailHtml(
  generatedAt: string,
  branchRows: BranchRow[],
  timestamp: string,
  ownerSummary?: { name: string; amount: number }[],
  networkRoi?: number,
): string {
  const remitted       = branchRows.filter(r => r.status === 'remitted');
  const pending        = branchRows.filter(r => r.status === 'pending' || r.status === 'no_data');
  const nothingToRemit = branchRows.filter(r => r.status === 'nothing_to_remit');

  // Remitted cards paired into rows of 2 for the grid
  const remittedCardHtml = (r: BranchRow) => `
    <div style="background:#fff;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;height:100%;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:13px;font-weight:700;color:#1e293b;">${r.name}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${r.period}</div>
          </td>
          <td style="text-align:right;vertical-align:top;white-space:nowrap;">
            <span style="background:#16a34a;color:#fff;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:900;">✓ Remitted</span>
          </td>
        </tr>
      </table>
      ${roiSummary(r)}
      ${r.note ? `<div style="font-size:11px;color:#64748b;margin-top:8px;font-style:italic;border-top:1px solid #e2e8f0;padding-top:6px;">${r.note}</div>` : ''}
    </div>`;

  // Pair remitted cards into 2-column rows
  const remittedRows = [];
  for (let i = 0; i < remitted.length; i += 2) {
    const left  = remitted[i];
    const right = remitted[i + 1];
    remittedRows.push(`
      <tr>
        <td style="width:50%;vertical-align:top;padding:0 6px 12px 0;">${remittedCardHtml(left)}</td>
        <td style="width:50%;vertical-align:top;padding:0 0 12px 6px;">${right ? remittedCardHtml(right) : ''}</td>
      </tr>`);
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;font-family:sans-serif;">
    <tr><td style="padding:24px 32px;">

      <!-- Header -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;margin-bottom:20px;">
        <tr><td style="padding:20px 28px;">
          <div style="font-size:20px;font-weight:900;letter-spacing:0.08em;color:#fff;text-transform:uppercase;">Hilot Center</div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.2em;color:#94a3b8;text-transform:uppercase;margin-top:4px;">Weekly Remittance Status Report</div>
          <div style="margin-top:12px;">
            <span style="font-size:12px;color:#94a3b8;">As of </span>
            <span style="font-size:14px;font-weight:900;color:#fff;">${generatedAt}</span>
            <span style="font-size:11px;color:#64748b;margin-left:12px;">Each branch reflects its own most recent completed cycle</span>
          </div>
        </td>
        <td style="text-align:right;padding:20px 28px;white-space:nowrap;vertical-align:top;">
          <table cellpadding="0" cellspacing="0" style="display:inline-table;">
            <tr>
              <td style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:12px 20px;text-align:center;">
                <div style="font-size:32px;font-weight:900;color:#d97706;line-height:1;">${pending.length}</div>
                <div style="font-size:9px;font-weight:900;color:#d97706;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px;">Pending</div>
              </td>
              <td style="width:10px;"></td>
              <td style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:12px 20px;text-align:center;">
                <div style="font-size:32px;font-weight:900;color:#94a3b8;line-height:1;">${nothingToRemit.length}</div>
                <div style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px;">N/A</div>
              </td>
              <td style="width:10px;"></td>
              <td style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:10px;padding:12px 20px;text-align:center;">
                <div style="font-size:32px;font-weight:900;color:#16a34a;line-height:1;">${remitted.length}</div>
                <div style="font-size:9px;font-weight:900;color:#16a34a;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px;">Remitted</div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>

      ${buildSummaryHtml(remitted, ownerSummary, networkRoi)}

      <!-- Body: pending left | remitted grid right -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>

          <!-- Left: Pending -->
          <td width="260" valign="top" style="padding-right:16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
              <tr><td style="padding:14px 16px 4px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:11px;font-weight:900;color:#d97706;text-transform:uppercase;letter-spacing:0.08em;">⏳ Not Yet Remitted</td>
                    <td style="text-align:right;"><span style="background:#d97706;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:900;">${pending.length}</span></td>
                  </tr>
                </table>
              </td></tr>
              ${pending.length === 0
                ? `<tr><td style="padding:12px 16px;font-size:12px;color:#94a3b8;font-style:italic;">All branches remitted ✓</td></tr>`
                : pending.map(r => `
              <tr><td style="padding:10px 16px;border-top:1px solid #fde68a;">
                <div style="font-size:13px;font-weight:700;color:#1e293b;">${r.name}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${r.period}</div>
                ${r.note ? `<div style="font-size:11px;color:#64748b;margin-top:3px;font-style:italic;">${r.note}</div>` : ''}
              </td></tr>`).join('')}
            </table>

            ${nothingToRemit.length > 0 ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-top:12px;">
              <tr><td style="padding:14px 16px 4px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:11px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">— Nothing to Remit</td>
                    <td style="text-align:right;"><span style="background:#94a3b8;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:900;">${nothingToRemit.length}</span></td>
                  </tr>
                </table>
              </td></tr>
              ${nothingToRemit.map(r => `
              <tr><td style="padding:10px 16px;border-top:1px solid #e2e8f0;">
                <div style="font-size:13px;font-weight:700;color:#64748b;">${r.name}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${r.period}</div>
                ${r.note ? `<div style="font-size:11px;color:#64748b;margin-top:3px;font-style:italic;">${r.note}</div>` : ''}
              </td></tr>`).join('')}
            </table>` : ''}
          </td>

          <!-- Right: Remitted 2-column grid -->
          <td valign="top">
            ${remitted.length === 0
              ? `<div style="font-size:12px;color:#94a3b8;font-style:italic;padding:12px 0;">No branches remitted yet.</div>`
              : `<table width="100%" cellpadding="0" cellspacing="0">
                   <tr>
                     <td colspan="2" style="padding-bottom:10px;">
                       <span style="font-size:11px;font-weight:900;color:#16a34a;text-transform:uppercase;letter-spacing:0.08em;">✅ Remitted</span>
                       <span style="background:#16a34a;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:900;margin-left:8px;">${remitted.length}</span>
                     </td>
                   </tr>
                   ${remittedRows.join('')}
                 </table>`}
          </td>

        </tr>
      </table>

      <!-- Footer -->
      <div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;line-height:1.6;">
        Generated automatically &bull; ${timestamp} (Manila time)<br/>
        Hilot Center &mdash; Branch Management System
      </div>

    </td></tr>
    </table>
  `;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'RESEND_API_KEY not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body.email;
    const ownerSummary: { name: string; amount: number }[] | undefined = body.ownerSummary;
    const networkRoi: number | undefined = typeof body.networkRoi === 'number' ? body.networkRoi : undefined;
    const selectedCutoffs: number[] = Array.isArray(body.selectedCutoffs) ? body.selectedCutoffs.map(Number) : [];
    if (!email || !email.includes('@')) return json({ error: 'Valid email address required' }, 400);

    const todayStr = getManilaDateStr();

    // ── 1. Query branches (with owners + group_levy) ──────────────────────────
    const { data: branches, error: branchErr } = await supabase
      .from('branches')
      .select('id, name, is_enabled, weekly_cutoff, cutoff_history, cycle_start_date, owners, group_levy');
    if (branchErr) return json({ error: branchErr.message }, 500);

    const activeBranches = (branches ?? []).filter((b: any) =>
      b.is_enabled === true &&
      !(b.name || '').toUpperCase().includes('TEST') &&
      (selectedCutoffs.length === 0 || selectedCutoffs.includes(Number(b.weekly_cutoff ?? 0)))
    );

    // Compute per-branch period ranges upfront
    const branchPeriods: Record<string, { label: string; weekStart: Date; weekEnd: Date }> = {};
    let minStart = todayStr;
    let maxEnd   = todayStr;
    for (const branch of activeBranches) {
      const rawCutoffHistory = branch.cutoff_history;
      const cutoffHistory = (() => {
        if (!rawCutoffHistory) return [];
        try {
          const parsed = typeof rawCutoffHistory === 'string' ? JSON.parse(rawCutoffHistory) : rawCutoffHistory;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })();
      const period = getPreviousPeriodLabel(
        todayStr,
        Number(branch.weekly_cutoff ?? 0),
        cutoffHistory,
        branch.cycle_start_date ?? null,
      );
      branchPeriods[branch.id] = period;
      const startStr = toDateStr(period.weekStart);
      const endStr   = toDateStr(period.weekEnd);
      if (startStr < minStart) minStart = startStr;
      if (endStr   > maxEnd)   maxEnd   = endStr;
    }

    // ── 2. Parallel queries ───────────────────────────────────────────────────
    const [submissionsResult, notesResult, reportsResult, adjResult] = await Promise.all([
      supabase
        .from('remittance_submissions')
        .select('branch_id, period_label, status')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('remittance_notes')
        .select('branch_id, period_label, note'),
      supabase
        .from('sales_reports')
        .select('branch_id, report_date, gross_sales, total_staff_pay, total_expenses, total_vault_provision, net_roi')
        .gte('report_date', minStart)
        .lte('report_date', maxEnd),
      supabase
        .from('remittance_adjustments')
        .select('branch_id, period_label, description, amount, target_owner'),
    ]);
    if (submissionsResult.error) return json({ error: submissionsResult.error.message }, 500);

    const submissions = submissionsResult.data ?? [];
    const notes       = notesResult.data ?? [];
    const reports     = reportsResult.data ?? [];
    const adjs        = adjResult.data ?? [];

    // ── 3. Build lookups ─────────────────────────────────────────────────────
    // submissionStatus: branchId → { periodLabel → latest status }
    const subByBranch: Record<string, Record<string, string>> = {};
    for (const sub of submissions) {
      if (!subByBranch[sub.branch_id]) subByBranch[sub.branch_id] = {};
      if (!subByBranch[sub.branch_id][sub.period_label]) {
        subByBranch[sub.branch_id][sub.period_label] = sub.status;
      }
    }

    // notes: branchId::periodLabel → note text
    const noteMap: Record<string, string> = {};
    for (const n of notes) {
      noteMap[`${n.branch_id}::${n.period_label}`] = n.note || '';
    }

    // sales reports: branchId → list of reports
    const reportsByBranch: Record<string, typeof reports> = {};
    for (const r of reports) {
      if (!reportsByBranch[r.branch_id]) reportsByBranch[r.branch_id] = [];
      reportsByBranch[r.branch_id].push(r);
    }

    // adjustments: branchId::periodLabel → list
    const adjByKey: Record<string, typeof adjs> = {};
    for (const a of adjs) {
      const k = `${a.branch_id}::${a.period_label}`;
      if (!adjByKey[k]) adjByKey[k] = [];
      adjByKey[k].push(a);
    }

    // ── 4. Classify + enrich each branch ─────────────────────────────────────
    const branchRows: BranchRow[] = [];

    for (const branch of activeBranches) {
      const { label, weekStart, weekEnd } = branchPeriods[branch.id];
      const startStr = toDateStr(weekStart);
      const endStr   = toDateStr(weekEnd);

      const statusMap = subByBranch[branch.id] ?? {};
      const rawStatus = statusMap[label] ?? null;

      // ── Compute ROI for this branch's period (needed for all branches) ────────
      const branchReports = (reportsByBranch[branch.id] ?? []).filter(
        r => r.report_date >= startStr && r.report_date <= endStr
      );
      let grossSales = 0, totalStaffPay = 0, totalExpenses = 0, totalVaultProvision = 0, pureNetRoi = 0;
      for (const r of branchReports) {
        grossSales          += Number(r.gross_sales ?? 0);
        totalStaffPay       += Number(r.total_staff_pay ?? 0);
        totalExpenses       += Number(r.total_expenses ?? 0);
        totalVaultProvision += Number(r.total_vault_provision ?? 0);
        // Use stored net_roi — it was computed correctly at submission time even when
        // total_vault_provision was not saved correctly (vault already baked into net_roi).
        pureNetRoi          += Number(r.net_roi ?? 0);
      }

      // ── Classify ─────────────────────────────────────────────────────────────
      let status: 'remitted' | 'pending' | 'no_data' | 'nothing_to_remit';
      if (rawStatus === 'approved') {
        status = 'remitted';
      } else if (pureNetRoi <= 0) {
        status = 'nothing_to_remit';
      } else if (rawStatus === null) {
        status = 'no_data';
      } else {
        status = 'pending';
      }

      const row: BranchRow = {
        name: cleanBranchName(branch.name),
        period: label,
        note: noteMap[`${branch.id}::${label}`] || '',
        status,
      };

      // ── Enrich remitted branches with owner distribution ──────────────────────
      if (status === 'remitted') {
        const rowAdjs = adjByKey[`${branch.id}::${label}`] ?? [];
        const globalAdjs = rowAdjs.filter((a: any) => !a.target_owner || a.description === 'VAULT DEPOSIT');
        const ownerAdjs  = rowAdjs.filter((a: any) => !!a.target_owner && a.description !== 'VAULT DEPOSIT');
        const totalGlobalAdj = globalAdjs.reduce((s: number, a: any) => s + Number(a.amount), 0);
        const adjustedRoi = pureNetRoi + totalGlobalAdj;

        const rawLevy = branch.group_levy;
        const levy: { name: string; percentage: number } | null = (() => {
          if (!rawLevy) return null;
          try { return typeof rawLevy === 'string' ? JSON.parse(rawLevy) : rawLevy; } catch { return null; }
        })();
        const levyCut = levy ? adjustedRoi * ((Number(levy.percentage) || 0) / 100) : 0;
        const distributableRoi = adjustedRoi - levyCut;

        const rawOwners = branch.owners;
        const owners: { name: string; percentage: number }[] = (() => {
          if (!rawOwners) return [];
          try {
            const parsed = typeof rawOwners === 'string' ? JSON.parse(rawOwners) : rawOwners;
            return Array.isArray(parsed) ? parsed : [];
          } catch { return []; }
        })();
        const ownerShares: OwnerShare[] = owners.map(o => {
          const base = distributableRoi * (o.percentage / 100);
          const ownerAdjTotal = ownerAdjs
            .filter((a: any) => a.target_owner === o.name)
            .reduce((s: number, a: any) => s + Number(a.amount), 0);
          return { name: o.name, percentage: o.percentage, amount: base + ownerAdjTotal };
        });

        row.grossSales = grossSales;
        row.totalStaffPay = totalStaffPay;
        row.totalExpenses = totalExpenses;
        row.totalVaultProvision = totalVaultProvision;
        row.pureNetRoi = pureNetRoi;
        row.totalGlobalAdj = totalGlobalAdj;
        row.adjustedRoi = adjustedRoi;
        row.levyName = levy?.name;
        row.levyCut = levyCut;
        row.distributableRoi = distributableRoi;
        row.ownerShares = ownerShares;
      }

      branchRows.push(row);
    }

    // Sort: pending/no_data first (most actionable), then remitted
    branchRows.sort((a, b) => {
      const order = { pending: 0, no_data: 0, nothing_to_remit: 1, remitted: 2 };
      const diff = order[a.status] - order[b.status];
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

    // ── 5. Build and send email ───────────────────────────────────────────────
    const timestamp  = getManilaTimestamp();
    const generatedAt = new Intl.DateTimeFormat('en-PH', {
      timeZone: MANILA_TZ, year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date());

    const html = buildEmailHtml(generatedAt, branchRows, timestamp, ownerSummary, networkRoi);
    const pending = branchRows.filter(r => r.status === 'pending' || r.status === 'no_data');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Hilot Center <noreply@hilotcenter.cloud>',
        to: email,
        subject: `Remittance Status — ${pending.length} branch${pending.length !== 1 ? 'es' : ''} pending as of ${generatedAt}`,
        html,
      }),
    });

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      console.error('Resend error:', resBody);
      return json({ error: 'Failed to send email', detail: resBody }, 500);
    }

    return json({
      ok: true,
      remitted: branchRows.filter(r => r.status === 'remitted').length,
      pending: pending.length,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
