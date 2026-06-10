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

          <div className="divide-y divide-slate-50">
            {filteredUsers.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No users match your filter</p>
              </div>
            ) : null}
            {filteredUsers.map(u => {
              const label   = branchLabel(u);
              const count   = grantedCount(u);
              const isMe    = u.id === currentUserId;
              const initials = getInitials(u.displayName);
              const isReadOnly = u.permissions?.readOnly !== false;

              return (
                <div key={u.id} className={`flex items-center gap-3 px-4 py-4 ${!u.isActive ? 'opacity-50' : ''}`}>
                  {/* Avatar */}
                  <div className={`relative w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-black text-[13px] italic select-none ${
                    u.isSuperadmin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {initials}
                    {isMe && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-tight truncate">{u.displayName}</p>
                      {!u.isActive && (
                        <span className="shrink-0 text-[7px] font-black bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md uppercase tracking-widest">Inactive</span>
                      )}
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-widest mt-0.5 truncate">
                      <span className="text-slate-400">@{u.username}</span>
                      {u.isSuperadmin ? (
                        <span className="text-amber-500"> · Full Admin</span>
                      ) : (
                        <>
                          <span className={isReadOnly ? 'text-amber-500' : 'text-emerald-600'}>{isReadOnly ? ' · Read Only' : ' · Read+Write'}</span>
                          <span className="text-slate-300"> · {label ?? 'All branches'} · {count} tab{count !== 1 ? 's' : ''}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Quick active toggle switch */}
                    {!isMe && (
                      <button
                        onClick={() => handleToggleActive(u)}
                        disabled={togglingId === u.id}
                        title={u.isActive ? 'Disable account' : 'Enable account'}
                        className={`relative w-11 h-6 rounded-full transition-all duration-300 disabled:opacity-50 shrink-0 ${u.isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${u.isActive ? 'left-[22px]' : 'left-0.5'}`}>
                          {togglingId === u.id && (
                            <div className="w-full h-full rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                          )}
                        </div>
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(u)}
                      className="h-8 px-3 text-[9px] font-bold uppercase tracking-widest text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all active:scale-95"
                    >
                      Edit
                    </button>
                    {!isMe && (
                      <button
                        onClick={() => setDeleteConfirmId(u.id)}
                        className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
                  {editingId ? 'New PIN (leave blank to keep current)' : 'PIN (exactly 6 digits)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={form.pin}
                  onChange={e => setForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                  placeholder="••••••"
                  maxLength={6}
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
                    maxLength={6}
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

              {/* ── ACCESS LEVEL ──────────────────────── */}
              {!form.isSuperadmin && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Access Level</label>
                  <p className="text-[9px] text-slate-400">Controls whether this user can only view data or also perform write actions (approve, save, edit, etc.).</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, readOnly: true }))}
                      className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all ${form.readOnly ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'}`}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest">Read Only</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest opacity-70">View & browse only</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, readOnly: false }))}
                      className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all ${!form.readOnly ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'}`}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest">Read + Write</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest opacity-70">Can perform actions</span>
                    </button>
                  </div>
                  {form.readOnly && (
                    <p className="text-[8px] font-bold text-amber-600 uppercase tracking-widest">
                      ⚠ Read Only is the safe default — users cannot accidentally modify data.
                    </p>
                  )}
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

                      {/* Selected chips — tap to remove */}
                      {form.branchIds.length > 0 ? (
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-1.5">
                          <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                            {form.branchIds.length} of {activeBranches.length} selected — tap to remove
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {form.branchIds.map(id => {
                              const b = activeBranches.find(br => br.id === id);
                              if (!b) return null;
                              const short = b.name.replace(/BRANCH\s*-\s*/i, '').trim();
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

                      {/* Search + All / None */}
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
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, branchIds: activeBranches.map(b => b.id) }))}
                          className="text-[8px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700 px-1"
                        >All</button>
                        <span className="text-slate-200 text-xs">·</span>
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, branchIds: [] }))}
                          className="text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 px-1"
                        >None</button>
                      </div>

                      {/* Compact 2-col branch grid */}
                      {activeBranches.length === 0 ? (
                        <p className="text-[9px] text-slate-300 text-center py-4">No active branches found.</p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto rounded-xl">
                          {filteredBranches.length === 0 ? (
                            <p className="text-[9px] text-slate-300 text-center py-4">No branches match "{branchSearch}"</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5 pr-0.5">
                              {filteredBranches.map(branch => {
                                const selected = form.branchIds.includes(branch.id);
                                const shortName = branch.name.replace(/BRANCH\s*-\s*/i, '').trim();
                                return (
                                  <button
                                    type="button"
                                    key={branch.id}
                                    onClick={() => toggleBranch(branch.id)}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95 ${
                                      selected
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50'
                                    }`}
                                  >
                                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'border-white/60 bg-white/20' : 'border-slate-300'}`}>
                                      {selected && (
                                        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                        </svg>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className={`text-[9px] font-black uppercase tracking-widest truncate leading-snug ${selected ? 'text-white' : 'text-slate-700'}`}>
                                        {shortName}
                                      </p>
                                      {branch.manager && (
                                        <p className={`text-[7px] uppercase tracking-widest truncate leading-snug ${selected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                          {branch.manager.split(' ')[0]}
                                        </p>
                                      )}
                                    </div>
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
