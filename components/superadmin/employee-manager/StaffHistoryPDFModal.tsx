import React, { useState, useEffect } from 'react';
import { X, FileDown, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Employee, Branch, EmployeeComplaint, AuditLog, Request } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { getTrueDate } from '../../../lib/time';

interface Props {
    employee: Employee;
    branches: Branch[];
    onClose: () => void;
}

function manilaToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(getTrueDate());
}

function calcTenure(startDateStr?: string): string {
    if (!startDateStr) return '—';
    const start = new Date(startDateStr.includes('T') ? startDateStr : startDateStr + 'T00:00:00');
    const now = getTrueDate();
    const totalMonths = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    if (totalMonths < 0) return '—';
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    if (years === 0 && months === 0) return 'Less than a month';
    const parts: string[] = [];
    if (years > 0) parts.push(`${years} yr${years !== 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} mo${months !== 1 ? 's' : ''}`);
    return parts.join(', ');
}

function fmtDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function peso(n: number): string {
    return `₱${n.toLocaleString('en-PH')}`;
}

const ACTION_LABEL: Record<string, string> = {
    NONE: 'No Action',
    WARNING: 'Warning',
    VERBAL_WARNING: 'Verbal Warning',
    WRITTEN_WARNING: 'Written Warning',
    FINAL_WARNING: 'Final Warning',
    SUSPENDED: 'Suspended',
    NOTED: 'Noted',
};

const ACTION_COLOR: Record<string, string> = {
    NONE: 'bg-slate-100 text-slate-400',
    WARNING: 'bg-amber-50 text-amber-600',
    VERBAL_WARNING: 'bg-amber-50 text-amber-600',
    WRITTEN_WARNING: 'bg-orange-50 text-orange-600',
    FINAL_WARNING: 'bg-rose-50 text-rose-600',
    SUSPENDED: 'bg-rose-100 text-rose-700',
    NOTED: 'bg-slate-100 text-slate-500',
};

