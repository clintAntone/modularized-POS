
import React, { useState, useMemo } from 'react';
import { Branch, BranchVault, AuthState, Transaction, Attendance, Employee } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { generateSalt, hashPin } from '../../../lib/crypto';
import { getInitials } from '../../../lib/payroll';
import { useUpdateBranch, useAddAuditLog, useUpdateEmployee } from '../../../hooks/useNetworkData';
import { invalidateBranchSessions, logAudit } from '../../../lib/audit';
import { Clock, User, Shield, Terminal, ChevronRight, Check, AlertTriangle, Sun, Moon, Building2 } from 'lucide-react';
import { useTheme } from '../../../hooks/useTheme';
import { getTrueISOString } from '../../../lib/time';

interface SettingsSectionProps {
  user: Exclude<AuthState['user'], null>;
  branch: Branch;
  branches: Branch[];
  todayTxs: Transaction[];
  todayAtt: Attendance[];
  todayReportExists: boolean;
  employees: Employee[];
  branchVault?: BranchVault | null;
  isRelief?: boolean;
  onRefresh?: () => void;
}

type SettingsTab = 'operations' | 'access' | 'security';

// ── Shared field/section primitives ─────────────────────────────────────────
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
    {children}
  </label>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ icon, title, badge, accent = 'emerald' }: { icon: React.ReactNode; title: string; badge?: React.ReactNode; accent?: 'emerald' | 'indigo' | 'violet' | 'amber' }) => {
  const accentClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    indigo:  'bg-indigo-50 text-indigo-600 border border-indigo-100',
    violet:  'bg-violet-50 text-violet-600 border border-violet-100',
    amber:   'bg-amber-50 text-amber-600 border border-amber-100',
  };
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/40">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${accentClasses[accent]}`}>
          {icon}
        </div>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">{title}</span>
      </div>
      {badge}
    </div>
  );
};

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
    <div className="relative bg-white rounded-3xl shadow-xl border border-slate-100 w-full max-w-sm p-6 animate-in zoom-in-95 duration-150 space-y-5">
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${danger ? 'bg-rose-50 border border-rose-100' : 'bg-amber-50 border border-amber-100'}`}>
          <AlertTriangle className={`w-5 h-5 ${danger ? 'text-rose-500' : 'text-amber-500'}`} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{title}</p>
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 h-10 rounded-2xl border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 h-10 rounded-2xl text-xs font-semibold uppercase tracking-wide text-white active:scale-95 transition-all ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-emerald-600'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  user, branch, branches, todayTxs, todayAtt, todayReportExists, employees, branchVault, isRelief, onRefresh
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>(isRelief ? 'access' : 'operations');

  // Operations state
  const [openingTime, setOpeningTime] = useState(branch.openingTime || '09:00');
  const [closingTime, setClosingTime] = useState(branch.closingTime || '22:00');
  const [dailyProvision, setDailyProvision] = useState(String(branch.dailyProvisionAmount ?? ''));
  const [showBranchSettingsConfirm, setShowBranchSettingsConfirm] = useState(false);
  const [isSavingOperational, setIsSavingOperational] = useState(false);
  const [isSavingFaceId, setIsSavingFaceId] = useState(false);
  const [localFaceIdEnabled, setLocalFaceIdEnabled] = useState(branch.faceIdEnabled !== false);
  const [showFaceIdDisableModal, setShowFaceIdDisableModal] = useState(false);
  const [faceIdDisableReason, setFaceIdDisableReason] = useState('');



  // Account state — each section edits independently
  const [editingSection, setEditingSection] = useState<'username' | 'gmail' | 'pin' | 'details' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Username edit
  const [username, setUsername] = useState(user.username || '');

  // Gmail edit
  const [gmailInput, setGmailInput] = useState('');

  // PIN edit
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // OTP state (for PIN change verification)
  const [otpStep, setOtpStep] = useState<'idle' | 'sending' | 'awaiting' | 'verified'>('idle');
  const [otpValue, setOtpValue] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpMaskedEmail, setOtpMaskedEmail] = useState('');

  // Shared confirm modal (username only)
  const [showAccountConfirm, setShowAccountConfirm] = useState(false);

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

  const currentEmployee = useMemo(() =>
    user.employeeId ? employees.find(e => e.id === user.employeeId) ?? null : null
  , [user.employeeId, employees]);

  const employeeGmail = currentEmployee?.details?.gmail ?? '';

  // Sync gmailInput from loaded employee data (runs once when employee data arrives)
  React.useEffect(() => {
    if (employeeGmail && !gmailInput) setGmailInput(employeeGmail);
  }, [employeeGmail]);

  const handleRequestOtp = async () => {
    if (!user.username || otpLoading) return;
    setOtpStep('sending');
    setOtpLoading(true);
    setOtpError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('reset-pin-with-otp', {
        body: { action: 'request', username: user.username },
      });
      if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message);
      setOtpMaskedEmail(data.maskedEmail);
      setOtpStep('awaiting');
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : 'Failed to send OTP');
      setOtpStep('idle');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpValue.length !== 6 || otpLoading) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('reset-pin-with-otp', {
        body: { action: 'verify', username: user.username, otp: otpValue },
      });
      if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message);
      setOtpStep('verified');
      setOtpError('');
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : 'Invalid OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  // Branch is closed = times are editable
  const branchIsClosed = !branch.isOpen;
  const hasActivityToday = todayTxs.length > 0 || todayAtt.length > 0 || todayReportExists;

  const availableReliefManagers = useMemo(() => employees.filter(e =>
    e.branchId === branch.id &&
    (e.name || '').toUpperCase() !== (branch.manager || '').toUpperCase() &&
    e.isActive
  ).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [employees, branch.manager, branch.id]);

  // ── Face ID toggle ──────────────────────────────────────────────────────
  const handleToggleFaceId = () => {
    if (localFaceIdEnabled) {
      // Disabling — require justification first
      setFaceIdDisableReason('');
      setShowFaceIdDisableModal(true);
    } else {
      // Re-enabling — no justification needed
      void applyFaceIdToggle(true, '');
    }
  };

  const confirmDisableFaceId = () => {
    const trimmed = faceIdDisableReason.trim();
    if (trimmed.length < 10) return; // enforce min length in UI
    setShowFaceIdDisableModal(false);
    void applyFaceIdToggle(false, trimmed);
  };

  const applyFaceIdToggle = async (nextEnabled: boolean, reason: string) => {
    setLocalFaceIdEnabled(nextEnabled); // optimistic
    setIsSavingFaceId(true);
    try {
      const { data } = await supabase.from(DB_TABLES.SYSTEM_CONFIG)
        .select(DB_COLUMNS.VALUE).eq(DB_COLUMNS.KEY, 'face_id_disabled_branches').maybeSingle();
      const current: string[] = data?.[DB_COLUMNS.VALUE] ? JSON.parse(data[DB_COLUMNS.VALUE]) : [];
      const next = nextEnabled
        ? current.filter((id: string) => id !== branch.id)
        : [...current.filter((id: string) => id !== branch.id), branch.id];
      await supabase.from(DB_TABLES.SYSTEM_CONFIG)
        .upsert({ [DB_COLUMNS.KEY]: 'face_id_disabled_branches', [DB_COLUMNS.VALUE]: JSON.stringify(next) }, { onConflict: DB_COLUMNS.KEY });
      if (!nextEnabled && reason) {
        await logAudit({
          branchId: branch.id,
          activityType: 'FACE_ID_DISABLED',
          entityType: 'branch',
          entityId: branch.id,
          description: `Face ID disabled for ${branch.name}. Reason: ${reason}`,
          performerName: user.username || user.name || 'Manager',
        });
      }
      playSound('success');
      onRefresh?.();
    } catch {
      setLocalFaceIdEnabled(!nextEnabled); // revert on failure
      playSound('warning');
    }
    finally { setIsSavingFaceId(false); }
  };

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


  // ── Username save ────────────────────────────────────────────────────────
  const handleSaveUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { showFeedback('Username is required.', 'error'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) { showFeedback('Only letters, numbers, and underscores allowed.', 'error'); return; }
    const taken = employees.some(e => e.id !== user.employeeId && e.username?.toLowerCase() === username.trim().toLowerCase());
    if (taken) { showFeedback('Username is already taken.', 'error'); return; }
    setShowAccountConfirm(true);
  };

  const commitUsername = async () => {
    setShowAccountConfirm(false);
    if (isSaving || !user.employeeId) return;
    setIsSaving(true);
    try {
      const { error: dbErr } = await supabase.from(DB_TABLES.EMPLOYEES).update({ [DB_COLUMNS.USERNAME]: username.trim() }).eq(DB_COLUMNS.ID, user.employeeId);
      if (dbErr) throw dbErr;
      playSound('success');
      showFeedback('Username updated.', 'success');
      setEditingSection(null);
      onRefresh?.();
    } catch {
      showFeedback('Update failed.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Gmail save ───────────────────────────────────────────────────────────
  const handleSaveGmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = gmailInput.trim().toLowerCase();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { showFeedback('Invalid email address.', 'error'); return; }
    if (isSaving || !user.employeeId) return;
    setIsSaving(true);
    try {
      const { error: dbErr } = await supabase.from(DB_TABLES.EMPLOYEES)
        .update({ [DB_COLUMNS.DETAILS]: { ...(currentEmployee?.details || {}), gmail: trimmed || undefined } })
        .eq(DB_COLUMNS.ID, user.employeeId);
      if (dbErr) throw dbErr;
      playSound('success');
      showFeedback('Email updated.', 'success');
      setEditingSection(null);
      onRefresh?.();
    } catch {
      showFeedback('Update failed.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── PIN save ─────────────────────────────────────────────────────────────
  // Flow: if Gmail → OTP first → then show PIN fields → save
  //       if no Gmail → PIN fields → save directly
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 6 || newPin !== confirmPin) return;
    if (isSaving || !user.employeeId) return;
    setIsSaving(true);
    try {
      const salt = generateSalt();
      const hash = await hashPin(newPin, salt);
      const { error: dbErr } = await supabase.from(DB_TABLES.EMPLOYEES)
        .update({ [DB_COLUMNS.LOGIN_PIN]: hash, [DB_COLUMNS.PIN_SALT]: salt })
        .eq(DB_COLUMNS.ID, user.employeeId);
      if (dbErr) throw dbErr;
      // Force-logout anyone still using the old PIN for this branch
      await invalidateBranchSessions([branch.id]);
      playSound('success');
      showFeedback('PIN updated successfully.', 'success');
      setNewPin(''); setConfirmPin(''); setOtpStep('idle'); setOtpValue('');
      setEditingSection(null);
      onRefresh?.();
    } catch {
      showFeedback('Update failed.', 'error');
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
        [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
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
        [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.ENTITY_ID]: branch.id,
        [DB_COLUMNS.DESCRIPTION]: `Branch setup PIN reset by manager.`,
        [DB_COLUMNS.PERFORMER_NAME]: branch.manager || 'PRIMARY MANAGER'
      });
      // Force-logout anyone using the old branch PIN
      await invalidateBranchSessions([branch.id]);
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
  const ALL_TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'operations', label: 'Operations', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'access',     label: 'My Account', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'security',   label: 'Delegation', icon: <Shield className="w-3.5 h-3.5" /> },
  ];
  // Delegates only see their own account settings
  const TABS = isRelief ? ALL_TABS.filter(t => t.id === 'access') : ALL_TABS;

  const pinStrength = newPin.length === 0 ? null : newPin.length < 4 ? 'weak' : newPin.length < 6 ? 'fair' : 'strong';

  return (
    <div className="max-w-2xl mx-auto pb-32 space-y-5">

      {/* ── Page Header — Identity Card ── */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 shadow-lg px-5 py-5">
        {/* subtle texture ring */}
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -right-2 w-24 h-24 rounded-full bg-white/[0.03]" />
        <div className="relative flex items-center gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl shrink-0 overflow-hidden border-2 border-white/20 shadow-md bg-slate-700">
            {currentEmployee?.profile
              ? <img src={currentEmployee.profile} alt="profile" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center font-black text-xl text-white select-none">
                  {getInitials(currentEmployee?.name || user.username || '?')}
                </div>
            }
          </div>
          {/* Identity info */}
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-white leading-tight truncate">
              {currentEmployee?.name || user.username || '—'}
            </p>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5 truncate">
              {isRelief ? 'Relief Manager' : (currentEmployee?.role || 'Branch Manager').replace(/_/g, ' ')}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
              <p className="text-xs font-medium text-slate-400 truncate">
                {branch.name.replace(/BRANCH\s*-\s*/i, '')}
              </p>
            </div>
          </div>
          {/* Settings icon badge */}
          <div className="w-9 h-9 rounded-xl bg-white/10 text-white/60 flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); playSound('click'); setError(''); setSuccess(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow border border-slate-200 dark:border-slate-600' : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Feedback ── */}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl animate-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={3} />
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">{success}</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl animate-in slide-in-from-top-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={2.5} />
          <p className="text-xs font-bold text-rose-600 uppercase tracking-widest leading-relaxed">{error}</p>
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
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest leading-relaxed">
                Close the branch before changing operational settings.
              </p>
            </div>
          )}

          {/* Operational Window */}
          <Card>
            <CardHeader
              icon={<Clock className="w-4 h-4" />}
              title="Operational Window"
              accent="emerald"
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
                    className={`w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none border-2 transition-all ${!branchIsClosed ? 'bg-slate-50 dark:bg-slate-700 text-slate-300 dark:text-slate-500 border-transparent cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-700 border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-600 text-slate-900 dark:text-white'}`}
                  />
                </div>
                <div>
                  <FieldLabel>Closing Time</FieldLabel>
                  <input
                    type="time"
                    disabled={!branchIsClosed}
                    value={closingTime}
                    onChange={e => setClosingTime(e.target.value)}
                    className={`w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none border-2 transition-all ${!branchIsClosed ? 'bg-slate-50 dark:bg-slate-700 text-slate-300 dark:text-slate-500 border-transparent cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-700 border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-600 text-slate-900 dark:text-white'}`}
                  />
                </div>
              </div>
            </div>
          </Card>


          {/* Face Recognition */}
          <Card>
            <CardHeader
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>}
              title="Face Recognition"
              accent="violet"
            />
            <div className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Clock-in via Face ID</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {localFaceIdEnabled
                      ? 'Employees must scan their face to clock in'
                      : 'Face recognition is disabled — manual clock-in only'}
                  </p>
                </div>
                <button
                  disabled
                  title="Face ID settings are managed by the administrator"
                  className={`relative rounded-full transition-all duration-300 opacity-40 cursor-not-allowed shrink-0 ${localFaceIdEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-200'}`}
                  style={{ height: '24px', width: '44px' }}
                >
                  <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-300 ${localFaceIdEnabled ? 'left-[23px]' : 'left-[3px]'}`} />
                </button>
              </div>
            </div>
          </Card>

          <button
            onClick={handleBranchSettingsSubmit}
            disabled={isSavingOperational || !branchIsClosed}
            className={`w-full h-12 rounded-2xl font-black text-xs uppercase tracking-widest shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${
              !branchIsClosed
                ? 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 shadow-lg'
            }`}
          >
            {isSavingOperational
              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
              : <><Check className="w-4 h-4" strokeWidth={3} />Save Branch Settings</>
            }
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ACCOUNT TAB
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'access' && (
        <div className="animate-in fade-in duration-300 space-y-3">

          {/* ── Profile banner ─────────────────────────────────────────── */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            {/* Top row */}
            <div className="p-5 flex items-center gap-4">
              {/* Avatar — profile photo or initials */}
              <div className="w-16 h-16 rounded-2xl shrink-0 overflow-hidden bg-slate-100 shadow-sm">
                {currentEmployee?.profile
                  ? <img src={currentEmployee.profile} alt="profile" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center font-black text-2xl text-slate-600 select-none">
                      {getInitials(currentEmployee?.name || user.username || '?')}
                    </div>
                }
              </div>
              {/* Name + branch */}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-slate-900 tracking-tight leading-none truncate">
                  {currentEmployee?.name || user.username || '—'}
                </p>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1 truncate">
                  {branch.name.replace(/BRANCH\s*-\s*/i, '')}
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">Active</span>
            </div>
            {/* Stats strip */}
            <div className="grid grid-cols-3 border-t border-slate-100">
              <div className="px-4 py-3 text-center border-r border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                  {(currentEmployee?.role || 'MANAGER').replace(/_/g, ' ')}
                </p>
              </div>
              <div className="px-4 py-3 text-center border-r border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Username</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">{user.username || '—'}</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recovery</p>
                <p className={`text-xs font-semibold mt-0.5 ${employeeGmail ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {employeeGmail ? 'Set' : 'Not set'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Username row ───────────────────────────────────────────── */}
          <Card>
            {editingSection !== 'username' ? (
              <button
                type="button"
                onClick={() => { setEditingSection('username'); setUsername(user.username || ''); }}
                className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors rounded-3xl"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Username</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{user.username || '—'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            ) : (
              <form onSubmit={handleSaveUsername} className="p-5 space-y-4 animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Change Username</p>
                  <button type="button" onClick={() => setEditingSection(null)} className="text-xs font-medium text-slate-400 uppercase tracking-wide">Cancel</button>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  placeholder="your_username"
                  className="w-full px-4 py-3 bg-slate-50 rounded-2xl font-bold text-sm text-slate-900 outline-none border-2 border-transparent focus:border-emerald-500 focus:bg-white transition-all"
                />
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Letters, numbers, underscores only.</p>
                <button type="submit" disabled={isSaving} className="w-full h-11 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
                  {isSaving ? 'Saving…' : 'Save Username'}
                </button>
              </form>
            )}
          </Card>

          {/* ── Gmail row ──────────────────────────────────────────────── */}
          <Card>
            {editingSection !== 'gmail' ? (
              <button
                type="button"
                onClick={() => { setEditingSection('gmail'); setGmailInput(employeeGmail); }}
                className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors rounded-3xl"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Recovery Email</p>
                  {employeeGmail
                    ? <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{employeeGmail}</p>
                    : <p className="text-sm font-bold text-rose-400 mt-0.5">Not set</p>
                  }
                </div>
                {employeeGmail
                  ? <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg uppercase tracking-widest shrink-0">Set</span>
                  : <ChevronRight className="w-4 h-4 text-slate-300" />
                }
              </button>
            ) : (
              <form onSubmit={handleSaveGmail} className="p-5 space-y-4 animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recovery Email</p>
                  <button type="button" onClick={() => setEditingSection(null)} className="text-xs font-medium text-slate-400 uppercase tracking-wide">Cancel</button>
                </div>
                <input
                  type="email"
                  value={gmailInput}
                  onChange={e => setGmailInput(e.target.value)}
                  autoFocus
                  placeholder="yourname@gmail.com"
                  className={`w-full px-4 py-3 rounded-2xl font-bold text-sm text-slate-900 outline-none border-2 transition-all ${
                    gmailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmailInput.trim())
                      ? 'bg-rose-50 border-rose-300'
                      : gmailInput ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-transparent focus:border-emerald-500 focus:bg-white'
                  }`}
                />
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Used for PIN self-recovery via OTP</p>
                <button type="submit" disabled={isSaving} className="w-full h-11 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
                  {isSaving ? 'Saving…' : 'Save Email'}
                </button>
              </form>
            )}
          </Card>

          {/* ── PIN row ────────────────────────────────────────────────── */}
          <Card>
            {editingSection !== 'pin' ? (
              <button
                type="button"
                onClick={() => { setEditingSection('pin'); setNewPin(''); setConfirmPin(''); setOtpStep('idle'); setOtpValue(''); }}
                className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors rounded-3xl"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Security PIN</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">••••••</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            ) : (
              <div className="p-5 space-y-4 animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Change PIN</p>
                  <button type="button" onClick={() => { setEditingSection(null); setNewPin(''); setConfirmPin(''); setOtpStep('idle'); setOtpValue(''); }} className="text-xs font-medium text-slate-400 uppercase tracking-wide">Cancel</button>
                </div>

                {/* Step 1 — Verify identity via OTP (only if Gmail on file) */}
                {employeeGmail && otpStep !== 'verified' && (
                  <div className="space-y-3">
                    {/* Step indicator */}
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">1</div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Verify your identity</p>
                    </div>

                    {otpStep === 'idle' && (
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                        <svg className="w-8 h-8 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700">We'll send a code to</p>
                          <p className="text-xs font-black text-slate-900 truncate">{employeeGmail.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, '*') + c)}</p>
                        </div>
                      </div>
                    )}

                    {(otpStep === 'sending' || otpStep === 'awaiting') && (
                      <div className="space-y-3 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-600">Code sent to {otpMaskedEmail}</p>
                          <button type="button" onClick={() => { setOtpStep('idle'); setOtpValue(''); setOtpError(''); }} className="text-xs font-medium text-slate-400 uppercase tracking-wide">Resend</button>
                        </div>
                        <input
                          type="text"
                          value={otpValue}
                          onChange={e => { setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
                          placeholder="_ _ _ _ _ _"
                          maxLength={6}
                          inputMode="numeric"
                          autoFocus
                          className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl font-semibold text-2xl tracking-[0.5em] text-center outline-none focus:border-emerald-500 focus:bg-white transition-all tabular-nums"
                        />
                        {otpError && <p className="text-xs font-black text-rose-600 uppercase tracking-widest text-center">{otpError}</p>}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={otpStep === 'idle' ? handleRequestOtp : handleVerifyOtp}
                      disabled={otpLoading || (otpStep === 'awaiting' && otpValue.length !== 6)}
                      className="w-full h-11 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {otpLoading
                        ? <><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Sending…</>
                        : otpStep === 'idle' ? 'Send Verification Code' : 'Verify Code'}
                    </button>
                  </div>
                )}

                {/* Step 2 — Set new PIN (shown after OTP verified, or immediately if no Gmail) */}
                {(!employeeGmail || otpStep === 'verified') && (
                  <form onSubmit={handlePinSubmit} className="space-y-4 animate-in slide-in-from-bottom-2">
                    {employeeGmail && (
                      <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                        <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                        </div>
                        <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Identity verified — set your new PIN</p>
                      </div>
                    )}

                    {employeeGmail && (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">2</div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Set your new PIN</p>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <FieldLabel>New 6-Digit PIN</FieldLabel>
                        <button type="button" onClick={() => setShowPin(v => !v)} className="text-xs font-medium text-slate-400 uppercase tracking-wide">{showPin ? 'Hide' : 'Show'}</button>
                      </div>
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                        autoFocus
                        placeholder="••••••"
                        className="w-full px-4 py-4 bg-slate-50 rounded-2xl font-bold text-2xl tracking-[0.5em] text-center outline-none border-2 border-transparent focus:border-emerald-500 focus:bg-white transition-all"
                      />
                      {pinStrength && (
                        <div className="mt-2 flex gap-1">
                          {['weak','fair','strong'].map((level, i) => (
                            <div key={level} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              pinStrength === 'weak' && i === 0 ? 'bg-rose-400' :
                              pinStrength === 'fair' && i <= 1 ? 'bg-amber-400' :
                              pinStrength === 'strong' && i <= 2 ? 'bg-emerald-500' : 'bg-slate-100'
                            }`} />
                          ))}
                        </div>
                      )}
                    </div>

                    {newPin.length === 6 && (
                      <div className="animate-in slide-in-from-top-2">
                        <FieldLabel>Confirm New PIN</FieldLabel>
                        <input
                          type={showPin ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={6}
                          value={confirmPin}
                          onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                          placeholder="••••••"
                          className={`w-full px-4 py-4 rounded-2xl font-bold text-2xl tracking-[0.5em] text-center outline-none border-2 transition-all ${
                            confirmPin.length === 6
                              ? confirmPin === newPin ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-rose-50 border-rose-300 text-rose-700'
                              : 'bg-slate-50 border-transparent text-slate-900 focus:border-emerald-500 focus:bg-white'
                          }`}
                        />
                        {confirmPin.length === 6 && confirmPin !== newPin && (
                          <p className="mt-1.5 text-xs font-black text-rose-500 uppercase tracking-widest">PINs do not match</p>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSaving || newPin.length !== 6 || confirmPin !== newPin}
                      className="w-full h-11 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {isSaving ? <><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />Saving…</> : 'Save New PIN'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </Card>

          {/* ── Personal Details row ───────────────────────────────────── */}
          {currentEmployee && (
            <Card>
              <button
                type="button"
                onClick={() => setEditingSection(editingSection === 'details' ? null : 'details')}
                className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors rounded-3xl"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Personal Details</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{currentEmployee.name || '—'}</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${editingSection === 'details' ? 'rotate-90' : ''}`} />
              </button>

              {editingSection === 'details' && (
                <div className="px-5 pb-5 space-y-4 animate-in slide-in-from-top-2 border-t border-slate-100 pt-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Full Name', value: currentEmployee.name },
                      { label: 'Date Started', value: currentEmployee.details?.dateStart },
                      { label: 'Date of Birth', value: currentEmployee.details?.dateOfBirth },
                      { label: 'Gender', value: currentEmployee.details?.gender },
                      { label: 'Marital Status', value: currentEmployee.details?.maritalStatus },
                      { label: 'Contact Number', value: currentEmployee.details?.contactNumber },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 rounded-2xl p-3">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                        <p className="text-xs font-bold text-slate-900 truncate">{value || <span className="text-slate-300">—</span>}</p>
                      </div>
                    ))}
                  </div>

                  {/* Address */}
                  {currentEmployee.details?.address && (
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Address</p>
                      <p className="text-xs font-bold text-slate-900">{currentEmployee.details.address}</p>
                    </div>
                  )}

                  {/* Emergency Contact */}
                  {currentEmployee.details?.emergencyContactName && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Emergency Contact</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Name', value: currentEmployee.details.emergencyContactName },
                          { label: 'Relationship', value: currentEmployee.details.emergencyContactRelationship },
                          { label: 'Number', value: currentEmployee.details.emergencyContactNumber },
                          { label: 'Address', value: currentEmployee.details.emergencyContactAddress },
                        ].filter(f => f.value).map(({ label, value }) => (
                          <div key={label} className="bg-slate-50 rounded-2xl p-3">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                            <p className="text-xs font-bold text-slate-900 truncate">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Social */}
                  {currentEmployee.details?.facebookLink && (
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Facebook</p>
                      <p className="text-xs font-bold text-slate-900 truncate">{currentEmployee.details.facebookLink}</p>
                    </div>
                  )}

                  {/* No details fallback */}
                  {!currentEmployee.details && (
                    <p className="text-xs text-slate-400 text-center py-4">No personal details on file. Contact your administrator to update your profile.</p>
                  )}
                </div>
              )}
            </Card>
          )}

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
              accent="indigo"
              badge={
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${branch.tempManager ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`} />
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{branch.tempManager ? 'Link Active' : 'No Delegate'}</span>
                </div>
              }
            />

            <div className="p-5 space-y-4">
              {/* Security status pill */}
              <div className="flex justify-center">
                <span className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${branch.isPinChanged ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
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
                      <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mt-0.5">Authorized Relief</p>
                    </div>
                  </div>

                  {/* Generated PIN display */}
                  {generatedPin && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl animate-in zoom-in space-y-2">
                      <p className="text-xs font-black text-amber-600 uppercase tracking-widest text-center">New Setup Key</p>
                      <p className="text-3xl font-black text-amber-700 tracking-[0.35em] tabular-nums text-center">{generatedPin}</p>
                      <p className="text-xs font-bold text-amber-500 uppercase tracking-widest text-center leading-relaxed">Share with delegate. They must use this for first login.</p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(generatedPin); playSound('success'); showFeedback('Copied to clipboard', 'success'); }}
                        className="w-full text-xs font-bold text-amber-700 uppercase tracking-widest hover:underline"
                      >
                        Copy to Clipboard
                      </button>
                    </div>
                  )}

                  {!generatedPin && (
                    <button
                      onClick={handleResetBranchPin}
                      disabled={isResettingPin}
                      className="w-full h-11 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isResettingPin ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : '🔑'}
                      {isResettingPin ? 'Regenerating…' : 'Reset Delegate Setup Key'}
                    </button>
                  )}

                  <button
                    onClick={() => handleSetRelief('')}
                    disabled={isSyncingRelief}
                    className="w-full h-11 rounded-2xl bg-white border border-rose-200 text-rose-500 font-black text-xs uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all active:scale-95 disabled:opacity-40"
                  >
                    {isSyncingRelief ? 'Revoking…' : 'Terminate Relief Access'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-300 flex items-center justify-center text-2xl">∅</div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-center leading-relaxed max-w-[200px]">
                    No relief manager designated for this terminal.
                  </p>
                  <button
                    onClick={() => { playSound('click'); setShowReliefSelector(true); }}
                    className="w-full h-11 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-indigo-600 active:scale-95 transition-all"
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
          <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-3xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in duration-300">
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
                      <p className="font-black text-slate-900 uppercase text-xs truncate">{emp.name}</p>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">{emp.role}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-500 transition-all" strokeWidth={3} />
                </button>
              )) : (
                <div className="py-16 text-center opacity-30">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">No available staff found</p>
                </div>
              )}
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase text-center leading-relaxed">
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
          title="Update Username"
          description="This will change your login username."
          confirmLabel="Update Username"
          onConfirm={commitUsername}
          onCancel={() => setShowAccountConfirm(false)}
        />
      )}

      {/* ── Face ID disable justification modal ─────────────────────────── */}
      {showFaceIdDisableModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">Disable Face ID?</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 ml-11">
                Staff will revert to manual clock-in. Please provide a reason for disabling Face ID.
              </p>
            </div>
            {/* Body */}
            <div className="px-6 py-4">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide block mb-2">
                Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={faceIdDisableReason}
                onChange={e => setFaceIdDisableReason(e.target.value)}
                placeholder="e.g. Camera hardware issue, temporary maintenance..."
                rows={3}
                className="w-full text-xs rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-4 py-3 resize-none outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 placeholder:text-slate-300"
              />
              {faceIdDisableReason.trim().length > 0 && faceIdDisableReason.trim().length < 10 && (
                <p className="text-[11px] text-rose-400 mt-1 ml-1">Please provide at least 10 characters.</p>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setShowFaceIdDisableModal(false)}
                className="flex-1 h-11 rounded-2xl border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={confirmDisableFaceId}
                disabled={faceIdDisableReason.trim().length < 10}
                className="flex-1 h-11 rounded-2xl bg-amber-500 text-white text-xs font-black uppercase tracking-wide hover:bg-amber-600 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
