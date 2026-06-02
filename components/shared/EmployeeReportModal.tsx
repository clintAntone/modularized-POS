import React, { useState } from 'react';
import { Employee, Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { getTrueDate } from '../../lib/time';

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
}
import { AlertTriangle, Flag } from 'lucide-react';

const REPORT_TYPES = [
  { value: 'TARDINESS',        label: 'Tardiness',         desc: 'Late arrival or frequent delays' },
  { value: 'ABSENCE',          label: 'Unexcused Absence',  desc: 'No-show without prior notice' },
  { value: 'MISCONDUCT',       label: 'Misconduct',         desc: 'Inappropriate behavior or attitude' },
  { value: 'POLICY_VIOLATION', label: 'Policy Violation',   desc: 'Breach of company rules' },
  { value: 'PERFORMANCE',      label: 'Poor Performance',   desc: 'Consistently below expectations' },
  { value: 'OTHER',            label: 'Other',              desc: 'Other concerns not listed above' },
] as const;

type ReportType = typeof REPORT_TYPES[number]['value'];

interface EmployeeReportModalProps {
  employee: Employee;
  branch: Branch;
  filedById: string;
  filedByName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export const EmployeeReportModal: React.FC<EmployeeReportModalProps> = ({
  employee, branch, filedById, filedByName, onClose, onSubmitted,
}) => {
  const [reportType, setReportType] = useState<ReportType | ''>('');
  const [incidentDate, setIncidentDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = reportType !== '' && description.trim().length >= 10 && incidentDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError('');
    try {
      const id = `complaint_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const { error: dbErr } = await supabase.from(DB_TABLES.EMPLOYEE_COMPLAINTS).insert({
        [DB_COLUMNS.ID]: id,
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.EMPLOYEE_ID]: employee.id,
        [DB_COLUMNS.EMPLOYEE_NAME]: employee.name,
        [DB_COLUMNS.REPORT_TYPE]: reportType,
        [DB_COLUMNS.INCIDENT_DATE]: incidentDate,
        [DB_COLUMNS.DESCRIPTION]: description.trim(),
        [DB_COLUMNS.FILED_BY_ID]: filedById,
        [DB_COLUMNS.FILED_BY_NAME]: filedByName,
        [DB_COLUMNS.FILED_AT]: new Date().toISOString(),
        [DB_COLUMNS.STATUS]: 'PENDING',
        [DB_COLUMNS.ACTION_TAKEN]: 'NONE',
      });
      if (dbErr) throw dbErr;
      playSound('success');
      onSubmitted();
    } catch {
      setError('Failed to submit report. Please try again.');
      playSound('warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
            <Flag className="w-5 h-5 text-rose-500" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-none">File Employee Report</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
              {employee.name} · {branch.name.replace(/BRANCH\s*-\s*/i, '')}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Report Type */}
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Report Type</label>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => setReportType(rt.value)}
                  className={`text-left p-3 rounded-2xl border-2 transition-all ${
                    reportType === rt.value
                      ? 'border-rose-500 bg-rose-50'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <p className={`text-[10px] font-black uppercase tracking-tight leading-none ${reportType === rt.value ? 'text-rose-700' : 'text-slate-700'}`}>
                    {rt.label}
                  </p>
                  <p className="text-[8px] font-bold text-slate-400 mt-0.5 leading-tight">{rt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Incident Date */}
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Date of Incident</label>
            <input
              type="date"
              value={incidentDate}
              onChange={e => setIncidentDate(e.target.value)}
              max={todayStr()}
              className="w-full px-4 py-3 bg-slate-50 rounded-2xl font-bold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-rose-400 focus:bg-white transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
              Description <span className="text-slate-300 normal-case font-bold">({description.trim().length}/10 min)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the incident in detail..."
              rows={4}
              className="w-full px-4 py-3 bg-slate-50 rounded-2xl font-semibold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-rose-400 focus:bg-white transition-all resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={2.5} />
              <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="flex-1 h-11 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {saving
                ? <><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Submitting…</>
                : <>
                    <Flag className="w-3 h-3" strokeWidth={3} />
                    Submit Report
                  </>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
