import React, { useState, useMemo } from 'react';
import { Branch, Employee, EmployeeComplaint } from '../../../types';
import { getEmployeeRole } from '../../../lib/payroll';
import { playSound } from '../../../lib/audio';
import { ProfileAvatar } from '../../ui/ProfileAvatar';
import { EmployeeReportModal } from '../../shared/EmployeeReportModal';
import { Flag, ChevronDown, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

const STATUS_META: Record<string, { pill: string; icon: React.ReactNode; label: string }> = {
  PENDING:      { pill: 'bg-amber-100 text-amber-700 border-amber-200',      icon: <Clock className="w-3 h-3" />,         label: 'Pending'      },
  ACKNOWLEDGED: { pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" />,  label: 'Acknowledged' },
  DISMISSED:    { pill: 'bg-slate-100 text-slate-500 border-slate-200',       icon: null,                                   label: 'Dismissed'    },
};

const REPORT_LABEL: Record<string, string> = {
  TARDINESS:        'Tardiness',
  ABSENCE:          'Unexcused Absence',
  MISCONDUCT:       'Misconduct',
  POLICY_VIOLATION: 'Policy Violation',
  PERFORMANCE:      'Poor Performance',
  OTHER:            'Other',
};

const REPORT_COLOR: Record<string, string> = {
  TARDINESS:        'bg-amber-50 text-amber-600 border-amber-200',
  ABSENCE:          'bg-orange-50 text-orange-600 border-orange-200',
  MISCONDUCT:       'bg-rose-50 text-rose-600 border-rose-200',
  POLICY_VIOLATION: 'bg-red-50 text-red-600 border-red-200',
  PERFORMANCE:      'bg-slate-50 text-slate-500 border-slate-200',
  OTHER:            'bg-slate-50 text-slate-500 border-slate-200',
};

const ACTION_LABEL: Record<string, string> = {
  NONE:      '',
  SUSPENDED: 'Suspended',
  WARNING:   'Warning Issued',
  NOTED:     'Noted',
};

interface ComplaintsSectionProps {
  branch: Branch;
  employees: Employee[];
  complaints: EmployeeComplaint[];
  filedById: string;
  filedByName: string;
}

export const ComplaintsSection: React.FC<ComplaintsSectionProps> = ({
  branch, employees, complaints, filedById, filedByName,
}) => {
  const [reportEmployee, setReportEmployee] = useState<Employee | null>(null);
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [expandedComplaintId, setExpandedComplaintId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const branchStaff = useMemo(() => {
    return employees.filter(e => {
      if (!e.isActive) return false;
      const isHome = e.branchId === branch.id;
      const isAuthorized = e.branchAllowances && branch.id in (e.branchAllowances as any);
      const isManager = branch.manager?.toUpperCase() === (e.name || '').toUpperCase();
      return (isHome || isAuthorized) && !isManager;
    });
  }, [employees, branch]);

  const complaintsByEmp = useMemo(() => {
    const map: Record<string, EmployeeComplaint[]> = {};
    complaints
      .filter(c => c.branchId === branch.id)
      .sort((a, b) => b.filedAt.localeCompare(a.filedAt))
      .forEach(c => {
        if (!map[c.employeeId]) map[c.employeeId] = [];
        map[c.employeeId].push(c);
      });
    return map;
  }, [complaints, branch.id]);

  const totalComplaints = complaints.filter(c => c.branchId === branch.id).length;
  const activeComplaints = complaints.filter(c => c.branchId === branch.id && c.status !== 'DISMISSED').length;
  const pendingCount = complaints.filter(c => c.branchId === branch.id && c.status === 'PENDING').length;

  const handleSubmitted = () => {
    setReportEmployee(null);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  const sortFn = (a: Employee, b: Employee) => {
    const aCount = (complaintsByEmp[a.id] || []).length;
    const bCount = (complaintsByEmp[b.id] || []).length;
    if (bCount !== aCount) return bCount - aCount;
    return a.name.localeCompare(b.name);
  };

  const regularStaff = useMemo(() =>
    branchStaff.filter(e => e.branchId === branch.id).sort(sortFn),
  [branchStaff, branch.id, complaintsByEmp]);

  const relievers = useMemo(() =>
    branchStaff.filter(e => e.branchId !== branch.id).sort(sortFn),
  [branchStaff, branch.id, complaintsByEmp]);

  const sortedStaff = useMemo(() => [...regularStaff, ...relievers], [regularStaff, relievers]);

  return (
    <div className="space-y-5 pb-4">

      {/* ── Header ── */}
      <div className="bg-slate-900 rounded-[24px] px-5 py-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <Flag className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black uppercase tracking-tight text-white leading-none">Complaints</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
              Employee Incident Reports
            </p>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 px-2.5 py-1.5 rounded-xl shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">{pendingCount} pending</span>
            </div>
          )}
        </div>
        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/5 rounded-2xl px-4 py-3">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">All Complaints</p>
            <p className="text-2xl font-black text-white tabular-nums leading-none">{totalComplaints}</p>
          </div>
          <div className={`rounded-2xl px-4 py-3 ${activeComplaints > 0 ? 'bg-amber-500/15' : 'bg-white/5'}`}>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Active / Open</p>
            <p className={`text-2xl font-black tabular-nums leading-none ${activeComplaints > 0 ? 'text-amber-400' : 'text-white'}`}>{activeComplaints}</p>
          </div>
        </div>
      </div>

      {/* ── Success toast ── */}
      {submitted && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 animate-in slide-in-from-top-2 duration-300">
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Report submitted — pending admin review</p>
        </div>
      )}

      {/* ── Staff list ── */}
      <div className="bg-white border border-slate-100 rounded-[24px] overflow-hidden shadow-sm">
        <div className="px-5 py-4 bg-slate-900 flex items-center justify-between">
          <p className="text-[9px] font-black text-white uppercase tracking-widest">Branch Staff</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{sortedStaff.length} member{sortedStaff.length !== 1 ? 's' : ''}</p>
        </div>

        {sortedStaff.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">No staff assigned</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {[
              { group: regularStaff, label: 'Regular Staff' },
              { group: relievers,    label: 'Relievers'     },
            ].map(({ group, label }) => group.length === 0 ? null : (
              <React.Fragment key={label}>
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label} · {group.length}</p>
                </div>
                {group.map(emp => {
              const role = getEmployeeRole(emp, branch.id);
              const displayRole = role.split(',').filter(r => r.trim().toUpperCase() !== 'MANAGER').join(', ');
              const empComplaints = complaintsByEmp[emp.id] || [];
              const pendingEmp = empComplaints.filter(c => c.status === 'PENDING').length;
              const isExpanded = expandedEmpId === emp.id;
              const hasReports = empComplaints.length > 0;

              return (
                <div key={emp.id} className={pendingEmp > 0 ? 'border-l-[3px] border-amber-400' : ''}>

                  {/* Employee row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${hasReports ? 'cursor-pointer hover:bg-slate-50 active:bg-slate-100' : ''}`}
                    onClick={() => hasReports && setExpandedEmpId(isExpanded ? null : emp.id)}
                  >
                    <div className="relative shrink-0 w-9 h-9">
                      <div className="w-9 h-9 rounded-2xl overflow-hidden bg-slate-100">
                        <ProfileAvatar name={emp.name} src={emp.profile} initialsClassName="text-xs text-slate-500" />
                      </div>
                      {(() => {
                        const activeCount = empComplaints.filter(c => c.status !== 'DISMISSED').length;
                        return activeCount > 0 ? (
                          <div className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[8px] font-black leading-none ${
                            pendingEmp > 0 ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'
                          }`}>
                            {activeCount}
                          </div>
                        ) : null;
                      })()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight truncate leading-tight">{emp.name}</p>
                      {displayRole && (
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5">{displayRole}</p>
                      )}
                    </div>

                    {hasReports && (
                      <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    )}

                    <button
                      onClick={e => { e.stopPropagation(); playSound('click'); setReportEmployee(emp); }}
                      className="shrink-0 w-8 h-8 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600 active:scale-95 transition-all flex items-center justify-center"
                      title="File a report"
                    >
                      <Flag className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Expanded complaint history */}
                  {isExpanded && empComplaints.length > 0 && (
                    <div className="px-3 pb-3 space-y-2 bg-slate-50/60 border-t border-slate-100">
                      {empComplaints.map(c => {
                        const isComplaintExpanded = expandedComplaintId === c.id;
                        const statusMeta = STATUS_META[c.status] || STATUS_META.PENDING;
                        const reportColor = REPORT_COLOR[c.reportType] || REPORT_COLOR.OTHER;
                        const filedDate = new Date(c.filedAt).toLocaleDateString('en-PH', {
                          timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
                        });

                        return (
                          <div
                            key={c.id}
                            className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm mt-2"
                          >
                            {/* Complaint summary row */}
                            <button
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                              onClick={() => setExpandedComplaintId(isComplaintExpanded ? null : c.id)}
                            >
                              <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${reportColor}`}>
                                {REPORT_LABEL[c.reportType] || c.reportType || '—'}
                              </span>
                              <span className="flex-1 text-[10px] font-bold text-slate-400 tabular-nums">{filedDate}</span>
                              <span className={`shrink-0 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusMeta.pill}`}>
                                {statusMeta.icon}
                                {statusMeta.label}
                              </span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform duration-200 ${isComplaintExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Expanded detail */}
                            {isComplaintExpanded && (
                              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Incident Date</p>
                                    <p className="text-[11px] font-bold text-slate-700">{c.incidentDate || '—'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Filed By</p>
                                    <p className="text-[11px] font-bold text-slate-700">{c.filedByName || '—'}</p>
                                  </div>
                                </div>
                                {c.description && (
                                  <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</p>
                                    <p className="text-[11px] font-semibold text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3 py-2.5">{c.description}</p>
                                  </div>
                                )}
                                {(c.judgment || c.resolution || (c.actionTaken && c.actionTaken !== 'NONE')) && (
                                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-3 py-3 space-y-2">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                      <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Admin Resolution</p>
                                    </div>
                                    {c.actionTaken && c.actionTaken !== 'NONE' && (
                                      <div>
                                        <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Action Taken</p>
                                        <p className="text-[11px] font-bold text-emerald-800">{ACTION_LABEL[c.actionTaken] || c.actionTaken}</p>
                                      </div>
                                    )}
                                    {c.judgment && (
                                      <div>
                                        <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Judgment</p>
                                        <p className="text-[11px] font-semibold text-emerald-800 leading-relaxed">{c.judgment}</p>
                                      </div>
                                    )}
                                    {c.resolution && (
                                      <div>
                                        <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Resolution</p>
                                        <p className="text-[11px] font-semibold text-emerald-800 leading-relaxed">{c.resolution}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {reportEmployee && (
        <EmployeeReportModal
          employee={reportEmployee}
          branch={branch}
          filedById={filedById}
          filedByName={filedByName}
          onClose={() => setReportEmployee(null)}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
};
