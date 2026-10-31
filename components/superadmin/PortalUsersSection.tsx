import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { hashPin, generateSalt } from '../../lib/crypto';
import { invalidateBranchSessions, invalidateGlobalSessions } from '../../lib/audit';
import { Branch, PortalUser, PortalPermissions } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { getTrueISOString } from '../../lib/time';
import { Users, Plus, UserCheck, ShieldCheck } from 'lucide-react';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [accessFilter, setAccessFilter] = useState<'all' | 'admin' | 'write' | 'readonly'>('all');
  const [branchFilterIds, setBranchFilterIds] = useState<string[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [tabDropdownOpen, setTabDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [accessDropdownOpen, setAccessDropdownOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const normalizedUsername = form.username.trim().toLowerCase();
    const duplicate = users.find(u => u.username.toLowerCase() === normalizedUsername && u.id !== editingId);
    if (duplicate) { setFormError(`Username "@${normalizedUsername}" is already taken.`); return; }

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
          [DB_COLUMNS.UPDATED_AT]:   getTrueISOString(),
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
          [DB_COLUMNS.CREATED_AT]:   getTrueISOString(),
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
    return `${ids.length} ${ids.length === 1 ? 'branch' : 'branches'}`;
  };

  const activeCount   = users.filter(u => u.isActive).length;
  const adminCount    = users.filter(u => u.isSuperadmin).length;
  const inactiveCount = users.length - activeCount;

  const filteredUsers = useMemo(() => {
    let list = users;
    const q = userSearch.trim().toUpperCase();
    if (q) list = list.filter(u =>
      u.displayName.toUpperCase().includes(q) || u.username.toUpperCase().includes(q)
    );
    if (tabFilter.length > 0) list = list.filter(u =>
      u.isSuperadmin || tabFilter.every(t => !!u.permissions?.tabs?.[t as AdminTab])
    );
    if (statusFilter === 'active')   list = list.filter(u => u.isActive);
    if (statusFilter === 'inactive') list = list.filter(u => !u.isActive);
    if (accessFilter === 'admin')    list = list.filter(u => u.isSuperadmin);
    if (accessFilter === 'write')    list = list.filter(u => !u.isSuperadmin && u.permissions?.readOnly === false);
    if (accessFilter === 'readonly') list = list.filter(u => !u.isSuperadmin && u.permissions?.readOnly !== false);
    if (branchFilterIds.length > 0)  list = list.filter(u =>
      u.isSuperadmin ||
      !u.permissions?.branchIds ||
      branchFilterIds.some(id => u.permissions.branchIds!.includes(id))
    );
    return list;
  }, [users, userSearch, tabFilter, statusFilter, accessFilter, branchFilterIds]);

  const handleToggleActive = async (u: PortalUser) => {
    if (togglingId) return;
    setTogglingId(u.id);
    try {
      const { error } = await supabase
        .from(DB_TABLES.PORTAL_USERS)
        .update({ [DB_COLUMNS.IS_ACTIVE]: !u.isActive, [DB_COLUMNS.UPDATED_AT]: getTrueISOString() })
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

      {/* ── Header card ── */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Title row */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Users className="w-4.5 h-4.5 text-indigo-500" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 leading-none uppercase tracking-wide">Portal Users</h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5 uppercase tracking-wide truncate">Limited dashboard accounts</p>
          </div>
          <button
            onClick={openCreate}
            className="shrink-0 flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold uppercase tracking-wide rounded-xl transition-all"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>New User</span>
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="w-3 h-3 text-slate-400" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
            </div>
            <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{users.length}</p>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <UserCheck className="w-3 h-3 text-emerald-500" />
              <p className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest">Active</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className={`text-2xl font-black tabular-nums leading-none ${activeCount > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>{activeCount}</p>
              {inactiveCount > 0 && <span className="text-[10px] font-bold text-slate-300">{inactiveCount} off</span>}
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShieldCheck className="w-3 h-3 text-amber-500" />
              <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">Admins</p>
            </div>
            <p className={`text-2xl font-black tabular-nums leading-none ${adminCount > 0 ? 'text-amber-500' : 'text-slate-900'}`}>{adminCount}</p>
          </div>
        </div>
      </div>

      {/* ── User list ── */}
      {isLoading ? (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-50">
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
        <div className="bg-white border border-slate-100 rounded-2xl py-14 text-center shadow-sm">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No portal users yet</p>
          <p className="text-xs font-bold text-slate-200 uppercase tracking-widest mt-1">Create accounts for owners or stakeholders</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">Accounts</p>
            <p className="text-xs font-medium text-slate-400 shrink-0 ml-auto">
              {filteredUsers.length}/{users.length}
            </p>
          </div>

          {/* ── Filter bar ── */}
          <div className="border-b border-slate-100">
            {/* Row 1: Search + filter toggle */}
            <div className="px-4 pt-3 pb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
                </svg>
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search name or username…"
                  className="w-full h-9 pl-8 pr-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-300 outline-none focus:border-slate-300 focus:bg-white transition-all"
                />
              </div>
              {/* Filter toggle */}
              <button
                type="button"
                onClick={() => setShowFilters(o => !o)}
                className={`relative h-9 w-9 flex items-center justify-center rounded-xl border transition-all shrink-0 ${showFilters || (statusFilter !== 'all' || accessFilter !== 'all' || branchFilterIds.length > 0 || tabFilter.length > 0) ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2"/>
                </svg>
                {(statusFilter !== 'all' || accessFilter !== 'all' || branchFilterIds.length > 0 || tabFilter.length > 0) && !showFilters && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </button>
            </div>

            {/* Row 2: Filter dropdowns — hidden by default */}
            {showFilters && <div className="px-4 pb-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">

              {/* Status dropdown */}
              <div className="relative sm:shrink-0">
                <button
                  type="button"
                  onClick={() => { setStatusDropdownOpen(o => !o); setAccessDropdownOpen(false); setBranchDropdownOpen(false); setTabDropdownOpen(false); }}
                  className={`w-full sm:w-auto h-9 sm:h-7 px-3 flex items-center justify-between sm:justify-start gap-1.5 border rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${statusFilter !== 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                >
                  <span>{statusFilter === 'all' ? 'Status' : statusFilter === 'active' ? 'Active' : 'Inactive'}</span>
                  <svg className={`w-2.5 h-2.5 opacity-60 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {statusDropdownOpen && (
                  <div className="absolute left-0 top-9 z-50 w-40 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden py-1">
                    {([['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => { setStatusFilter(val); setStatusDropdownOpen(false); }}
                        className="w-full px-4 py-2 flex items-center gap-2.5 text-left hover:bg-slate-50 transition-all"
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${statusFilter === val ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                          {statusFilter === val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-xs font-semibold uppercase tracking-wide ${statusFilter === val ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Access dropdown */}
              <div className="relative sm:shrink-0">
                <button
                  type="button"
                  onClick={() => { setAccessDropdownOpen(o => !o); setStatusDropdownOpen(false); setBranchDropdownOpen(false); setTabDropdownOpen(false); }}
                  className={`w-full sm:w-auto h-9 sm:h-7 px-3 flex items-center justify-between sm:justify-start gap-1.5 border rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${accessFilter !== 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                >
                  <span>{accessFilter === 'all' ? 'Access' : accessFilter === 'admin' ? 'Admin' : accessFilter === 'write' ? 'Write' : 'Read Only'}</span>
                  <svg className={`w-2.5 h-2.5 opacity-60 transition-transform ${accessDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {accessDropdownOpen && (
                  <div className="absolute left-0 top-9 z-50 w-44 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden py-1">
                    {([['all', 'All'], ['admin', 'Admin'], ['write', 'Write'], ['readonly', 'Read Only']] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => { setAccessFilter(val); setAccessDropdownOpen(false); }}
                        className="w-full px-4 py-2 flex items-center gap-2.5 text-left hover:bg-slate-50 transition-all"
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${accessFilter === val ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                          {accessFilter === val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-xs font-semibold uppercase tracking-wide ${accessFilter === val ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Branch dropdown */}
              <div className="relative sm:shrink-0">
                <button
                  type="button"
                  onClick={() => { setBranchDropdownOpen(o => !o); setStatusDropdownOpen(false); setAccessDropdownOpen(false); setTabDropdownOpen(false); }}
                  className={`w-full sm:w-auto h-9 sm:h-7 px-3 flex items-center justify-between sm:justify-start gap-1.5 border rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${branchFilterIds.length > 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                >
                  <span>{branchFilterIds.length > 0 ? `${branchFilterIds.length} Branch${branchFilterIds.length > 1 ? 'es' : ''}` : 'Branch'}</span>
                  <svg className={`w-2.5 h-2.5 opacity-60 transition-transform ${branchDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {branchDropdownOpen && (
                  <div className="absolute left-0 top-9 z-50 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Filter by Branch</p>
                      {branchFilterIds.length > 0 && (
                        <button type="button" onClick={() => setBranchFilterIds([])} className="text-xs font-black text-rose-400 uppercase tracking-widest hover:text-rose-600">Clear</button>
                      )}
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                      {activeBranches.map(b => {
                        const checked = branchFilterIds.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setBranchFilterIds(prev => checked ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                            className="w-full px-4 py-2 flex items-center gap-2.5 text-left hover:bg-slate-50 transition-all"
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                              {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                            </div>
                            <span className={`text-xs font-semibold uppercase tracking-wide truncate ${checked ? 'text-slate-900' : 'text-slate-500'}`}>{b.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs dropdown */}
              <div className="relative sm:shrink-0">
                <button
                  type="button"
                  onClick={() => { setTabDropdownOpen(o => !o); setStatusDropdownOpen(false); setAccessDropdownOpen(false); setBranchDropdownOpen(false); }}
                  className={`w-full sm:w-auto h-9 sm:h-7 px-3 flex items-center justify-between sm:justify-start gap-1.5 border rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${tabFilter.length > 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                >
                  <span>{tabFilter.length > 0 ? `${tabFilter.length} Tab${tabFilter.length > 1 ? 's' : ''}` : 'Tabs'}</span>
                  <svg className={`w-2.5 h-2.5 opacity-60 transition-transform ${tabDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {tabDropdownOpen && (
                  <div className="absolute left-0 top-9 z-50 w-52 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Filter by Tab</p>
                      {tabFilter.length > 0 && (
                        <button type="button" onClick={() => setTabFilter([])} className="text-xs font-black text-rose-400 uppercase tracking-widest hover:text-rose-600">Clear</button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {CATEGORIES.map(cat => (
                        <div key={cat}>
                          <p className="px-4 pt-2.5 pb-1 text-xs font-black text-slate-300 uppercase tracking-widest">{cat}</p>
                          {TAB_DEFINITIONS.filter(t => t.category === cat).map(t => {
                            const checked = tabFilter.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setTabFilter(prev => checked ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                                className="w-full px-4 py-2 flex items-center gap-2.5 text-left hover:bg-slate-50 transition-all"
                              >
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                </div>
                                <span className={`text-xs font-semibold uppercase tracking-wide ${checked ? 'text-slate-900' : 'text-slate-500'}`}>{t.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Clear all */}
              {(statusFilter !== 'all' || accessFilter !== 'all' || branchFilterIds.length > 0 || tabFilter.length > 0) && (
                <button
                  type="button"
                  onClick={() => { setStatusFilter('all'); setAccessFilter('all'); setBranchFilterIds([]); setTabFilter([]); }}
                  className="w-full sm:w-auto h-9 sm:h-7 px-3 text-[10px] font-black text-rose-400 uppercase tracking-widest hover:text-rose-600 transition-all border border-rose-100 rounded-xl sm:border-0 sm:rounded-none sm:px-2.5"
                >
                  Clear All
                </button>
              )}
            </div>}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No users match your filter</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
            {filteredUsers.map(u => {
              const label    = branchLabel(u);
              const count    = grantedCount(u);
              const isMe     = u.id === currentUserId;
              const initials = getInitials(u.displayName);
              const isReadOnly = u.permissions?.readOnly !== false;

              return (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-all ${!u.isActive ? 'opacity-40' : ''}`}
                  onMouseDown={isMe ? undefined : () => { longPressTimer.current = setTimeout(() => setDeleteConfirmId(u.id), 600); }}
                  onMouseUp={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                  onMouseLeave={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                  onTouchStart={isMe ? undefined : () => { longPressTimer.current = setTimeout(() => setDeleteConfirmId(u.id), 600); }}
                  onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                  onTouchCancel={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                >

                  {/* Avatar */}
                  <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-[11px] italic select-none ${
                    u.isSuperadmin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {initials}
                    {isMe && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white" />}
                  </div>

                  {/* Name + username — clickable */}
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="flex-1 min-w-0 text-left hover:opacity-70 active:opacity-50 transition-opacity"
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none truncate">{u.displayName}</p>
                      {!u.isActive && <span className="shrink-0 text-[6px] font-black bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-widest">Off</span>}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-0.5">@{u.username}</p>
                  </button>

                  {/* Badges */}
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {u.isSuperadmin ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">Admin</span>
                    ) : (
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg border ${isReadOnly ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                        {isReadOnly ? 'Read Only' : 'R+W'}
                      </span>
                    )}
                    {!u.isSuperadmin && (
                      <>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                          {label ?? 'All'}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                          {count}T
                        </span>
                      </>
                    )}
                  </div>

                  {/* Toggle */}
                  {!isMe ? (
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={togglingId === u.id}
                      title={u.isActive ? 'Disable account' : 'Enable account'}
                      className={`relative w-9 h-[18px] rounded-full transition-all duration-300 disabled:opacity-50 shrink-0 ${u.isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-300 ${u.isActive ? 'left-[18px]' : 'left-0.5'}`}>
                        {togglingId === u.id && <div className="w-full h-full rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />}
                      </div>
                    </button>
                  ) : <div className="w-9 shrink-0" />}


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
            className="bg-white rounded-3xl w-full max-w-lg lg:max-w-4xl mx-auto shadow-xl border border-slate-100 max-h-[92vh] flex flex-col"
          >
            {/* ── HEADER ── */}
            <div className="bg-white border-b border-slate-100 px-6 pt-5 pb-4 rounded-t-3xl shrink-0">
              <div className="flex items-center gap-3 mb-4 lg:mb-0">
                <div className="w-9 h-9 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900 leading-none">
                    {editingId ? 'Edit Portal User' : 'New Portal User'}
                  </h3>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
                    {editingId ? 'Update account details and permissions' : 'Create a limited-access account'}
                  </p>
                </div>
              </div>
              {/* Tab switcher — mobile only, full-width row */}
              <div className="lg:hidden grid grid-cols-2 gap-1 bg-slate-100 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setFormTab('account')}
                  className={`h-8 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${formTab === 'account' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                >
                  Account
                </button>
                <button
                  type="button"
                  onClick={() => setFormTab('permissions')}
                  className={`h-8 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${formTab === 'permissions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                >
                  Permissions
                </button>
              </div>
            </div>

            {/* ── BODY: single column on mobile, two columns on desktop ── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col lg:flex-row lg:min-h-full">

              {/* ── LEFT / ACCOUNT PANEL ── */}
              <div className={`lg:w-72 lg:shrink-0 lg:border-r lg:border-slate-100 ${formTab === 'permissions' ? 'hidden lg:block' : ''}`}>
                <div className="px-5 py-5 flex flex-col gap-4">

                  {/* Column label — desktop only */}
                  <p className="hidden lg:block text-[10px] font-black text-slate-300 uppercase tracking-widest">Account</p>

                  {/* ── ACCOUNT FIELDS ── */}
                  <div className="space-y-2.5">
                    <p className="lg:hidden text-xs font-black text-slate-400 uppercase tracking-widest px-1">Account</p>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1">Display Name</label>
                      <input
                        type="text"
                        value={form.displayName}
                        onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                        placeholder="e.g. OWNER"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm uppercase text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1">Username</label>
                      <input
                        type="text"
                        value={form.username}
                        onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))}
                        placeholder="e.g. owner"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1">{editingId ? 'New PIN' : 'PIN'}</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        value={form.pin}
                        onChange={e => setForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                        placeholder="••••••"
                        maxLength={6}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all tracking-widest placeholder:text-slate-300"
                      />
                    </div>
                    {(form.pin || !editingId) && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-1">Confirm PIN</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          value={form.confirmPin}
                          onChange={e => setForm(p => ({ ...p, confirmPin: e.target.value.replace(/\D/g, '') }))}
                          placeholder="••••••"
                          maxLength={6}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all tracking-widest placeholder:text-slate-300"
                        />
                      </div>
                    )}
                    {editingId && !form.pin && (
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1">Blank PIN = keep current</p>
                    )}
                  </div>

                  {/* ── SETTINGS ── */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Settings</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200">
                      <div className="flex items-center justify-between px-3.5 py-3">
                        <div className="min-w-0 mr-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 leading-none">Full Admin</p>
                          <p className="text-xs text-slate-400 mt-0.5 leading-none">Unrestricted access</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, isSuperadmin: !p.isSuperadmin }))}
                          className={`w-10 h-5 rounded-full transition-all shrink-0 relative ${form.isSuperadmin ? 'bg-slate-900' : 'bg-slate-300'}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.isSuperadmin ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {editingId && (
                        <div className="flex items-center justify-between px-3.5 py-3">
                          <div className="min-w-0 mr-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 leading-none">Account Active</p>
                            <p className="text-xs text-slate-400 mt-0.5 leading-none">Can log in</p>
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
                  </div>

                  {/* ── ACCESS LEVEL ── */}
                  {!form.isSuperadmin && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Access Level</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, readOnly: true }))}
                          className={`h-9 rounded-xl border-2 flex items-center justify-center transition-all ${form.readOnly ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'}`}
                        >
                          <span className="text-xs font-semibold uppercase tracking-wide">Read Only</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, readOnly: false }))}
                          className={`h-9 rounded-xl border-2 flex items-center justify-center transition-all ${!form.readOnly ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'}`}
                        >
                          <span className="text-xs font-semibold uppercase tracking-wide">Read+Write</span>
                        </button>
                      </div>
                      {form.readOnly && (
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest leading-snug px-1">
                          ⚠ Safe default — cannot modify data.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── RIGHT / PERMISSIONS PANEL ── */}
              <div className={`flex-1 ${formTab === 'account' ? 'hidden lg:block' : ''}`}>
                <div className="px-5 py-5 space-y-4">

                  {/* Column label — desktop only */}
                  <p className="hidden lg:block text-[10px] font-black text-slate-300 uppercase tracking-widest">Permissions</p>

                  {form.isSuperadmin ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
                      <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
                      </svg>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-center">Full Admin — all permissions granted</p>
                    </div>
                  ) : (
                    <div className="space-y-4">

                      {/* TAB ACCESS */}
                      <div className="space-y-2">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Tab Access</p>
                        {CATEGORIES.map(cat => {
                          const catTabs = TAB_DEFINITIONS.filter(t => t.category === cat);
                          const granted = catTabs.filter(t => !!form.permissions[t.id]).length;
                          const isOpen = expandedCats[cat] ?? true;
                          return (
                            <div key={cat} className="rounded-xl border border-slate-100 overflow-hidden">
                              <div className="flex items-center bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => setExpandedCats(prev => ({ ...prev, [cat]: !isOpen }))}
                                  className="flex-1 flex items-center gap-2 px-3.5 py-2.5 hover:bg-slate-100 transition-colors"
                                >
                                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                                  </svg>
                                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{cat}</span>
                                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ml-1 ${granted === catTabs.length ? 'bg-emerald-100 text-emerald-600' : granted === 0 ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-600'}`}>
                                    {granted}/{catTabs.length}
                                  </span>
                                </button>
                                <div className="flex items-center gap-0.5 pr-2">
                                  <button type="button" onClick={() => setForm(p => ({ ...p, permissions: { ...p.permissions, ...Object.fromEntries(catTabs.map(t => [t.id, true])) } }))} className="text-xs font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-700 px-1.5 py-1 rounded hover:bg-emerald-50 transition-colors">All</button>
                                  <span className="text-slate-200 text-xs">·</span>
                                  <button type="button" onClick={() => setForm(p => ({ ...p, permissions: { ...p.permissions, ...Object.fromEntries(catTabs.map(t => [t.id, false])) } }))} className="text-xs font-medium text-slate-400 uppercase tracking-wide hover:text-slate-600 px-1.5 py-1 rounded hover:bg-slate-100 transition-colors">None</button>
                                </div>
                              </div>
                              {isOpen && (
                                <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-white">
                                  {catTabs.map(t => {
                                    const on = !!form.permissions[t.id];
                                    return (
                                      <button
                                        type="button"
                                        key={t.id}
                                        onClick={() => toggleTab(t.id)}
                                        className={`h-8 px-2.5 rounded-lg text-xs font-medium uppercase tracking-wide transition-all flex items-center gap-1.5 text-left ${on ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'}`}
                                      >
                                        <div className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? 'border-white bg-emerald-400' : 'border-slate-300'}`}>
                                          {on && <div className="w-1 h-1 rounded-full bg-white" />}
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
                      <div className="space-y-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Branch Access</p>
                        <div className="flex items-center justify-between px-3.5 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
                          <div className="min-w-0 mr-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800 leading-none">Restrict to Branches</p>
                            <p className="text-xs text-indigo-500 mt-0.5 leading-snug">
                              {form.restrictBranches ? 'Only selected branches visible.' : 'All branches visible.'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, restrictBranches: !p.restrictBranches, branchIds: [] }))}
                            className={`w-11 h-6 rounded-full transition-all shrink-0 relative ${form.restrictBranches ? 'bg-indigo-600' : 'bg-indigo-200'}`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.restrictBranches ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                        </div>

                        {form.restrictBranches && (
                          <div className="space-y-2">
                            {form.branchIds.length > 0 ? (
                              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-1.5">
                                <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">
                                  {form.branchIds.length} of {activeBranches.length} selected — tap to remove
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {form.branchIds.map(id => {
                                    const b = activeBranches.find(br => br.id === id);
                                    if (!b) return null;
                                    const short = b.name.replace(/BRANCH\s*-\s*/i, '').replace(/\s*BRANCH$/i, '').trim();
                                    return (
                                      <button type="button" key={id} onClick={() => toggleBranch(id)}
                                        className="flex items-center gap-1.5 bg-indigo-600 text-white pl-2.5 pr-2 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all"
                                      >
                                        {short}
                                        <svg className="w-2.5 h-2.5 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl">
                                <p className="text-xs font-black text-amber-600 uppercase tracking-widest">No branches selected — user won't be able to log in.</p>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                                <input type="text" value={branchSearch} onChange={e => setBranchSearch(e.target.value)} placeholder="Search branches…"
                                  className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white transition-all"
                                />
                              </div>
                              <button type="button" onClick={() => setForm(p => ({ ...p, branchIds: activeBranches.map(b => b.id) }))} className="text-xs font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700 px-1">All</button>
                              <span className="text-slate-200 text-xs">·</span>
                              <button type="button" onClick={() => setForm(p => ({ ...p, branchIds: [] }))} className="text-xs font-medium text-slate-400 uppercase tracking-wide hover:text-slate-600 px-1">None</button>
                            </div>

                            {activeBranches.length === 0 ? (
                              <p className="text-xs text-slate-300 text-center py-4">No active branches found.</p>
                            ) : filteredBranches.length === 0 ? (
                              <p className="text-xs text-slate-300 text-center py-4">No branches match "{branchSearch}"</p>
                            ) : (
                              <div className="max-h-48 overflow-y-auto rounded-xl">
                                <div className="grid grid-cols-3 gap-1.5 pr-0.5">
                                  {filteredBranches.map(branch => {
                                    const selected = form.branchIds.includes(branch.id);
                                    const shortName = branch.name.replace(/BRANCH\s*-\s*/i, '').replace(/\s*BRANCH$/i, '').trim();
                                    return (
                                      <button type="button" key={branch.id} onClick={() => toggleBranch(branch.id)}
                                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all active:scale-95 ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50'}`}
                                      >
                                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'border-white/60 bg-white/20' : 'border-slate-300'}`}>
                                          {selected && <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                        </div>
                                        <p className={`text-xs font-semibold uppercase tracking-wide truncate leading-none ${selected ? 'text-white' : 'text-slate-700'}`}>{shortName}</p>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>{/* end lg:flex-row wrapper */}
            </div>

            {/* ── FOOTER ── */}
            <div className="px-5 pb-5 pt-3 space-y-2.5 border-t border-slate-100 shrink-0">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl">
                  <p className="text-xs font-bold text-rose-600 uppercase tracking-widest">{formError}</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-11 px-5 text-slate-500 font-bold text-xs uppercase tracking-widest bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 h-11 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center justify-center"
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
          <div className="bg-white rounded-3xl w-full max-w-sm mx-auto shadow-xl border border-slate-100 p-8 text-center">
            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter mb-1">Delete Account?</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed mb-8">This portal user will be permanently removed.</p>
            <div className="space-y-2">
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="w-full h-12 bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="w-full py-3 text-slate-400 font-bold text-xs uppercase tracking-widest"
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
