import React, { useState, useRef, useEffect } from 'react';
import { Employee, Branch, EmployeeComplaint } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { getTrueDate, getTrueISOString } from '../../lib/time';

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
}
import { AlertTriangle, Flag, ShieldAlert } from 'lucide-react';

const REPORT_TYPES = [
  {
    value: 'TARDINESS',
    label: 'Tardiness',
    desc: 'Late arrivals, missed shifts, or attendance issues',
    color: 'border-amber-400 bg-amber-50',
    activeText: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
  },
  {
    value: 'ABSENCE',
    label: 'Unexcused Absence',
    desc: 'No-show without prior notice or approval',
    color: 'border-orange-400 bg-orange-50',
    activeText: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-700',
  },
  {
    value: 'MISCONDUCT',
    label: 'Misconduct',
    desc: 'Behavioral issues, disrespect, or inappropriate conduct',
    color: 'border-rose-500 bg-rose-50',
    activeText: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-700',
  },
  {
    value: 'POLICY_VIOLATION',
    label: 'Policy Violation',
    desc: 'Breach of branch rules or company policies',
    color: 'border-red-500 bg-red-50',
    activeText: 'text-red-700',
    badge: 'bg-red-100 text-red-700',
  },
  {
    value: 'PERFORMANCE',
    label: 'Poor Performance',
    desc: 'Consistent underperformance or quality issues',
    color: 'border-slate-400 bg-slate-50',
    activeText: 'text-slate-700',
    badge: 'bg-slate-200 text-slate-600',
  },
  {
    value: 'OTHER',
    label: 'Other',
    desc: 'Any other incident not covered above',
    color: 'border-slate-300 bg-slate-50',
    activeText: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-500',
  },
] as const;

type ReportType = typeof REPORT_TYPES[number]['value'];

const DISCIPLINARY_STEPS = [
  { step: 1, label: 'Verbal Warning',  desc: 'Admin will issue a verbal notice on record' },
  { step: 2, label: 'Formal Report',   desc: 'Escalated to a written incident report' },
  { step: 3, label: 'Suspension',      desc: 'Suspension notice for repeated violations' },
];

// ── Inline PIN Gate ──────────────────────────────────────────────
const PinConfirmGate: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  correctPin?: string;
}> = ({ onConfirm, onCancel, correctPin }) => {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputsRef.current[0]?.focus(); }, []);

  const handleDigit = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    setError('');
    if (val && i < 5) inputsRef.current[i + 1]?.focus();
    if (!val && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
    if (e.key === 'Enter') handleSubmit();
  };

  const handleSubmit = () => {
    const entered = digits.join('');
    if (entered.length < 6) { setError('Enter your 6-digit PIN'); return; }
    if (correctPin && entered !== correctPin) {
      setError('Incorrect PIN — report not submitted');
      setShake(true);
      setDigits(Array(6).fill(''));
      setTimeout(() => { setShake(false); inputsRef.current[0]?.focus(); }, 500);
      return;
    }
    onConfirm();
  };

  return (
    <div className="space-y-5 animate-in fade-in-50 slide-in-from-bottom-2 duration-200">
      <div className="h-px bg-slate-100" />
      <div className="text-center space-y-1.5">
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Confirm your identity</p>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Enter your PIN to submit this report</p>
      </div>

      <div
        className={`flex justify-center gap-2 ${shake ? 'animate-[wiggle_0.4s_ease-in-out]' : ''}`}
        style={shake ? { animation: 'wiggle 0.4s ease-in-out' } : {}}
      >
        <style>{`@keyframes wiggle{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}`}</style>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { inputsRef.current[i] = el; }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleDigit(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className={`w-10 h-12 text-center text-lg font-black rounded-xl border-2 outline-none transition-all
              ${d ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-slate-200 bg-slate-50 text-slate-900'}
              focus:border-rose-400 focus:bg-white`}
          />
        ))}
      </div>

      {error && (
        <p className="text-center text-xs font-black text-rose-500 uppercase tracking-widest">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
        >
          Go Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 h-11 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Flag className="w-3 h-3" strokeWidth={3} />
          Confirm &amp; Submit
        </button>
      </div>
    </div>
  );
};

interface EmployeeReportModalProps {
  employee: Employee;
  branch: Branch;
  filedById: string;
  filedByName: string;
  managerPin?: string;
  priorComplaints?: EmployeeComplaint[];
  onClose: () => void;
  onSubmitted: () => void;
}

const WITNESS_TYPES: ReportType[] = ['MISCONDUCT', 'POLICY_VIOLATION', 'OTHER'];

