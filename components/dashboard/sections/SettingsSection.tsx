
import React, { useState, useMemo } from 'react';
import { Branch, BranchVault, AuthState, Transaction, Attendance, Employee } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { generateSalt, hashPin } from '../../../lib/crypto';
import { getInitials } from '../../../lib/payroll';
import { useUpdateBranch, useAddAuditLog, useUpdateEmployee } from '../../../hooks/useNetworkData';
import { Clock, User, Shield, Terminal, ChevronRight, Check, AlertTriangle } from 'lucide-react';

interface SettingsSectionProps {
  user: Exclude<AuthState['user'], null>;
  branch: Branch;
  branches: Branch[];
  todayTxs: Transaction[];
  todayAtt: Attendance[];
  todayReportExists: boolean;
  employees: Employee[];
  branchVault?: BranchVault | null;
  onRefresh?: () => void;
}

type SettingsTab = 'operations' | 'access' | 'security';

// ── Shared field/section primitives ─────────────────────────────────────────
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
    {children}
  </label>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{title}</span>
    </div>
    {badge}
  </div>
);

// ── Confirm Modal ────────────────────────────────────────────────────────────
interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
const ConfirmModal: React.FC<ConfirmModalProps> = ({ title, description, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 animate-in zoom-in-95 duration-150 space-y-5">
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${danger ? 'bg-rose-50 border border-rose-100' : 'bg-amber-50 border border-amber-100'}`}>
          <AlertTriangle className={`w-5 h-5 ${danger ? 'text-rose-500' : 'text-amber-500'}`} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{title}</p>
          <p className="text-[10px] text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 h-10 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 h-10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white active:scale-95 transition-all ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-emerald-600'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  user, branch, branches, todayTxs, todayAtt, todayReportExists, employees, branchVault, onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('operations');

  // Operations state
  const [openingTime, setOpeningTime] = useState(branch.openingTime || '09:00');
  const [closingTime, setClosingTime] = useState(branch.closingTime || '22:00');
  const [dailyProvision, setDailyProvision] = useState(String(branch.dailyProvisionAmount ?? ''));
  const [showBranchSettingsConfirm, setShowBranchSettingsConfirm] = useState(false);
  const [isSavingOperational, setIsSavingOperational] = useState(false);



  // Account state
  const [username, setUsername] = useState(user.username || '');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showAccountConfirm, setShowAccountConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Delegation state
  const [isSyncingRelief, setIsSyncingRelief] = useState(false);
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [showReliefSelector, setShowReliefSelector] = useState(false);

  // Feedback
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const updateBranch = useUpdateBranch();
  const updateEmployee = useUpdateEmployee();
  const addAuditLog = useAddAuditLog();

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); }
    else { setError(msg); setSuccess(''); }
  };

  // Branch is closed = times are editable
  const branchIsClosed = !branch.isOpen;
  const hasActivityToday = todayTxs.length > 0 || todayAtt.length > 0 || todayReportExists;

  const availableReliefManagers = useMemo(() => employees.filter(e =>
    e.branchId === branch.id &&
    (e.name || '').toUpperCase() !== (branch.manager || '').toUpperCase() &&
    e.isActive
  ).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [employees, branch.manager, branch.id]);

  // ── Operations save ─────────────────────────────────────────────────────
  const commitBranchSettings = async () => {
    setShowBranchSettingsConfirm(false);
    setIsSavingOperational(true);
    playSound('click');
    try {
      // Save opening/closing time and daily provision to branches table
      const branchUpdates: Record<string, unknown> = {
        [DB_COLUMNS.OPENING_TIME]: openingTime,
        [DB_COLUMNS.CLOSING_TIME]: closingTime,
      };
      const parsedProvision = parseFloat(dailyProvision);
      if (!isNaN(parsedProvision) && parsedProvision >= 0) {
        branchUpdates[DB_COLUMNS.DAILY_PROVISION_AMOUNT] = parsedProvision;
      }
      const { error: branchErr } = await supabase.from(DB_TABLES.BRANCHES).update(branchUpdates).eq(DB_COLUMNS.ID, branch.id);
      if (branchErr) throw branchErr;

      playSound('success');
      showFeedback('Branch settings saved.', 'success');
      onRefresh?.();
    } catch {
      showFeedback('Failed to save branch settings.', 'error');
    } finally {
      setIsSavingOperational(false);
    }
  };

  const handleBranchSettingsSubmit = () => {
    setError('');
    if (!branchIsClosed) {
      showFeedback('Branch must be closed before changing operational settings.', 'error');
      return;
    }
    const provisionNum = parseFloat(dailyProvision);
    if (dailyProvision !== '' && (isNaN(provisionNum) || provisionNum < 0)) {
      showFeedback('Daily provision must be a valid positive number.', 'error');
      return;
    }
    setShowBranchSettingsConfirm(true);
  };


  // ── Account save ─────────────────────────────────────────────────────────
  const handleAccountSubmitValidate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) { showFeedback('Username is required.', 'error'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) { showFeedback('Only letters, numbers, and underscores allowed.', 'error'); return; }
    if (newPin && (newPin.length !== 6 || newPin !== confirmPin)) {
      showFeedback(newPin.length !== 6 ? 'PIN must be exactly 6 digits.' : 'PINs do not match.', 'error');
      return;
    }
    const taken = employees.some(e => e.id !== user.employeeId && e.username?.toLowerCase() === username.trim().toLowerCase());
    if (taken) { showFeedback('Username is already taken.', 'error'); return; }
    setShowAccountConfirm(true);
  };

  const commitAccount = async () => {
    setShowAccountConfirm(false);
    if (isSaving || !user.employeeId) return;
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = { [DB_COLUMNS.USERNAME]: username.trim() };
      if (newPin) {
        const salt = generateSalt();
        const hash = await hashPin(newPin, salt);
        payload[DB_COLUMNS.LOGIN_PIN] = hash;
        payload[DB_COLUMNS.PIN_SALT] = salt;
      }
      const { error: dbErr } = await supabase.from(DB_TABLES.EMPLOYEES).update(payload).eq(DB_COLUMNS.ID, user.employeeId);
      if (dbErr) throw dbErr;
      playSound('success');
      showFeedback('Account updated.', 'success');
      setNewPin('');
      setConfirmPin('');
      onRefresh?.();
    } catch {
      showFeedback('Update failed. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delegation ───────────────────────────────────────────────────────────
  const handleSetRelief = async (name: string) => {
    if (isSyncingRelief) return;
    setIsSyncingRelief(true);
    setGeneratedPin(null);
    playSound('click');
    try {
      const { error } = await supabase.from(DB_TABLES.BRANCHES).update({ [DB_COLUMNS.TEMP_MANAGER]: name || null }).eq(DB_COLUMNS.ID, branch.id);
      if (error) throw error;
      await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.DESCRIPTION]: name ? `Relief access granted to: ${name}` : `Relief access revoked.`,
        [DB_COLUMNS.PERFORMER_NAME]: branch.manager || 'PRIMARY MANAGER'
      });
      if (name) setGeneratedPin(branch.pin);
      else setGeneratedPin(null);
      playSound('success');
      showFeedback(name ? 'Relief protocol established.' : 'Relief access revoked.', 'success');
      setShowReliefSelector(false);
      onRefresh?.();
    } catch {
      showFeedback('Relief sync failed.', 'error');
    } finally {
      setIsSyncingRelief(false);
    }
  };

  const handleResetBranchPin = async () => {
    if (isResettingPin) return;
    setIsResettingPin(true);
    playSound('click');
    try {
      const newPinValue = Math.floor(100000 + Math.random() * 900000).toString();
      await updateBranch.mutateAsync({ id: branch.id, [DB_COLUMNS.PIN]: newPinValue });
      if (branch.tempManager) {
        const delegateEmp = employees.find(e => (e.name || '').toUpperCase().trim() === branch.tempManager?.toUpperCase().trim());
        if (delegateEmp) {
          if (delegateEmp.username) {
            const salt = generateSalt();
            const hash = await hashPin(newPinValue, salt);
            await updateEmployee.mutateAsync({ id: delegateEmp.id, [DB_COLUMNS.LOGIN_PIN]: hash, [DB_COLUMNS.PIN_SALT]: salt });
          } else {
            await updateEmployee.mutateAsync({ id: delegateEmp.id, [DB_COLUMNS.LOGIN_PIN]: null, [DB_COLUMNS.PIN_SALT]: null });
          }
        }
      }
      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.ENTITY_ID]: branch.id,
        [DB_COLUMNS.DESCRIPTION]: `Branch setup PIN reset by manager.`,
        [DB_COLUMNS.PERFORMER_NAME]: branch.manager || 'PRIMARY MANAGER'
      });
      setGeneratedPin(newPinValue);
      playSound('success');
      showFeedback('Setup key regenerated.', 'success');
      onRefresh?.();
    } catch (err: any) {
      showFeedback(`Key reset failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsResettingPin(false);
    }
  };

  // ── Tab config ───────────────────────────────────────────────────────────
  const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'operations', label: 'Operations', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'access',     label: 'My Account', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'security',   label: 'Delegation', icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  const pinStrength = newPin.length === 0 ? null : newPin.length < 4 ? 'weak' : newPin.length < 6 ? 'fair' : 'strong';

  return (
    <div className="max-w-lg mx-auto pb-32 space-y-5 animate-in fade-in duration-500">

      {/* ── Page Header ── */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shrink-0">
          <Terminal className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-900 uppercase tracking-tighter leading-none">Terminal Admin</h2>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">
            {branch.name.replace('BRANCH - ', '')}
          </p>
        </div>
        <div className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${branch.isOpen ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${branch.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          {branch.isOpen ? 'Open' : 'Closed'}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); playSound('click'); setError(''); setSuccess(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow border border-slate-200' : 'text-slate-400 hover:text-slate-700'}`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Feedback ── */}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl animate-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={3} />
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">{success}</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl animate-in slide-in-from-top-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={2.5} />
          <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest leading-relaxed">{error}</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          OPERATIONS TAB
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'operations' && (
        <div className="space-y-4 animate-in fade-in duration-300">

          {/* Branch must be closed notice */}
          {!branchIsClosed && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 px-4 py-3 rounded-2xl">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" strokeWidth={2.5} />
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest leading-relaxed">
                Close the branch before changing operational settings.
              </p>
            </div>
          )}

          {/* Operational Window */}
          <Card>
            <CardHeader
              icon={<Clock className="w-4 h-4" />}
              title="Operational Window"
              badge={
                !branchIsClosed
                  ? <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg">Branch Open — Locked</span>
                  : hasActivityToday
                  ? <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg">Day Active</span>
                  : null
              }
            />
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Opening Time</FieldLabel>
                  <input
                    type="time"
                    disabled={!branchIsClosed}
                    value={openingTime}
                    onChange={e => setOpeningTime(e.target.value)}
                    className={`w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none border-2 transition-all ${!branchIsClosed ? 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed' : 'bg-slate-50 border-transparent focus:border-emerald-500 focus:bg-white text-slate-900'}`}
                  />
                </div>
                <div>
                  <FieldLabel>Closing Time</FieldLabel>
                  <input
                    type="time"
                    disabled={!branchIsClosed}
                    value={closingTime}
                    onChange={e => setClosingTime(e.target.value)}
                    className={`w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none border-2 transition-all ${!branchIsClosed ? 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed' : 'bg-slate-50 border-transparent focus:border-emerald-500 focus:bg-white text-slate-900'}`}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Daily Vault Deposit */}
          <Card>
            <CardHeader icon={<span className="text-xs font-black">₱</span>} title="Daily Vault Deposit" />
            <div className="p-5 space-y-3">
              <FieldLabel>Daily Deposit Amount (PHP)</FieldLabel>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">₱</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!branchIsClosed}
                  value={dailyProvision}
                  onChange={e => setDailyProvision(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-8 pr-4 py-3 rounded-2xl font-bold text-sm outline-none border-2 transition-all ${!branchIsClosed ? 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed' : 'bg-slate-50 border-transparent focus:border-emerald-500 focus:bg-white text-slate-900'}`}
                />
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                Deducted from gross sales daily until the vault target is reached.
              </p>
            </div>
          </Card>

          <button
            onClick={handleBranchSettingsSubmit}
            disabled={isSavingOperational || !branchIsClosed}
            className={`w-full h-12 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-md active:scale-95 transition-all ${!branchIsClosed ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-emerald-600'}`}
          >
            {isSavingOperational ? 'Saving…' : 'Save Branch Settings'}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ACCOUNT TAB
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'access' && (
        <div className="animate-in fade-in duration-300">
          <Card>
            <CardHeader icon={<User className="w-4 h-4" />} title="Account Settings" />

            {/* Identity preview */}
            <div className="px-5 pt-5 pb-3 flex items-center gap-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-lg shadow-md select-none">
                {getInitials(user.username || '?')}
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{user.username || '—'}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{branch.name.replace('BRANCH - ', '')}</p>
              </div>
              <div className="ml-auto">
                <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg uppercase tracking-widest">Active</span>
              </div>
            </div>

            <form onSubmit={handleAccountSubmitValidate} className="p-5 space-y-5">
              {/* Username */}
              <div>
                <FieldLabel>Username</FieldLabel>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="your_username"
                  className="w-full px-4 py-3 bg-slate-50 rounded-2xl font-bold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-emerald-500 focus:bg-white transition-all"
                />
                <p className="mt-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Letters, numbers, underscores only. No spaces.</p>
              </div>

              {/* New PIN */}
              <div>
                <FieldLabel>New 6-Digit PIN <span className="text-slate-300 normal-case font-semibold">(leave blank to keep current)</span></FieldLabel>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full px-4 py-3 bg-slate-50 rounded-2xl font-bold text-xl tracking-[0.5em] text-center text-slate-900 outline-none border-2 border-transparent focus:border-emerald-500 focus:bg-white transition-all"
                />
                {/* Strength bar */}
                {pinStrength && (
                  <div className="mt-2 space-y-1 animate-in fade-in">
                    <div className="flex gap-1">
                      {['weak','fair','strong'].map((level, i) => (
                        <div key={level} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          pinStrength === 'weak'   && i === 0 ? 'bg-rose-400' :
                          pinStrength === 'fair'   && i <= 1 ? 'bg-amber-400' :
                          pinStrength === 'strong' && i <= 2 ? 'bg-emerald-500' : 'bg-slate-100'
                        }`} />
                      ))}
                    </div>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${pinStrength === 'weak' ? 'text-rose-500' : pinStrength === 'fair' ? 'text-amber-500' : 'text-emerald-600'}`}>
                      {pinStrength === 'weak' ? 'Too short' : pinStrength === 'fair' ? 'Almost there' : 'Strong PIN'}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm PIN */}
              {newPin.length === 6 && (
                <div className="animate-in slide-in-from-top-2">
                  <FieldLabel>Confirm New PIN</FieldLabel>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className={`w-full px-4 py-3 rounded-2xl font-bold text-xl tracking-[0.5em] text-center outline-none border-2 transition-all ${
                      confirmPin.length === 6
                        ? confirmPin === newPin
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                          : 'bg-rose-50 border-rose-300 text-rose-700'
                        : 'bg-slate-50 border-transparent text-slate-900 focus:border-emerald-500 focus:bg-white'
                    }`}
                  />
                  {confirmPin.length === 6 && confirmPin !== newPin && (
                    <p className="mt-1.5 text-[8px] font-black text-rose-500 uppercase tracking-widest animate-in fade-in">PINs do not match</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full h-12 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-md hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40"
              >
                {isSaving ? 'Saving…' : 'Update Account'}
              </button>
            </form>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          DELEGATION TAB
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'security' && (
        <div className="animate-in fade-in duration-300 space-y-4">
          <Card>
            <CardHeader
              icon={<Shield className="w-4 h-4" />}
              title="Relief Manager Protocol"
              badge={
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${branch.tempManager ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`} />
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{branch.tempManager ? 'Link Active' : 'No Delegate'}</span>
                </div>
              }
            />

            <div className="p-5 space-y-4">
              {/* Security status pill */}
              <div className="flex justify-center">
                <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${branch.isPinChanged ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                  {branch.isPinChanged ? '🔒 Secured' : '⚠ Setup Mode'}
                </span>
              </div>

              {branch.tempManager ? (
                <div className="space-y-3">
                  {/* Current delegate display */}
                  <div className="flex items-center gap-4 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-base shadow-md">
                      {getInitials(branch.tempManager)}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{branch.tempManager}</p>
                      <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">Authorized Relief</p>
                    </div>
                  </div>

                  {/* Generated PIN display */}
                  {generatedPin && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl animate-in zoom-in space-y-2">
                      <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest text-center">New Setup Key</p>
                      <p className="text-3xl font-black text-amber-700 tracking-[0.35em] tabular-nums text-center">{generatedPin}</p>
                      <p className="text-[7px] font-bold text-amber-500 uppercase tracking-widest text-center leading-relaxed">Share with delegate. They must use this for first login.</p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(generatedPin); playSound('success'); showFeedback('Copied to clipboard', 'success'); }}
                        className="w-full text-[9px] font-bold text-amber-700 uppercase tracking-widest hover:underline"
                      >
                        Copy to Clipboard
                      </button>
                    </div>
                  )}

                  {!generatedPin && (
                    <button
                      onClick={handleResetBranchPin}
                      disabled={isResettingPin}
                      className="w-full h-11 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isResettingPin ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : '🔑'}
                      {isResettingPin ? 'Regenerating…' : 'Reset Delegate Setup Key'}
                    </button>
                  )}

                  <button
                    onClick={() => handleSetRelief('')}
                    disabled={isSyncingRelief}
                    className="w-full h-11 rounded-2xl bg-white border border-rose-200 text-rose-500 font-black text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all active:scale-95 disabled:opacity-40"
                  >
                    {isSyncingRelief ? 'Revoking…' : 'Terminate Relief Access'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-300 flex items-center justify-center text-2xl">∅</div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center leading-relaxed max-w-[200px]">
                    No relief manager designated for this terminal.
                  </p>
                  <button
                    onClick={() => { playSound('click'); setShowReliefSelector(true); }}
                    className="w-full h-11 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-indigo-600 active:scale-95 transition-all"
                  >
                    Designate Relief Personnel
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Relief Selector Sheet ── */}
      {showReliefSelector && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in duration-300">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/60">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Select Delegate</h4>
              <button onClick={() => setShowReliefSelector(false)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" /></svg>
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
              {availableReliefManagers.length > 0 ? availableReliefManagers.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => handleSetRelief(emp.name)}
                  disabled={isSyncingRelief}
                  className="w-full p-4 rounded-2xl border border-slate-100 bg-white hover:border-indigo-400 hover:bg-indigo-50/30 transition-all flex items-center justify-between group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all font-bold italic text-sm">
                      {getInitials(emp.name)}
                    </div>
                    <div className="text-left">
                      <p className="font-black text-slate-900 uppercase text-[11px] truncate">{emp.name}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{emp.role}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-500 transition-all" strokeWidth={3} />
                </button>
              )) : (
                <div className="py-16 text-center opacity-30">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No available staff found</p>
                </div>
              )}
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100">
              <p className="text-[8px] font-bold text-slate-400 uppercase text-center leading-relaxed">
                The selected delegate can access this terminal using their own PIN. All actions are logged.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation Modals ── */}
      {showBranchSettingsConfirm && (
        <ConfirmModal
          title="Save Branch Settings"
          description="This will update the operational window and daily provision amount for this branch. Changes take effect immediately."
          confirmLabel="Save Settings"
          onConfirm={commitBranchSettings}
          onCancel={() => setShowBranchSettingsConfirm(false)}
        />
      )}
      {showAccountConfirm && (
        <ConfirmModal
          title="Update Account"
          description={newPin ? "This will update your username and change your login PIN. You may need to log in again." : "This will update your username."}
          confirmLabel="Update Account"
          onConfirm={commitAccount}
          onCancel={() => setShowAccountConfirm(false)}
        />
      )}
    </div>
  );
};
