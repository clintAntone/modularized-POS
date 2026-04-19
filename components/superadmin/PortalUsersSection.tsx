import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { hashPin, generateSalt } from '../../lib/crypto';
import { Branch, PortalUser, PortalPermissions } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';

type AdminTab = 'network' | 'catalogs' | 'sales_hub' | 'analytics' | 'employees' | 'archive' | 'settings' | 'audit' | 'how_to' | 'backfill' | 'expenses' | 'attendance' | 'payroll' | 'requests' | 'remittances' | 'bills';

interface TabDef {
  id: AdminTab;
  label: string;
  category: string;
}

const TAB_DEFINITIONS: TabDef[] = [
  { id: 'sales_hub',   label: 'Live Sales',   category: 'Operations' },
  { id: 'archive',     label: 'Reports',       category: 'Operations' },
  { id: 'attendance',  label: 'Attendance',    category: 'Operations' },
  { id: 'backfill',    label: 'Backfill',      category: 'Operations' },
  { id: 'bills',       label: 'Bills',         category: 'Operations' },
  { id: 'remittances', label: 'Remittances',   category: 'Operations' },
  { id: 'requests',    label: 'Approvals',     category: 'Operations' },
  { id: 'payroll',     label: 'Payroll',       category: 'Operations' },
  { id: 'expenses',    label: 'Expenses',      category: 'Operations' },
  { id: 'employees',   label: 'Employees',     category: 'Management' },
  { id: 'network',     label: 'Branches',      category: 'Management' },
  { id: 'catalogs',    label: 'Catalogs',      category: 'Management' },
  { id: 'analytics',   label: 'Analytics',     category: 'System' },
  { id: 'audit',       label: 'Audit Log',     category: 'System' },
  { id: 'how_to',      label: 'SOP',           category: 'System' },
  { id: 'settings',    label: 'Settings',      category: 'System' },
];

const CATEGORIES = ['Operations', 'Management', 'System'];

interface FormState {
  displayName: string;
  username: string;
  pin: string;
  confirmPin: string;
  permissions: Record<string, boolean>;
  isSuperadmin: boolean;
  isActive: boolean;
  restrictBranches: boolean;
  branchIds: string[];
}

const emptyForm = (): FormState => ({
  displayName: '',
  username: '',
  pin: '',
  confirmPin: '',
  permissions: {},
  isSuperadmin: false,
  isActive: true,
  restrictBranches: false,
  branchIds: [],
});

interface PortalUsersSectionProps {
  currentUserId?: string;
  branches: Branch[];
}