export const EmployeeReportModal: React.FC<EmployeeReportModalProps> = ({
  employee, branch, filedById, filedByName, managerPin, priorComplaints = [], onClose, onSubmitted,
}) => {
  const [reportType, setReportType] = useState<ReportType | ''>('');
  const [incidentDate, setIncidentDate] = useState(todayStr());
  const [incidentTime, setIncidentTime] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [awaitingPin, setAwaitingPin] = useState(false);

  const showWitnesses = WITNESS_TYPES.includes(reportType as ReportType);
  const priorCount = priorComplaints.filter(c => c.status !== 'DISMISSED').length;

  const canSubmit = reportType !== '' && description.trim().length >= 10 && incidentDate;

  const doSubmit = async () => {
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
        [DB_COLUMNS.INCIDENT_TIME]: incidentTime || null,
        [DB_COLUMNS.WITNESSES]: showWitnesses && witnesses.trim() ? witnesses.trim() : null,
        [DB_COLUMNS.DESCRIPTION]: description.trim(),
        [DB_COLUMNS.FILED_BY_ID]: filedById,
        [DB_COLUMNS.FILED_BY_NAME]: filedByName,
        [DB_COLUMNS.FILED_AT]: getTrueISOString(),
        [DB_COLUMNS.STATUS]: 'PENDING',
        [DB_COLUMNS.ACTION_TAKEN]: 'NONE',
      });
      if (dbErr) throw dbErr;

      // Fire HR notification — non-blocking, failure doesn't affect complaint save
      supabase.functions.invoke('notify-hr-complaint', {
        body: {
          employeeName: employee.name,
          branchName: branch.name,
          reportType,
          incidentDate,
          incidentTime: incidentTime || null,
          witnesses: showWitnesses && witnesses.trim() ? witnesses.trim() : null,
          description: description.trim(),
          filedByName,
          filedAt: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
        },
      }).catch(() => { /* silently ignore — complaint is already saved */ });

      playSound('success');
      onSubmitted();
    } catch {
      setError('Failed to submit report. Please try again.');
      setAwaitingPin(false);
      playSound('warning');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setAwaitingPin(true);
  };

  const selectedType = REPORT_TYPES.find(r => r.value === reportType);

  return (
    <div className="fixed inset-0 z-[3000] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
            <Flag className="w-5 h-5 text-rose-500" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">File Employee Report</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
              {employee.name} · {branch.name.replace(/BRANCH\s*-\s*/i, '')}
            </p>
          </div>
          {!awaitingPin && (
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {awaitingPin ? (
          <div className="p-6">
            <PinConfirmGate
              correctPin={managerPin}
              onConfirm={doSubmit}
              onCancel={() => setAwaitingPin(false)}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Report Category */}
            <div>
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">
                Incident Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {REPORT_TYPES.map(rt => (
                  <button
                    key={rt.value}
                    type="button"
                    onClick={() => setReportType(rt.value)}
                    className={`text-left px-3 py-2.5 rounded-2xl border-2 transition-all ${
                      reportType === rt.value ? rt.color : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <p className={`text-xs font-black uppercase tracking-tight leading-none ${
                      reportType === rt.value ? rt.activeText : 'text-slate-700'
                    }`}>
                      {rt.label}
                    </p>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5 leading-tight line-clamp-1">{rt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Prior complaints banner */}
            {priorCount > 0 && (
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-2xl">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={2.5} />
                <p className="text-xs font-black text-amber-700 uppercase tracking-widest">
                  {priorCount} prior active complaint{priorCount !== 1 ? 's' : ''} on record for this employee
                </p>
              </div>
            )}

            {/* Date + Time row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1.5">Date of Incident</label>
                <input
                  type="date"
                  value={incidentDate}
                  onChange={e => setIncidentDate(e.target.value)}
                  max={todayStr()}
                  className="w-full px-3 py-2.5 bg-slate-50 rounded-2xl font-bold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-rose-400 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1.5">Time <span className="text-slate-300 normal-case font-bold">(optional)</span></label>
                <input
                  type="time"
                  value={incidentTime}
                  onChange={e => setIncidentTime(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 rounded-2xl font-bold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-rose-400 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Witnesses — only for misconduct/policy/other */}
            {showWitnesses && (
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Witnesses <span className="text-slate-300 normal-case font-bold">(optional)</span>
                </label>
                <input
                  type="text"
                  value={witnesses}
                  onChange={e => setWitnesses(e.target.value)}
                  placeholder="Names of anyone who witnessed the incident"
                  className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl font-semibold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-rose-400 focus:bg-white transition-all"
                />
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                Description <span className="text-slate-300 normal-case font-bold">({description.trim().length}/10 min)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the incident in detail..."
                rows={3}
                className="w-full px-4 py-3 bg-slate-50 rounded-2xl font-semibold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-rose-400 focus:bg-white transition-all resize-none"
              />
            </div>

            {/* Disciplinary process note */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">After submission</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {DISCIPLINARY_STEPS.map((s, i) => (
                    <React.Fragment key={s.step}>
                      <span className="text-xs font-black text-slate-600 uppercase tracking-tight whitespace-nowrap">{s.label}</span>
                      {i < DISCIPLINARY_STEPS.length - 1 && <span className="text-xs text-slate-300">→</span>}
                    </React.Fragment>
                  ))}
                </div>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">Admin reviews and notifies the employee of action taken.</p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={2.5} />
                <p className="text-xs font-bold text-rose-600 uppercase tracking-widest">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit || saving}
                className="flex-1 h-11 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
              >
                <Flag className="w-3 h-3" strokeWidth={3} />
                Submit Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