export const StaffHistoryPDFModal: React.FC<Props> = ({ employee, branches, onClose }) => {
    const today = manilaToday();
    const [complaints, setComplaints] = useState<EmployeeComplaint[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<Request[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    const homeBranch = branches.find(b => b.id === employee.branchId);
    const startDate = employee.details?.dateStart || employee.timestamp;
    const tenure = calcTenure(startDate);
    const statusText = employee.onLeave ? 'ON LEAVE' : employee.isActive ? 'ACTIVE' : 'INACTIVE';

    const empId = employee.timestamp
        ? (() => {
            const d = new Date(employee.timestamp);
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            return `EMP-${mm}-${dd}-${employee.id}`;
        })()
        : employee.id;

    // Build branch assignments from branchAllowances + home branch
    const branchAssignments = (() => {
        const list: { branch: Branch; allowance: number; role: string; isHome: boolean }[] = [];
        if (homeBranch) {
            list.push({ branch: homeBranch, allowance: employee.allowance, role: employee.role, isHome: true });
        }
        if (employee.branchAllowances) {
            Object.entries(employee.branchAllowances).forEach(([bId, val]) => {
                if (bId === employee.branchId) return;
                const branch = branches.find(b => b.id === bId);
                if (!branch) return;
                const allowance = typeof val === 'number' ? val : (val as any).allowance ?? 0;
                const role = typeof val === 'object' ? (val as any).role ?? employee.role : employee.role;
                list.push({ branch, allowance, role, isHome: false });
            });
        }
        return list;
    })();

    useEffect(() => {
        setIsFetching(true);
        Promise.all([
            supabase
                .from(DB_TABLES.EMPLOYEE_COMPLAINTS)
                .select('*')
                .eq(DB_COLUMNS.EMPLOYEE_ID, employee.id)
                .order(DB_COLUMNS.INCIDENT_DATE, { ascending: false }),
            supabase
                .from(DB_TABLES.AUDIT_LOGS)
                .select('*')
                .eq(DB_COLUMNS.ENTITY_TYPE, 'EMPLOYEE')
                .eq(DB_COLUMNS.ENTITY_ID, employee.id)
                .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
                .limit(50),
            supabase
                .from(DB_TABLES.REQUESTS)
                .select('*')
                .eq(DB_COLUMNS.REQUESTER_ID, employee.id)
                .eq(DB_COLUMNS.TYPE, 'LEAVE_REQUEST')
                .order(DB_COLUMNS.TIMESTAMP, { ascending: false }),
        ]).then(([cRes, aRes, rRes]) => {
            setComplaints((cRes.data || []).map((c: any) => ({
                id: c.id, branchId: c.branch_id, employeeId: c.employee_id,
                employeeName: c.employee_name, reportType: c.report_type,
                incidentDate: c.incident_date, incidentTime: c.incident_time,
                witnesses: c.witnesses, description: c.description,
                filedById: c.filed_by_id, filedByName: c.filed_by_name,
                filedAt: c.filed_at, status: c.status, actionTaken: c.action_taken,
                judgment: c.judgment, resolution: c.resolution,
                reviewedBy: c.reviewed_by, reviewedAt: c.reviewed_at,
            })));
            setAuditLogs((aRes.data || []).map((a: any) => ({
                id: a.id, branchId: a.branch_id, timestamp: a.timestamp,
                activityType: a.activity_type, entityType: a.entity_type,
                entityId: a.entity_id, description: a.description,
                amount: a.amount, performerName: a.performer_name,
            })));
            setLeaveRequests((rRes.data || []).map((r: any) => ({
                id: r.id, branchId: r.branch_id, timestamp: r.timestamp,
                type: r.type, status: r.status, data: r.data,
                requesterId: r.requester_id, requesterName: r.requester_name,
                reviewedBy: r.reviewed_by, reviewNote: r.review_note,
                updatedAt: r.updated_at,
            })));
        }).catch(console.error).finally(() => setIsFetching(false));
    }, [employee.id]);

    function generatePDF() {
        setIsExporting(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const margin = 14;
            let y = 0;

            // ── Header ───────────────────────────────────────────────────────
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageW, 30, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(255, 255, 255);
            doc.text('EMPLOYEE BACKGROUND REPORT', margin, 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('Hilot Center — Confidential', margin, 20);
            doc.text(`Generated: ${fmtDate(today)}`, margin, 26);
            doc.text(`Report ID: ${empId.toUpperCase()}`, pageW - margin, 26, { align: 'right' });

            // ── Employee Profile Box ─────────────────────────────────────────
            y = 38;
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(margin, y, pageW - margin * 2, 40, 3, 3, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(15, 23, 42);
            doc.text((employee.name || 'UNNAMED').toUpperCase(), margin + 5, y + 9);

            // Status badge
            if (employee.isActive && !employee.onLeave) doc.setTextColor(16, 185, 129);
            else if (employee.onLeave) doc.setTextColor(139, 92, 246);
            else doc.setTextColor(239, 68, 68);
            doc.text(`● ${statusText}`, pageW - margin - 5, y + 9, { align: 'right' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);

            const col1x = margin + 5;
            const col2x = pageW / 2 + 2;
            const startDisplay = employee.details?.dateStart ? fmtDate(employee.details.dateStart) : fmtDate(employee.timestamp);

            doc.text(`ID: ${empId.toUpperCase()}`, col1x, y + 17);
            doc.text(`Home Branch: ${homeBranch?.name ?? '—'}`, col1x, y + 23);
            doc.text(`Role: ${employee.role || '—'}`, col1x, y + 29);
            doc.text(`Base Allowance: ${peso(employee.allowance)}`, col1x, y + 35);

            doc.text(`Start Date: ${startDisplay}`, col2x, y + 17);
            doc.text(`Tenure: ${tenure}`, col2x, y + 23);
            doc.text(`Contact: ${employee.details?.contactNumber ?? '—'}`, col2x, y + 29);
            doc.text(`Gender: ${employee.details?.gender ?? '—'}`, col2x, y + 35);

            // ── Branch Assignments ───────────────────────────────────────────
            y += 48;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text('BRANCH ASSIGNMENTS', margin, y);
            y += 4;

            autoTable(doc, {
                head: [['Branch', 'Type', 'Role', 'Allowance']],
                body: branchAssignments.map(a => [
                    a.branch.name,
                    a.isHome ? 'Home Branch' : 'Reliever',
                    a.role || employee.role || '—',
                    peso(a.allowance),
                ]),
                startY: y,
                margin: { left: margin, right: margin },
                theme: 'grid',
                styles: { fontSize: 7.5, cellPadding: 2.5 },
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 65 },
                    1: { cellWidth: 35, halign: 'center' },
                    2: { cellWidth: 40, halign: 'center' },
                    3: { halign: 'right' },
                },
                alternateRowStyles: { fillColor: [248, 250, 252] },
            });

            // ── Complaint Record ─────────────────────────────────────────────
            y = (doc as any).lastAutoTable?.finalY + 8;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text('COMPLAINT & DISCIPLINARY RECORD', margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text(`${complaints.length} record${complaints.length !== 1 ? 's' : ''}`, pageW - margin, y, { align: 'right' });
            y += 4;

            if (complaints.length === 0) {
                doc.setFillColor(241, 245, 249);
                doc.roundedRect(margin, y, pageW - margin * 2, 12, 2, 2, 'F');
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text('No complaints or disciplinary records on file.', margin + 5, y + 7.5);
                y += 18;
            } else {
                autoTable(doc, {
                    head: [['Date', 'Branch', 'Type', 'Action Taken', 'Status']],
                    body: complaints.map(c => [
                        fmtDate(c.incidentDate),
                        branches.find(b => b.id === c.branchId)?.name ?? '—',
                        c.reportType || '—',
                        ACTION_LABEL[c.actionTaken] ?? c.actionTaken,
                        c.status,
                    ]),
                    startY: y,
                    margin: { left: margin, right: margin },
                    theme: 'grid',
                    styles: { fontSize: 7.5, cellPadding: 2.5 },
                    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
                    columnStyles: {
                        0: { cellWidth: 26 },
                        1: { cellWidth: 48 },
                        2: { cellWidth: 36 },
                        3: { cellWidth: 40 },
                        4: { halign: 'center' },
                    },
                    alternateRowStyles: { fillColor: [255, 247, 247] },
                    didParseCell: (data) => {
                        if (data.section === 'body' && data.column.index === 3) {
                            const v = String(data.cell.raw);
                            if (v === 'Suspended' || v === 'Final Warning') {
                                data.cell.styles.textColor = [239, 68, 68];
                                data.cell.styles.fontStyle = 'bold';
                            } else if (v !== 'No Action' && v !== 'Noted') {
                                data.cell.styles.textColor = [245, 158, 11];
                            }
                        }
                    },
                });
                y = (doc as any).lastAutoTable?.finalY + 8;
            }

            // ── Leave History ────────────────────────────────────────────────
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text('LEAVE HISTORY', margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text(`${leaveRequests.length} record${leaveRequests.length !== 1 ? 's' : ''}`, pageW - margin, y, { align: 'right' });
            y += 4;

            if (leaveRequests.length === 0) {
                doc.setFillColor(241, 245, 249);
                doc.roundedRect(margin, y, pageW - margin * 2, 12, 2, 2, 'F');
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text('No leave history on file.', margin + 5, y + 7.5);
                y += 18;
            } else {
                autoTable(doc, {
                    head: [['Filed', 'Type', 'Status', 'Reviewed By', 'Review Note']],
                    body: leaveRequests.map(r => [
                        fmtDate(r.timestamp),
                        r.data?.leaveType ?? '—',
                        r.status,
                        r.reviewedBy ?? '—',
                        r.reviewNote ?? '—',
                    ]),
                    startY: y,
                    margin: { left: margin, right: margin },
                    theme: 'grid',
                    styles: { fontSize: 7.5, cellPadding: 2.5 },
                    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
                    columnStyles: {
                        0: { cellWidth: 26 },
                        1: { cellWidth: 30, halign: 'center' },
                        2: { cellWidth: 24, halign: 'center' },
                        3: { cellWidth: 36 },
                        4: { cellWidth: 'auto' as any },
                    },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                });
                y = (doc as any).lastAutoTable?.finalY + 8;
            }

            // ── Change Log ───────────────────────────────────────────────────
            if (auditLogs.length > 0) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(15, 23, 42);
                doc.text('CHANGE LOG (Profile & Allowance Updates)', margin, y);
                y += 4;

                autoTable(doc, {
                    head: [['Date', 'Action', 'Details', 'By']],
                    body: auditLogs.map(a => [
                        fmtDate(a.timestamp),
                        a.activityType,
                        a.description,
                        a.performerName ?? '—',
                    ]),
                    startY: y,
                    margin: { left: margin, right: margin },
                    theme: 'grid',
                    styles: { fontSize: 7, cellPadding: 2 },
                    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
                    columnStyles: {
                        0: { cellWidth: 26 },
                        1: { cellWidth: 20, halign: 'center' },
                        2: { cellWidth: 'auto' as any },
                        3: { cellWidth: 30 },
                    },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                });
            }

            // ── Page footer ──────────────────────────────────────────────────
            const pageCount = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                const footY = doc.internal.pageSize.getHeight() - 6;
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(148, 163, 184);
                doc.text('Hilot Center — Confidential Employee Background Report', margin, footY);
                doc.text(`Page ${i} of ${pageCount}`, pageW - margin, footY, { align: 'right' });
            }

            doc.save(`bg-check-${(employee.name || 'unknown').toLowerCase().replace(/\s+/g, '-')}-${today}.pdf`);
        } finally {
            setIsExporting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90dvh] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-slate-900 px-6 pt-6 pb-5 rounded-t-3xl flex items-start justify-between gap-3 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Background Check Report</p>
                        <h3 className="text-white font-black text-base uppercase tracking-tight leading-none mt-1">{employee.name || 'UNNAMED'}</h3>
                        <p className="text-slate-500 text-[10px] font-mono mt-0.5">{empId.toUpperCase()}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0">
                        <X className="w-4 h-4 text-white" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-slate-100">

                    {/* Profile */}
                    <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Status</p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ${employee.onLeave ? 'bg-purple-50 text-purple-600' : employee.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{statusText}</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Role</p>
                            <p className="text-xs font-black text-slate-800 uppercase">{employee.role || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Start Date</p>
                            <p className="text-xs font-black text-slate-800">
                                {employee.details?.dateStart ? fmtDate(employee.details.dateStart) : fmtDate(employee.timestamp)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Tenure</p>
                            <p className="text-xs font-black text-emerald-700">{tenure}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Home Branch</p>
                            <p className="text-xs font-black text-slate-800 uppercase">{homeBranch?.name ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Base Allowance</p>
                            <p className="text-xs font-black text-slate-800">{peso(employee.allowance)}</p>
                        </div>
                        {employee.details?.contactNumber && (
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Contact</p>
                                <p className="text-xs font-medium text-slate-700">{employee.details.contactNumber}</p>
                            </div>
                        )}
                        {employee.details?.address && (
                            <div className="col-span-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Address</p>
                                <p className="text-xs text-slate-600 leading-snug">{employee.details.address}</p>
                            </div>
                        )}
                    </div>

                    {/* Branch assignments */}
                    <div className="px-6 py-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Branch Assignments & Allowances</p>
                        <div className="space-y-2.5">
                            {branchAssignments.map((a, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.isHome ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                                        <p className="text-xs font-bold text-slate-800 uppercase truncate">{a.branch.name}</p>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0 ${a.isHome ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'}`}>
                                            {a.isHome ? 'Home' : 'Reliever'}
                                        </span>
                                    </div>
                                    <p className="text-xs font-black text-slate-900 tabular-nums shrink-0 ml-3">{peso(a.allowance)}</p>
                                </div>
                            ))}
                            {branchAssignments.length === 0 && (
                                <p className="text-xs text-slate-300 italic">No branch assignments on record.</p>
                            )}
                        </div>
                    </div>

                    {/* Complaints */}
                    <div className="px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Complaints & Disciplinary</p>
                            {isFetching
                                ? <Loader2 className="w-3 h-3 text-slate-300 animate-spin" />
                                : <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ${complaints.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {complaints.length} record{complaints.length !== 1 ? 's' : ''}
                                </span>
                            }
                        </div>
                        {!isFetching && complaints.length === 0 && (
                            <p className="text-xs text-slate-300 italic">No complaints on file.</p>
                        )}
                        {!isFetching && complaints.length > 0 && (
                            <div className="space-y-2.5">
                                {complaints.map(c => {
                                    const branch = branches.find(b => b.id === c.branchId);
                                    return (
                                        <div key={c.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-slate-800 uppercase leading-none truncate">{c.reportType}</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(c.incidentDate)} · {branch?.name ?? '—'}</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest shrink-0 ${ACTION_COLOR[c.actionTaken] ?? 'bg-slate-100 text-slate-400'}`}>
                                                    {ACTION_LABEL[c.actionTaken] ?? c.actionTaken}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-relaxed">{c.description}</p>
                                            {c.resolution && (
                                                <p className="text-[10px] text-slate-400 italic mt-1.5 border-t border-slate-100 pt-1.5">Resolution: {c.resolution}</p>
                                            )}
                                            <p className="text-[9px] text-slate-300 mt-1">Filed by {c.filedByName} · {fmtDate(c.filedAt)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Leave history */}
                    <div className="px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Leave History</p>
                            {isFetching
                                ? <Loader2 className="w-3 h-3 text-slate-300 animate-spin" />
                                : <span className="text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest bg-slate-100 text-slate-400">
                                    {leaveRequests.length} record{leaveRequests.length !== 1 ? 's' : ''}
                                </span>
                            }
                        </div>
                        {!isFetching && leaveRequests.length === 0 && (
                            <p className="text-xs text-slate-300 italic">No leave history.</p>
                        )}
                        {!isFetching && leaveRequests.length > 0 && (
                            <div className="space-y-2">
                                {leaveRequests.map(r => (
                                    <div key={r.id} className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-bold text-slate-700 uppercase">{r.data?.leaveType ?? 'Leave'}</p>
                                            <p className="text-[10px] text-slate-400">{fmtDate(r.timestamp)}{r.reviewedBy ? ` · Reviewed by ${r.reviewedBy}` : ''}</p>
                                        </div>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest shrink-0 ${r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' : r.status === 'REJECTED' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-600'}`}>
                                            {r.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Change log */}
                    {!isFetching && auditLogs.length > 0 && (
                        <div className="px-6 py-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Change Log</p>
                            <div className="space-y-2.5">
                                {auditLogs.map(a => (
                                    <div key={a.id} className="flex items-start gap-3">
                                        <p className="text-[10px] text-slate-300 tabular-nums shrink-0 mt-0.5 w-20">{fmtDate(a.timestamp)}</p>
                                        <p className="text-xs text-slate-600 leading-snug flex-1">{a.description}</p>
                                        {a.performerName && (
                                            <p className="text-[10px] text-slate-300 shrink-0">{a.performerName}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border border-slate-200 text-slate-500 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-all"
                    >
                        Close
                    </button>
                    <button
                        onClick={generatePDF}
                        disabled={isFetching || isExporting}
                        className="flex-1 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                        {isExporting ? 'Generating…' : 'Download PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
};
