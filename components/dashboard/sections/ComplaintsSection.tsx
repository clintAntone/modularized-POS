import React, { useState, useMemo } from 'react';
import { Branch, Employee, EmployeeComplaint } from '../../../types';
import { getEmployeeRole } from '../../../lib/payroll';
import { playSound } from '../../../lib/audio';
import { ProfileAvatar } from '../../ui/ProfileAvatar';
import { EmployeeReportModal } from '../../shared/EmployeeReportModal';
import { Flag, ChevronDown, X } from 'lucide-react';

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  PENDING:      { pill: 'bg-amber-100 text-amber-700 border-amber-200',      label: 'Pending'      },
  ACKNOWLEDGED: { pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Acknowledged' },
  DISMISSED:    { pill: 'bg-slate-100 text-slate-500 border-slate-200',       label: 'Dismissed'    },
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

  const pendingCount = useMemo(() =>
    complaints.filter(c => c.branchId === branch.id && c.status === 'PENDING').length,
  [complaints, branch.id]);

  const handleSubmitted = () => {
    setReportEmployee(null);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  const sortedStaff = useMemo(() =>
    [...branchStaff].sort((a, b) => {
      const aCount = (complaintsByEmp[a.id] || []).length;
      const bCount = (complaintsByEmp[b.id] || []).length;
      if (bCount !== aCount) return bCount - aCount;
      return a.name.localeCompare(b.name);
    }),
  [branchStaff, complaintsByEmp]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0">
          <Flag className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-black uppercase tracking-tight text-slate-900 leading-none">Complaints</h2>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            {branch.name.replace(/BRANCH\s*-\s*/i, '')} · Employee Incident Reports
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-black text-slate-900 leading-none">{complaints.filter(c => c.branchId === branch.id).length}</p>
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Total</p>
        </div>
      </div>

      {/* Success toast */}
      {submitted && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 animate-in slide-in-from-top-2 duration-300">
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Report submitted — pending admin review</p>
        </div>
      )}

      {/* Per-employee list */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Branch Staff</p>
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{sortedStaff.length} member{sortedStaff.length !== 1 ? 's' : ''}</p>
        </div>

        {sortedStaff.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">No staff assigned</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedStaff.map(emp => {
              const role = getEmployeeRole(emp, branch.id);
              const displayRole = role.split(',').filter(r => r.trim().toUpperCase() !== 'MANAGER').join(', ');
              const empComplaints = complaintsByEmp[emp.id] || [];
              const pendingEmp = empComplaints.filter(c => c.status === 'PENDING').length;
              const isExpanded = expandedEmpId === emp.id;
              const hasReports = empComplaints.length > 0;

              return (
                <div key={emp.id} className={hasReports && pendingEmp > 0 ? 'border-l-2 border-amber-400' : ''}>
                  {/* Employee row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 group transition-colors ${hasReports ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    onClick={() => hasReports && setExpandedEmpId(isExpanded ? null : emp.id)}
                  >
                    <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0">
                      <ProfileAvatar name={emp.name} src={emp.profile} initialsClassName="text-xs" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight truncate leading-tight">{emp.name}</p>
                      {displayRole && (
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5">{displayRole}</p>
                      )}
                    </div>

                    {hasReports ? (
                      <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                        pendingEmp > 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {pendingEmp > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />}
                        <span>{empComplaints.length}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    ) : (
                      <div className="w-6" />
                    )}

                    <button
                      onClick={e => { e.stopPropagation(); playSound('click'); setReportEmployee(emp); }}
                      className="shrink-0 w-8 h-8 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-all flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100"
                      title="File a report"
                    >
                      <Flag className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Expanded complaint history */}
                  {isExpanded && empComplaints.length > 0 && (
                    <div className="border-t border-slate-100 bg-slate-50/50">
                      {empComplaints.map(c => {
                        const isComplaintExpanded = expandedComplaintId === c.id;
                        const statusMeta = STATUS_STYLES[c.status] || STATUS_STYLES.PENDING;
                        const reportColor = REPORT_COLOR[c.reportType] || REPORT_COLOR.OTHER;
                        const filedDate = new Date(c.filedAt).toLocaleDateString('en-PH', {
                          timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
                        });

                        return (
                          <div key={c.id} className="border-b border-slate-100 last:border-b-0">
                            <button
                              className="w-full flex items-center gap-3 px-5 pl-14 py-3 text-left hover:bg-slate-100/60 transition-colors"
                              onClick={() => setExpandedComplaintId(isComplaintExpanded ? null : c.id)}
                            >
                              <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${reportColor}`}>
                                {REPORT_LABEL[c.reportType] || c.reportType || '—'}
                              </span>
                              <span className="flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{filedDate}</span>
                              <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusMeta.pill}`}>
                                {statusMeta.label}
                              </span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform duration-200 ${isComplaintExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {isComplaintExpanded && (
                              <div className="px-5 pl-14 pb-4 pt-1 space-y-2.5">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                  <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Incident Date</p>
                                    <p className="text-[11px] font-bold text-slate-700">{c.incidentDate || '—'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Filed By</p>
                                    <p className="text-[11px] font-bold text-slate-700">{c.filedByName || '—'}</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Description</p>
                                  <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">{c.description || '—'}</p>
                                </div>
                                {(c.judgment || c.resolution || (c.actionTaken && c.actionTaken !== 'NONE')) && (
                                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 space-y-1.5">
                                    {c.actionTaken && c.actionTaken !== 'NONE' && (
                                      <div>
                                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Action Taken</p>
                                        <p className="text-[11px] font-bold text-emerald-800">{ACTION_LABEL[c.actionTaken] || c.actionTaken}</p>
                                      </div>
                                    )}
                                    {c.judgment && (
                                      <div>
                                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Judgment</p>
                                        <p className="text-[11px] font-semibold text-emerald-800 leading-relaxed">{c.judgment}</p>
                                      </div>
                                    )}
                                    {c.resolution && (
                                      <div>
                                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Resolution</p>
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