export const PortalUsersSection: React.FC<PortalUsersSectionProps> = ({ currentUserId, branches }) => {
  const [users, setUsers]                   = useState<PortalUser[]>([]);
  const [isLoading, setIsLoading]           = useState(true);
  const [showForm, setShowForm]             = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [form, setForm]                     = useState<FormState>(emptyForm());
  const [isSaving, setIsSaving]             = useState(false);
  const [formError, setFormError]           = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const activeBranches = branches.filter(b => b.isEnabled);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from(DB_TABLES.PORTAL_USERS)
        .select('*')
        .order(DB_COLUMNS.CREATED_AT, { ascending: false });
      if (error) throw error;
      setUsers((data || []).map((row: any) => ({
        id:          row.id,
        username:    row.username,
        displayName: row.display_name,
        loginPin:    row.login_pin,
        pinSalt:     row.pin_salt,
        permissions: typeof row.permissions === 'string'
          ? JSON.parse(row.permissions)
          : (row.permissions || { tabs: {} }),
        isSuperadmin: !!row.is_superadmin,
        isActive:     row.is_active,
        createdAt:   row.created_at,
        createdBy:   row.created_by,
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (u: PortalUser) => {
    setEditingId(u.id);
    const perms = u.permissions || { tabs: {} };
    const savedBranchIds = perms.branchIds ?? [];
    setForm({
      displayName:      u.displayName,
      username:         u.username,
      pin:              '',
      confirmPin:       '',
      permissions:      { ...(perms.tabs || {}) },
      isSuperadmin:     u.isSuperadmin,
      isActive:         u.isActive,
      restrictBranches: savedBranchIds.length > 0,
      branchIds:        savedBranchIds,
    });
    setFormError('');
    setShowForm(true);
  };

  const toggleTab = (tabId: string) => {
    setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [tabId]: !prev.permissions[tabId] } }));
  };

  const toggleBranch = (branchId: string) => {
    setForm(prev => ({
      ...prev,
      branchIds: prev.branchIds.includes(branchId)
        ? prev.branchIds.filter(id => id !== branchId)
        : [...prev.branchIds, branchId],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.displayName.trim())                                    { setFormError('Display name is required.'); return; }
    if (!form.username.trim())                                       { setFormError('Username is required.'); return; }
    if (!editingId && form.pin.length < 6)                          { setFormError('PIN must be at least 6 digits.'); return; }
    if (!editingId && form.pin !== form.confirmPin)                  { setFormError('PINs do not match.'); return; }
    if (form.pin && form.pin !== form.confirmPin)                    { setFormError('PINs do not match.'); return; }
    if (form.pin && form.pin.length < 6)                            { setFormError('PIN must be at least 6 digits.'); return; }
    if (form.restrictBranches && form.branchIds.length === 0)       { setFormError('Select at least one branch, or disable branch restriction.'); return; }

    setIsSaving(true);
    try {
      const perms: PortalPermissions = {
        tabs: form.permissions,
        ...(form.restrictBranches && form.branchIds.length > 0
          ? { branchIds: form.branchIds }
          : {}),
      };

      if (editingId) {
        const update: Record<string, any> = {
          [DB_COLUMNS.DISPLAY_NAME]: form.displayName.trim(),
          [DB_COLUMNS.USERNAME]:     form.username.trim().toLowerCase(),
          [DB_COLUMNS.PERMISSIONS]:  perms,
          [DB_COLUMNS.IS_SUPERADMIN]: form.isSuperadmin,
          [DB_COLUMNS.IS_ACTIVE]:    form.isActive,
          [DB_COLUMNS.UPDATED_AT]:   new Date().toISOString(),
        };
        if (form.pin) {
          const salt = generateSalt();
          const hash = await hashPin(form.pin, salt);
          update[DB_COLUMNS.LOGIN_PIN] = hash;
          update[DB_COLUMNS.PIN_SALT]  = salt;
        }
        const { error } = await supabase.from(DB_TABLES.PORTAL_USERS).update(update).eq(DB_COLUMNS.ID, editingId);
        if (error) throw error;
      } else {
        const salt = generateSalt();
        const hash = await hashPin(form.pin, salt);
        const id   = Math.random().toString(36).substr(2, 9);
        const { error } = await supabase.from(DB_TABLES.PORTAL_USERS).insert({
          [DB_COLUMNS.ID]:           id,
          [DB_COLUMNS.DISPLAY_NAME]: form.displayName.trim(),
          [DB_COLUMNS.USERNAME]:     form.username.trim().toLowerCase(),
          [DB_COLUMNS.LOGIN_PIN]:    hash,
          [DB_COLUMNS.PIN_SALT]:     salt,
          [DB_COLUMNS.PERMISSIONS]:  perms,
          [DB_COLUMNS.IS_SUPERADMIN]: form.isSuperadmin,
          [DB_COLUMNS.IS_ACTIVE]:    form.isActive,
          [DB_COLUMNS.CREATED_AT]:   new Date().toISOString(),
        });
        if (error) throw error;
      }

      setShowForm(false);
      fetchUsers();
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (id === currentUserId) return;
    try {
      const { error } = await supabase.from(DB_TABLES.PORTAL_USERS).delete().eq(DB_COLUMNS.ID, id);
      if (error) throw error;
      setDeleteConfirmId(null);
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const grantedCount = (u: PortalUser) =>
    Object.values(u.permissions?.tabs || {}).filter(Boolean).length;

  const branchLabel = (u: PortalUser) => {
    const ids = u.permissions?.branchIds;
    if (!ids || ids.length === 0) return null;
    if (ids.length === 1) {
      const b = branches.find(br => br.id === ids[0]);
      return b ? b.name.replace(/BRANCH\s*-\s*/i, '') : '1 branch';
    }
    return `${ids.length} branches`;
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Portal Users</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Accounts with limited dashboard access
          </p>
        </div>
        <button
          onClick={openCreate}
          className="h-11 px-5 bg-slate-900 text-white font-bold text-[11px] uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all active:scale-95 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4v16m8-8H4"/></svg>
          New User
        </button>
      </div>

      {/* USER LIST */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </div>
          <p className="font-bold text-slate-400 uppercase text-[11px] tracking-widest">No portal users yet</p>
          <p className="text-slate-300 text-xs mt-1">Create accounts for owners or stakeholders.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => {
            const label = branchLabel(u);
            return (
              <div key={u.id} className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-900 uppercase tracking-tight truncate">{u.displayName}</p>
                      {u.isSuperadmin && (
                        <span className="text-[8px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">Admin</span>
                      )}
                      {label && (
                        <span className="text-[8px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0 flex items-center gap-1">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                          {label}
                        </span>
                      )}
                      {!u.isActive && (
                        <span className="text-[8px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">Suspended</span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      @{u.username} · {u.isSuperadmin ? 'Full access' : `${grantedCount(u)} tab${grantedCount(u) !== 1 ? 's' : ''}`}
                      {!u.isSuperadmin && !label && ' · All branches'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(u)}
                    className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest text-slate-600 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-all"
                  >
                    Edit
                  </button>
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => setDeleteConfirmId(u.id)}
                      className="h-9 w-9 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all border border-slate-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showForm && (
        <div className={UI_THEME.layout.modalWrapper}>
          <form
            onSubmit={handleSave}
            className="bg-white rounded-3xl w-full max-w-lg mx-auto shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col"
          >
            {/* FORM HEADER */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-50 shrink-0">
              <h3 className="text-xl font-black uppercase tracking-tighter text-slate-900">
                {editingId ? 'Edit Portal User' : 'New Portal User'}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {editingId ? 'Update account details and permissions' : 'Create a limited-access account'}
              </p>
            </div>

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Display Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Display Name</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                  placeholder="e.g. OWNER"
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm uppercase text-slate-900 outline-none focus:border-slate-400 focus:bg-white transition-all"
                />
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))}
                  placeholder="e.g. owner"
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white transition-all"
                />
              </div>

              {/* PIN */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {editingId ? 'New PIN (leave blank to keep current)' : 'PIN (6+ digits)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={form.pin}
                  onChange={e => setForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                  placeholder="••••••"
                  maxLength={8}
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white transition-all tracking-[0.3em]"
                />
              </div>

              {/* Confirm PIN */}
              {(form.pin || !editingId) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Confirm PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={form.confirmPin}
                    onChange={e => setForm(p => ({ ...p, confirmPin: e.target.value.replace(/\D/g, '') }))}
                    placeholder="••••••"
                    maxLength={8}
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white transition-all tracking-[0.3em]"
                  />
                </div>
              )}

              {/* FULL ADMIN TOGGLE */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">Full Admin Access</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Grants unrestricted access to all features.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, isSuperadmin: !p.isSuperadmin }))}
                  className={`w-12 h-6 rounded-full transition-all ${form.isSuperadmin ? 'bg-slate-900' : 'bg-slate-200'} relative shrink-0`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.isSuperadmin ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              {/* TAB PERMISSIONS */}
              {!form.isSuperadmin && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tab Access</label>
                    <p className="text-[9px] text-slate-400 mt-0.5">Select which sections this user can view.</p>
                  </div>
                  {CATEGORIES.map(cat => (
                    <div key={cat} className="space-y-1.5">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em]">{cat}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {TAB_DEFINITIONS.filter(t => t.category === cat).map(t => {
                          const granted = !!form.permissions[t.id];
                          return (
                            <button
                              type="button"
                              key={t.id}
                              onClick={() => toggleTab(t.id)}
                              className={`h-10 px-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${granted ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}
                            >
                              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${granted ? 'border-white bg-emerald-400' : 'border-slate-300'}`}>
                                {granted && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── BRANCH RESTRICTION ──────────────────────── */}
              {!form.isSuperadmin && (
                <div className="space-y-3">
                  {/* Toggle */}
                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-indigo-800">Restrict to Specific Branches</p>
                      <p className="text-[9px] text-indigo-500 mt-0.5">
                        {form.restrictBranches ? 'User sees only selected branches.' : 'User can see all branches.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, restrictBranches: !p.restrictBranches, branchIds: [] }))}
                      className={`w-12 h-6 rounded-full transition-all ${form.restrictBranches ? 'bg-indigo-600' : 'bg-indigo-200'} relative shrink-0`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.restrictBranches ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {/* Branch multi-select */}
                  {form.restrictBranches && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Select Branches
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, branchIds: activeBranches.map(b => b.id) }))}
                            className="text-[8px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700"
                          >
                            All
                          </button>
                          <span className="text-slate-200">·</span>
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, branchIds: [] }))}
                            className="text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
                          >
                            None
                          </button>
                        </div>
                      </div>

                      {activeBranches.length === 0 ? (
                        <p className="text-[9px] text-slate-300 text-center py-4">No active branches found.</p>
                      ) : (
                        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                          {activeBranches.map(branch => {
                            const selected = form.branchIds.includes(branch.id);
                            const shortName = branch.name.replace(/BRANCH\s*-\s*/i, '').trim();
                            return (
                              <button
                                type="button"
                                key={branch.id}
                                onClick={() => toggleBranch(branch.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600 border border-slate-100 hover:border-indigo-200'}`}
                              >
                                <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'border-white bg-white/20' : 'border-slate-300'}`}>
                                  {selected && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                    </svg>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-[10px] font-black uppercase tracking-widest truncate ${selected ? 'text-white' : 'text-slate-700'}`}>
                                    {shortName}
                                  </p>
                                  {branch.manager && (
                                    <p className={`text-[8px] uppercase tracking-widest mt-0.5 ${selected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                      {branch.manager}
                                    </p>
                                  )}
                                </div>
                                {selected && (
                                  <svg className="w-3.5 h-3.5 text-indigo-200 ml-auto shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {form.restrictBranches && form.branchIds.length > 0 && (
                        <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest text-center">
                          {form.branchIds.length} of {activeBranches.length} branch{form.branchIds.length !== 1 ? 'es' : ''} selected
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Active toggle (edit only) */}
              {editingId && (
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">Account Active</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Disabled accounts cannot log in.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                    className={`w-12 h-6 rounded-full transition-all ${form.isActive ? 'bg-slate-900' : 'bg-slate-200'} relative shrink-0`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.isActive ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">{formError}</p>
                </div>
              )}
            </div>

            {/* FORM FOOTER */}
            <div className="px-6 pb-6 pt-3 space-y-2 border-t border-slate-50 shrink-0">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full h-12 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isSaving
                  ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  : editingId ? 'Save Changes' : 'Create Account'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-full py-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteConfirmId && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className="bg-white rounded-3xl w-full max-w-sm mx-auto shadow-2xl border border-slate-100 p-8 text-center">
            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter mb-1">Delete Account?</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-8">This portal user will be permanently removed.</p>
            <div className="space-y-2">
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="w-full h-12 bg-rose-600 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="w-full py-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
