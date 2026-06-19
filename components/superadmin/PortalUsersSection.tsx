import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { hashPin, generateSalt } from '../../lib/crypto';
import { invalidateBranchSessions, invalidateGlobalSessions } from '../../lib/audit';
import { Branch, PortalUser, PortalPermissions } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';

type AdminTab = 'network' | 'catalogs' | 'sales_hub' | 'analytics' | 'employees' | 'archive' | 'settings' | 'audit' | 'how_to' | 'backfill' | 'expenses' | 'attendance' | 'payroll' | 'requests' | 'remittances' | 'bills' | 'insights' | 'complaints';

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
  { id: 'insights',    label: 'Sales Insights', category: 'Operations' },
  { id: 'complaints',  label: 'Complaints',    category: 'Operations' },
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
  readOnly: boolean;
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
  readOnly: true, // default: read-only for safety
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
  const [branchSearch, setBranchSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ Operations: false, Management: false, System: false });
  const [formTab, setFormTab] = useState<'account' | 'permissions'>('account');
  const [userSearch, setUserSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<string[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [tabDropdownOpen, setTabDropdownOpen] = useState(false);

  const activeBranches = branches.filter(b => b.isEnabled);

  const filteredBranches = useMemo(() => {
    const q = branchSearch.trim().toUpperCase();
    if (!q) return activeBranches;
    return activeBranches.filter(b =>
      b.name.toUpperCase().includes(q) || (b.manager || '').toUpperCase().includes(q)
    );
  }, [activeBranches, branchSearch]);

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

  useEffect(() => {
    if (!tabDropdownOpen) return;
    const close = () => setTabDropdownOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [tabDropdownOpen]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setFormTab('account');
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
      readOnly:         perms.readOnly !== false, // default to true if not explicitly set to false
    });
    setFormError('');
    setFormTab('account');
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
    if (!editingId && form.pin.length !== 6)                         { setFormError('PIN must be exactly 6 digits.'); return; }
    if (!editingId && form.pin !== form.confirmPin)                  { setFormError('PINs do not match.'); return; }
    if (form.pin && form.pin !== form.confirmPin)                    { setFormError('PINs do not match.'); return; }
    if (form.pin && form.pin.length !== 6)                           { setFormError('PIN must be exactly 6 digits.'); return; }
    if (form.restrictBranches && form.branchIds.length === 0)       { setFormError('Select at least one branch, or disable branch restriction.'); return; }

    setIsSaving(true);
    try {
      const perms: PortalPermissions = {
        tabs: form.permissions,
        readOnly: form.isSuperadmin ? false : form.readOnly,
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
        const pinChanged = !!form.pin;
        if (pinChanged) {
          const salt = generateSalt();
          const hash = await hashPin(form.pin, salt);
          update[DB_COLUMNS.LOGIN_PIN] = hash;
          update[DB_COLUMNS.PIN_SALT]  = salt;
        }
        const { error } = await supabase.from(DB_TABLES.PORTAL_USERS).update(update).eq(DB_COLUMNS.ID, editingId);
        if (error) throw error;
        if (pinChanged) {
          if (form.isSuperadmin || !form.restrictBranches || form.branchIds.length === 0) {
            await invalidateGlobalSessions();
          } else {
            await invalidateBranchSessions(form.branchIds);
          }
        }
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

  const activeCount  = users.filter(u => u.isActive).length;
  const adminCount   = users.filter(u => u.isSuperadmin).length;

  const filteredUsers = useMemo(() => {
    let list = users;
    const q = userSearch.trim().toUpperCase();
    if (q) list = list.filter(u =>
      u.displayName.toUpperCase().includes(q) || u.username.toUpperCase().includes(q)
    );
    if (tabFilter.length > 0) list = list.filter(u =>
      u.isSuperadmin || tabFilter.every(t => !!u.permissions?.tabs?.[t as AdminTab])
    );
    return list;
  }, [users, userSearch, tabFilter]);

  const handleToggleActive = async (u: PortalUser) => {
    if (togglingId) return;
    setTogglingId(u.id);
    try {
      const { error } = await supabase
        .from(DB_TABLES.PORTAL_USERS)
        .update({ [DB_COLUMNS.IS_ACTIVE]: !u.isActive, [DB_COLUMNS.UPDATED_AT]: new Date().toISOString() })
        .eq(DB_COLUMNS.ID, u.id);
      if (error) throw error;
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingId(null);
    }
  };

  const getInitials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="space-y-5 pb-4">

      {/* ── Dark header card ── */}
      <div className="bg-slate-900 rounded-[24px] px-5 py-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-black uppercase tracking-tight text-white leading-none truncate">Portal Users</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Limited dashboard accounts</p>
          </div>
          <button
            onClick={openCreate}
            className="shrink-0 h-9 px-4 bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all rounded-2xl flex items-center gap-1.5 shadow-lg shadow-indigo-900/40"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M12 4v16m8-8H4"/></svg>
            <span className="text-[10px] font-black text-white uppercase tracking-widest">New User</span>
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/5 rounded-2xl px-4 py-3">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Total</p>
            <p className="text-2xl font-black text-white tabular-nums leading-none">{users.length}</p>
          </div>
          <div className="bg-white/5 rounded-2xl px-4 py-3">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Active</p>
            <p className={`text-2xl font-black tabular-nums leading-none ${activeCount > 0 ? 'text-emerald-400' : 'text-white'}`}>{activeCount}</p>
          </div>
          <div className="bg-white/5 rounded-2xl px-4 py-3">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Admins</p>
            <p className={`text-2xl font-black tabular-nums leading-none ${adminCount > 0 ? 'text-amber-400' : 'text-white'}`}>{adminCount}</p>
          </div>
        </div>
      </div>

      {/* ── User list ── */}
      {isLoading ? (
        <div className="bg-white border border-slate-100 rounded-[24px] overflow-hidden shadow-sm divide-y divide-slate-50">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 bg-slate-100 rounded-2xl animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-100 rounded-lg animate-pulse w-2/5" />
                <div className="h-2.5 bg-slate-100 rounded-lg animate-pulse w-1/3" />
              </div>
              <div className="w-14 h-8 bg-slate-100 rounded-xl animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[24px] py-14 text-center shadow-sm">
          <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">No portal users yet</p>
          <p className="text-[9px] font-bold text-slate-200 uppercase tracking-widest mt-1">Create accounts for owners or stakeholders</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-[24px] overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 bg-slate-900 flex items-center justify-between gap-3">
            <p className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">Accounts</p>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest shrink-0 ml-auto">
              {filteredUsers.length}/{users.length}
            </p>
          </div>

          {/* Search + Tab filter */}
          <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
              </svg>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="SEARCH NAME OR USERNAME…"
                className="w-full h-9 pl-8 pr-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black text-slate-700 uppercase tracking-widest placeholder:font-bold placeholder:tracking-widest placeholder:text-slate-300 outline-none focus:border-slate-300 focus:bg-white transition-all"
              />
            </div>

            {/* Custom tab filter dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setTabDropdownOpen(o => !o)}
                className={`h-9 px-3 flex items-center gap-1.5 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tabFilter.length > 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'}`}
              >
                <span>{tabFilter.length > 0 ? `${tabFilter.length} Tab${tabFilter.length > 1 ? 's' : ''}` : 'All Tabs'}</span>
                <svg className={`w-2.5 h-2.5 opacity-60 transition-transform ${tabDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {tabDropdownOpen && (
                <div className="absolute right-0 top-10 z-50 w-52 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filter by Tab</p>
                    {tabFilter.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTabFilter([])}
                        className="text-[8px] font-black text-rose-400 uppercase tracking-widest hover:text-rose-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {CATEGORIES.map(cat => (
                      <div key={cat}>
                        <p className="px-4 pt-2.5 pb-1 text-[8px] font-black text-slate-300 uppercase tracking-widest">{cat}</p>
                        {TAB_DEFINITIONS.filter(t => t.category === cat).map(t => {
                          const checked = tabFilter.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setTabFilter(prev =>
                                checked ? prev.filter(x => x !== t.id) : [...prev, t.id]
                              )}
                              className="w-full px-4 py-2 flex items-center gap-2.5 text-left hover:bg-slate-50 transition-all"
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                {checked && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                  </svg>
                                )}
                              </div>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${checked ? 'text-slate-900' : 'text-slate-500'}`}>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No users match your filter</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredUsers.map(u => {
              const label   = branchLabel(u);
              const count   = grantedCount(u);
              const isMe    = u.id === currentUserId;
              const initials = getInitials(u.displayName);
              const isReadOnly = u.permissions?.readOnly !== false;

              return (
                <div key={u.id} className={`bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col transition-all ${!u.isActive ? 'opacity-50' : ''}`}>
                  {/* ── CLICKABLE BODY: opens edit modal ── */}
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="flex flex-col gap-0 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors rounded-t-2xl"
                  >
                    {/* TOP: avatar + name */}
                    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                      <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-[12px] italic select-none ${
                        u.isSuperadmin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {initials}
                        {isMe && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-none truncate">{u.displayName}</p>
                          {!u.isActive && <span className="shrink-0 text-[6px] font-black bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-widest">Off</span>}
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 tracking-widest mt-0.5">@{u.username}</p>
                      </div>
                    </div>

                    {/* MIDDLE: access badges */}
                    <div className="px-4 pb-4 flex flex-wrap gap-1.5">
                      {u.isSuperadmin ? (
                        <span className="text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">Full Admin</span>
                      ) : (
                        <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${isReadOnly ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {isReadOnly ? 'Read Only' : 'Read+Write'}
                        </span>
                      )}
                      {!u.isSuperadmin && (
                        <>
                          <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 truncate max-w-[110px]">
                            {label ?? 'All branches'}
                          </span>
                          <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                            {count} tab{count !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  {/* ── FOOTER: delete (left) | toggle (right) ── */}
                  <div className="flex items-center justify-between px-3 py-2 border-t border-slate-50 bg-slate-50 rounded-b-2xl">
                    {!isMe ? (
                      <button
                        onClick={() => setDeleteConfirmId(u.id)}
                        title="Delete"
                        className="h-7 w-7 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-100 rounded-lg transition-all active:scale-95"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    ) : <div />}
                    {!isMe && (
                      <button
                        onClick={() => handleToggleActive(u)}
                        disabled={togglingId === u.id}
                        title={u.isActive ? 'Disable account' : 'Enable account'}
                        className={`relative w-10 h-5 rounded-full transition-all duration-300 disabled:opacity-50 shrink-0 ${u.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${u.isActive ? 'left-[22px]' : 'left-0.5'}`}>
                          {togglingId === u.id && <div className="w-full h-full rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />}
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showForm && (
        <div className={UI_THEME.layout.modalWrapper}>
          <form
            onSubmit={handleSave}
            className="bg-white rounded-3xl w-full max-w-lg mx-auto shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col"
          >
            {/* FORM HEADER — dark slate */}
            <div className="bg-slate-900 px-6 pt-5 pb-4 rounded-t-3xl shrink-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-black uppercase tracking-tight text-white leading-none">
                    {editingId ? 'Edit Portal User' : 'New Portal User'}
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    {editingId ? 'Update account details and permissions' : 'Create a limited-access account'}
                  </p>
                </div>
              </div>
              {/* Tab switcher */}
              <div className="grid grid-cols-2 gap-1 bg-white/10 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setFormTab('account')}
                  className={`h-8 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formTab === 'account' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                >
                  Account
                </button>
                <button
                  type="button"
                  onClick={() => setFormTab('permissions')}
                  className={`h-8 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formTab === 'permissions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                >
                  Permissions
                </button>
              </div>
            </div>

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div>

                {/* ── ACCOUNT TAB ── */}
                {formTab === 'account' && <div className="px-5 py-4 flex flex-col gap-3">

                  {/* ── ACCOUNT GROUP ── */}
                  <div className="space-y-1.5">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">Account</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200">
                      {/* Display Name */}
                      <div className="flex items-center h-12 px-3.5 gap-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-24 shrink-0">Display Name</label>
                        <input
                          type="text"
                          value={form.displayName}
                          onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                          placeholder="e.g. OWNER"
                          className="flex-1 h-full bg-transparent font-bold text-sm uppercase text-slate-900 outline-none placeholder:text-slate-300 text-right"
                        />
                      </div>
                      {/* Username */}
                      <div className="flex items-center h-12 px-3.5 gap-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-24 shrink-0">Username</label>
                        <input
                          type="text"
                          value={form.username}
                          onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))}
                          placeholder="e.g. owner"
                          className="flex-1 h-full bg-transparent font-bold text-sm text-slate-900 outline-none placeholder:text-slate-300 text-right"
                        />
                      </div>
                      {/* PIN */}
                      <div className="flex items-center h-12 px-3.5 gap-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-24 shrink-0">
                          {editingId ? 'New PIN' : 'PIN'}
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          value={form.pin}
                          onChange={e => setForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                          placeholder="••••••"
                          maxLength={6}
                          className="flex-1 h-full bg-transparent font-bold text-sm text-slate-900 outline-none tracking-[0.3em] placeholder:text-slate-300 text-right"
                        />
                      </div>
                      {/* Confirm PIN — only when typing a new PIN */}
                      {(form.pin || !editingId) && (
                        <div className="flex items-center h-12 px-3.5 gap-3">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-24 shrink-0">Confirm</label>
                          <input
                            type="password"
                            inputMode="numeric"
                            value={form.confirmPin}
                            onChange={e => setForm(p => ({ ...p, confirmPin: e.target.value.replace(/\D/g, '') }))}
                            placeholder="••••••"
                            maxLength={6}
                            className="flex-1 h-full bg-transparent font-bold text-sm text-slate-900 outline-none tracking-[0.3em] placeholder:text-slate-300 text-right"
                          />
                        </div>
                      )}
                    </div>
                    {editingId && !form.pin && (
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-1">Blank PIN = keep current</p>
                    )}
                  </div>

                  {/* ── SETTINGS GROUP ── */}
                  <div className="flex-1 space-y-1.5">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">Settings</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200">
                      {/* Full Admin */}
                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <div className="min-w-0 mr-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-700 leading-none">Full Admin</p>
                          <p className="text-[8px] text-slate-400 mt-0.5 leading-none">Unrestricted access</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, isSuperadmin: !p.isSuperadmin }))}
                          className={`w-10 h-5 rounded-full transition-all shrink-0 relative ${form.isSuperadmin ? 'bg-slate-900' : 'bg-slate-300'}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.isSuperadmin ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {/* Account Active (edit only) */}
                      {editingId && (
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <div className="min-w-0 mr-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700 leading-none">Account Active</p>
                            <p className="text-[8px] text-slate-400 mt-0.5 leading-none">Can log in</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                            className={`w-10 h-5 rounded-full transition-all shrink-0 relative ${form.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.isActive ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ACCESS LEVEL */}
                    {!form.isSuperadmin && (
                      <div className="space-y-1.5 pt-0.5">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">Access Level</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, readOnly: true }))}
                            className={`h-9 rounded-xl border-2 flex items-center justify-center transition-all ${form.readOnly ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'}`}
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest">Read Only</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, readOnly: false }))}
                            className={`h-9 rounded-xl border-2 flex items-center justify-center transition-all ${!form.readOnly ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'}`}
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest">Read+Write</span>
                          </button>
                        </div>
                        {form.readOnly && (
                          <p className="text-[8px] font-bold text-amber-600 uppercase tracking-widest leading-snug px-1">
                            ⚠ Safe default — cannot modify data.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1" />
                </div>}

                {/* ── PERMISSIONS TAB ── */}
                {formTab === 'permissions' && <div className="px-5 py-4 space-y-4">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em]">Permissions</p>

                  {form.isSuperadmin ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-30">
                      <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
                      </svg>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Full Admin — all permissions granted</p>
                    </div>
                  ) : (
                    <div className="space-y-4">

                      {/* TAB ACCESS — 2-col grid, full labels visible */}
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tab Access</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">Select which sections this user can view.</p>
                        </div>
                        {CATEGORIES.map(cat => {
                          const catTabs = TAB_DEFINITIONS.filter(t => t.category === cat);
                          const grantedCount = catTabs.filter(t => !!form.permissions[t.id]).length;
                          const isOpen = expandedCats[cat] ?? true;
                          return (
                            <div key={cat} className="rounded-xl border border-slate-100 overflow-hidden">
                              {/* Dropdown header */}
                              <div className="flex items-center bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => setExpandedCats(prev => ({ ...prev, [cat]: !isOpen }))}
                                  className="flex-1 flex items-center gap-2 px-3.5 py-2.5 hover:bg-slate-100 transition-colors"
                                >
                                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                                  </svg>
                                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{cat}</span>
                                  <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ml-1 ${grantedCount === catTabs.length ? 'bg-emerald-100 text-emerald-600' : grantedCount === 0 ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-600'}`}>
                                    {grantedCount}/{catTabs.length}
                                  </span>
                                </button>
                                <div className="flex items-center gap-0.5 pr-2">
                                  <button
                                    type="button"
                                    onClick={() => setForm(p => ({ ...p, permissions: { ...p.permissions, ...Object.fromEntries(catTabs.map(t => [t.id, true])) } }))}
                                    className="text-[8px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-700 px-1.5 py-1 rounded hover:bg-emerald-50 transition-colors"
                                  >All</button>
                                  <span className="text-slate-200 text-xs">·</span>
                                  <button
                                    type="button"
                                    onClick={() => setForm(p => ({ ...p, permissions: { ...p.permissions, ...Object.fromEntries(catTabs.map(t => [t.id, false])) } }))}
                                    className="text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 px-1.5 py-1 rounded hover:bg-slate-100 transition-colors"
                                  >None</button>
                                </div>
                              </div>
                              {/* Collapsible tab grid */}
                              {isOpen && (
                                <div className="grid grid-cols-2 gap-1.5 p-2.5 bg-white">
                                  {catTabs.map(t => {
                                    const granted = !!form.permissions[t.id];
                                    return (
                                      <button
                                        type="button"
                                        key={t.id}
                                        onClick={() => toggleTab(t.id)}
                                        className={`h-9 px-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 text-left ${granted ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'}`}
                                      >
                                        <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${granted ? 'border-white bg-emerald-400' : 'border-slate-300'}`}>
                                          {granted && <div className="w-1 h-1 rounded-full bg-white" />}
                                        </div>
                                        {t.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* BRANCH RESTRICTION */}
                      <div className="space-y-3 pt-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em]">Branch Access</p>
                        <div className="flex items-center justify-between px-3.5 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
                          <div className="min-w-0 mr-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800 leading-none">Restrict to Branches</p>
                            <p className="text-[8px] text-indigo-500 mt-0.5 leading-snug">
                              {form.restrictBranches ? 'Only selected branches visible.' : 'All branches visible.'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, restrictBranches: !p.restrictBranches, branchIds: [] }))}
                            className={`w-11 h-6 rounded-full transition-all shrink-0 ${form.restrictBranches ? 'bg-indigo-600' : 'bg-indigo-200'} relative`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.restrictBranches ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                        </div>

                        {form.restrictBranches && (
                          <div className="space-y-2">
                            {form.branchIds.length > 0 ? (
                              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-1.5">
                                <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                                  {form.branchIds.length} of {activeBranches.length} selected — tap to remove
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {form.branchIds.map(id => {
                                    const b = activeBranches.find(br => br.id === id);
                                    if (!b) return null;
                                    const short = b.name.replace(/BRANCH\s*-\s*/i, '').replace(/\s*BRANCH$/i, '').trim();
                                    return (
                                      <button
                                        type="button"
                                        key={id}
                                        onClick={() => toggleBranch(id)}
                                        className="flex items-center gap-1.5 bg-indigo-600 text-white pl-2.5 pr-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
                                      >
                                        {short}
                                        <svg className="w-2.5 h-2.5 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl">
                                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">No branches selected — user won't be able to log in.</p>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
                                </svg>
                                <input
                                  type="text"
                                  value={branchSearch}
                                  onChange={e => setBranchSearch(e.target.value)}
                                  placeholder="Search branches…"
                                  className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                />
                              </div>
                              <button type="button" onClick={() => setForm(p => ({ ...p, branchIds: activeBranches.map(b => b.id) }))} className="text-[8px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700 px-1">All</button>
                              <span className="text-slate-200 text-xs">·</span>
                              <button type="button" onClick={() => setForm(p => ({ ...p, branchIds: [] }))} className="text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 px-1">None</button>
                            </div>

                            {activeBranches.length === 0 ? (
                              <p className="text-[9px] text-slate-300 text-center py-4">No active branches found.</p>
                            ) : (
                              <div className="max-h-52 overflow-y-auto rounded-xl">
                                {filteredBranches.length === 0 ? (
                                  <p className="text-[9px] text-slate-300 text-center py-4">No branches match "{branchSearch}"</p>
                                ) : (
                                  <div className="grid grid-cols-3 gap-1.5 pr-0.5">
                                    {filteredBranches.map(branch => {
                                      const selected = form.branchIds.includes(branch.id);
                                      const shortName = branch.name.replace(/BRANCH\s*-\s*/i, '').replace(/\s*BRANCH$/i, '').trim();
                                      return (
                                        <button
                                          type="button"
                                          key={branch.id}
                                          onClick={() => toggleBranch(branch.id)}
                                          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all active:scale-95 ${
                                            selected ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50'
                                          }`}
                                        >
                                          <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'border-white/60 bg-white/20' : 'border-slate-300'}`}>
                                            {selected && (
                                              <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                              </svg>
                                            )}
                                          </div>
                                          <p className={`text-[9px] font-black uppercase tracking-widest truncate leading-none ${selected ? 'text-white' : 'text-slate-700'}`}>{shortName}</p>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>}
              </div>
            </div>

            {/* FORM FOOTER */}
            <div className="px-5 pb-5 pt-3 space-y-2.5 border-t border-slate-100 shrink-0">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl">
                  <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">{formError}</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-11 px-5 text-slate-500 font-bold text-[10px] uppercase tracking-widest bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 h-11 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {isSaving
                    ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    : editingId ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
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
