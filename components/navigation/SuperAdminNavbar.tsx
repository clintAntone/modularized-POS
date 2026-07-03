import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Employee } from '../../types';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { UI_THEME } from '../../constants/ui_designs';

type AdminTab = 'network' | 'catalogs' | 'sales_hub' | 'analytics' | 'employees' | 'archive' | 'settings' | 'audit' | 'how_to' | 'backfill' | 'expenses' | 'attendance' | 'payroll' | 'requests' | 'remittances' | 'vault' | 'portal_users' | 'devices' | 'insights' | 'report_audit' | 'complaints';

interface SuperAdminNavbarProps {
  activeTab: AdminTab;
  onTabChange: (id: AdminTab) => void;
  employees?: Employee[];
  isSticky?: boolean;
  pendingRequestsCount?: number;
  pendingComplaintsCount?: number;
  allowedTabs?: string[];
}

const Icons = {
  live:     <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  analytics:<svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
  reports:  <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6m-4 5H8m8 4H8m2-8H8"/></svg>,
  nodes:    <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  staff:    <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8zm14-2v2m-3-1h6"/></svg>,
  audit:    <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4m0 4h.01"/></svg>,
  catalogs: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  expenses: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
  settings: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  how_to:   <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>,
  devices:  <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><rect x="5" y="2" width="14" height="20" rx="2"/><rect x="2" y="7" width="6" height="10" rx="1"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  portal:   <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  more:     <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  requests: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>,
  clock:    <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  backfill: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>,
  vault:    <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
  remit:    <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.407 2.67 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.407-2.67-1M12 16v1m4-12H8a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2z"/></svg>,
  payroll:  <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
  insights: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
  star:     <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  starOutline: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
};

// Ordered category list for the More modal
const CATEGORY_ORDER = ['Finance', 'Reports', 'People', 'Branches', 'System'] as const;

export const SuperAdminNavbar: React.FC<SuperAdminNavbarProps> = ({ activeTab, onTabChange, employees = [], isSticky = true, pendingRequestsCount = 0, pendingComplaintsCount = 0, allowedTabs }) => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  // Favorites
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('sa_starred_tabs') || '[]')); }
    catch { return new Set(); }
  });

  const toggleStar = useCallback((id: string) => {
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      try { localStorage.setItem('sa_starred_tabs', JSON.stringify([...next])); } catch {}
      return next;
    });
    playSound('click');
  }, []);

  const resetRequestCount = useMemo(() =>
    employees.filter(e => e.requestReset).length
  , [employees]);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const allTabRegistry = useMemo(() => [
    // ── Always-priority tabs (appear in top navbar first) ──
    { id: 'sales_hub',    label: 'Live',        icon: Icons.live,      desc: 'Network Stream',       color: 'bg-emerald-50 text-emerald-600', category: 'Operations', adminOnly: false },
    { id: 'archive',      label: 'Reports',     icon: Icons.reports,   desc: 'Daily History',        color: 'bg-slate-100 text-slate-600',   category: 'Reports',    adminOnly: false },
    { id: 'insights',     label: 'Insights',    icon: Icons.insights,  desc: 'Sales Anomaly Detection', color: 'bg-rose-50 text-rose-600',   category: 'Reports',    adminOnly: false },
    { id: 'employees',    label: 'Employees',   icon: Icons.staff,     desc: 'Staff Master',         color: 'bg-indigo-50 text-indigo-600',  category: 'People',     adminOnly: false },
    { id: 'attendance',   label: 'Attendance',  icon: Icons.clock,     desc: 'Clock-in Logs',        color: 'bg-sky-50 text-sky-600',        category: 'Operations', adminOnly: false },
    { id: 'network',      label: 'Branches',    icon: Icons.nodes,     desc: 'Branch Control',       color: 'bg-slate-50 text-slate-600',    category: 'Branches',   adminOnly: false },
    { id: 'service_templates', label: 'Catalogs',    icon: Icons.catalogs,  desc: 'Normalized Service Registry', color: 'bg-amber-50 text-amber-700', category: 'Branches',   adminOnly: true  },
    { id: 'backfill',     label: 'Backfill',    icon: Icons.backfill,  desc: 'Mass Data Entry',      color: 'bg-violet-50 text-violet-600',  category: 'Operations', adminOnly: false },

    // ── Finance ──
    { id: 'vault',        label: 'Vault',       icon: Icons.vault,     desc: 'Vault Funds',          color: 'bg-emerald-50 text-emerald-700', category: 'Finance',   adminOnly: false },
    { id: 'remittances',  label: 'Remittances', icon: Icons.remit,     desc: 'Weekly Payouts',       color: 'bg-teal-50 text-teal-700',       category: 'Finance',   adminOnly: false },
    { id: 'payroll',      label: 'Payroll',     icon: Icons.payroll,   desc: 'Network Payouts',      color: 'bg-indigo-50 text-indigo-700',   category: 'Finance',   adminOnly: false },
    { id: 'expenses',     label: 'Expenses',    icon: Icons.expenses,  desc: 'Global Ledger',        color: 'bg-rose-50 text-rose-600',       category: 'Finance',   adminOnly: false },

    // ── Reports ──
    { id: 'analytics',    label: 'Analytics',   icon: Icons.analytics, desc: 'Performance Charts',   color: 'bg-indigo-50 text-indigo-600',  category: 'Reports',    adminOnly: false },
    { id: 'audit',        label: 'Audit',       icon: Icons.audit,     desc: 'Security Registry',    color: 'bg-rose-50 text-rose-600',      category: 'Reports',    adminOnly: false },

    // ── People ──
    { id: 'requests',     label: 'Approvals',   icon: Icons.requests,  desc: 'Pending Requests',     color: 'bg-amber-50 text-amber-600',    category: 'People',     adminOnly: false },
    { id: 'complaints',   label: 'Complaints',  icon: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H11.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/></svg>, desc: 'Employee Reports', color: 'bg-rose-50 text-rose-600', category: 'People', adminOnly: false },

    // ── System ──
    { id: 'devices',      label: 'Devices',     icon: Icons.devices,   desc: 'POS Device Registry',  color: 'bg-violet-50 text-violet-600',  category: 'System',     adminOnly: false },
    { id: 'settings',     label: 'Settings',    icon: Icons.settings,  desc: 'Core Configuration',   color: 'bg-slate-900 text-white',       category: 'System',     adminOnly: false },
    { id: 'portal_users', label: 'Portal Users',icon: Icons.portal,    desc: 'User Accounts',        color: 'bg-slate-100 text-slate-600',   category: 'System',     adminOnly: true  },
    { id: 'report_audit', label: 'Report Audit',icon: Icons.audit,     desc: 'Report Math Diagnostic', color: 'bg-rose-50 text-rose-600',     category: 'Reports',    adminOnly: true  },
    { id: 'how_to',       label: 'SOP',         icon: Icons.how_to,    desc: 'Admin Manual',         color: 'bg-slate-100 text-slate-500',   category: 'System',     adminOnly: false },
  ], []);

  const adminTabRegistry = useMemo(() => {
    if (allowedTabs) {
      return allTabRegistry.filter(t => !t.adminOnly && allowedTabs.includes(t.id));
    }
    return allTabRegistry;
  }, [allTabRegistry, allowedTabs]);

  // ResizeObserver: measure actual tab widths and set visibleCount
  const recalculate = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const available = container.clientWidth;
    const tabEls = Array.from<HTMLElement>(measure.querySelectorAll<HTMLElement>('[data-tab-measure]'));
    const moreEl = measure.querySelector<HTMLElement>('[data-more-measure]');
    const moreW = (moreEl?.offsetWidth ?? 72) + 8;

    let used = 0;
    let count = 0;
    for (let i = 0; i < tabEls.length; i++) {
      const w = tabEls[i].offsetWidth + 8;
      const remaining = tabEls.length - i - 1;
      const needed = used + w + (remaining > 0 ? moreW : 0);
      if (needed <= available) {
        used += w;
        count++;
      } else {
        break;
      }
    }
    setVisibleCount(Math.max(1, count));
  }, []);

  useEffect(() => {
    if (!mounted || windowWidth < 640) return;
    const obs = new ResizeObserver(recalculate);
    if (containerRef.current) obs.observe(containerRef.current);
    recalculate();
    return () => obs.disconnect();
  }, [mounted, windowWidth, adminTabRegistry, recalculate]);

  const { visibleTabs, overflowTabs, isMoreActive } = useMemo(() => {
    const priorityIds = ['sales_hub', 'archive', 'employees', 'attendance', 'network', 'service_templates', 'backfill', 'remittances', 'requests', 'payroll'];

    let visible: typeof adminTabRegistry;
    if (windowWidth < 640) {
      // Show 4 priority tabs on all mobile phones (360–430px all fall here).
      // The old 480px cutoff caused attendance to always be hidden since no phone hits 480–640px portrait.
      visible = adminTabRegistry.filter(t => priorityIds.slice(0, 4).includes(t.id));
    } else {
      const count = visibleCount ?? adminTabRegistry.length;
      visible = adminTabRegistry.slice(0, count);
    }

    const visibleIds = new Set(visible.map(t => t.id));
    const overflow = adminTabRegistry.filter(t => !visibleIds.has(t.id));
    const moreActive = overflow.some(t => t.id === activeTab);
    return { visibleTabs: visible, overflowTabs: overflow, isMoreActive: moreActive };
  }, [adminTabRegistry, activeTab, windowWidth, visibleCount]);

  const handleTabClick = (id: string) => {
    resumeAudioContext();
    playSound('click');
    onTabChange(id as AdminTab);
    setShowMoreModal(false);
  };

  // Starred overflow items shown in Favorites section
  const starredOverflow = useMemo(() =>
    overflowTabs.filter(t => starredIds.has(t.id)),
    [overflowTabs, starredIds]
  );

  const renderTile = useCallback((item: typeof allTabRegistry[0]) => {
    const isStarred = starredIds.has(item.id);
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleTabClick(item.id)}
        className={`relative p-4 sm:p-5 rounded-2xl border text-left flex flex-col gap-3 transition-all group overflow-hidden min-h-[110px] sm:min-h-[130px] ${
          isActive
            ? 'border-emerald-400 bg-emerald-50/40 shadow-sm'
            : 'border-slate-100 hover:border-slate-200 hover:shadow-md bg-white'
        }`}
      >
        {/* Active dot */}
        {isActive && (
          <div className="absolute top-2.5 left-2.5 w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
        )}

        {/* Star toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); toggleStar(item.id); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleStar(item.id); } }}
          className={`absolute top-2 right-2 p-1 rounded-lg transition-all z-10 cursor-pointer ${
            isStarred
              ? 'text-amber-400 hover:text-amber-500'
              : 'text-slate-200 hover:text-amber-300 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isStarred ? Icons.star : Icons.starOutline}
        </div>

        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color} relative`}>
          {item.icon}
          {item.id === 'employees' && resetRequestCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600 border border-white" />
            </span>
          )}
          {item.id === 'requests' && pendingRequestsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border border-white items-center justify-center text-[8px] font-black text-white leading-none">
                {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
              </span>
            </span>
          )}
          {item.id === 'complaints' && pendingComplaintsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 border border-white items-center justify-center text-[8px] font-black text-white leading-none">
                {pendingComplaintsCount > 9 ? '9+' : pendingComplaintsCount}
              </span>
            </span>
          )}
        </div>

        {/* Label + desc */}
        <div className="min-w-0">
          <p className={`text-[12px] sm:text-[13px] font-black uppercase tracking-tight leading-none mb-1 transition-colors ${isActive ? 'text-emerald-700' : 'text-slate-900 group-hover:text-emerald-700'}`}>
            {item.label}
          </p>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">
            {item.desc}
          </p>
        </div>
      </button>
    );
  }, [activeTab, starredIds, resetRequestCount, pendingRequestsCount, toggleStar]);

  if (!mounted) return null;

  return (
    <>
      {windowWidth >= 640 ? (
        <nav className={`bg-slate-800 border-b border-white/5 no-print ${isSticky ? 'sticky top-[72px] sm:top-20' : ''} z-[900] shadow-lg w-full`}>
          <div ref={containerRef} className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} flex items-center h-14 relative`}>
            {/* Hidden measurement div */}
            <div
              ref={measureRef}
              aria-hidden="true"
              className="absolute flex items-center gap-1 lg:gap-2 pointer-events-none"
              style={{ visibility: 'hidden', top: '-9999px', left: 0, whiteSpace: 'nowrap' }}
            >
              {adminTabRegistry.map(item => (
                <button
                  key={item.id}
                  data-tab-measure="1"
                  tabIndex={-1}
                  className="flex items-center gap-2 px-3 lg:px-4 py-2.5 font-semibold text-[10px] lg:text-[11px] uppercase shrink-0 rounded-xl"
                >
                  <div>{item.icon}</div>
                  <span className="tracking-widest whitespace-nowrap">{item.label}</span>
                </button>
              ))}
              <button
                data-more-measure="1"
                tabIndex={-1}
                className="flex items-center gap-2 px-3 lg:px-4 py-2.5 font-semibold text-[10px] lg:text-[11px] uppercase shrink-0 rounded-xl mr-2"
              >
                {Icons.more}
                <span className="tracking-widest whitespace-nowrap">More</span>
              </button>
            </div>

            <div className="flex items-center gap-1 lg:gap-2 min-w-0">
              {visibleTabs.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`relative flex items-center gap-2 px-3 lg:px-4 py-2.5 font-semibold text-[10px] lg:text-[11px] uppercase transition-all duration-200 shrink-0 group rounded-xl ${isActive ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <div className={`transition-all duration-200 ${isActive ? 'scale-110 text-emerald-400' : 'group-hover:text-emerald-300'}`}>{item.icon}</div>
                    <span className={`tracking-widest whitespace-nowrap transition-opacity duration-200 opacity-80 group-hover:opacity-100 ${isActive ? 'opacity-100' : ''}`}>
                      {item.label}
                    </span>
                    {item.id === 'employees' && resetRequestCount > 0 && (
                      <div className="absolute -top-1 -right-1 flex items-center justify-center">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600 border border-white"></span>
                        </span>
                      </div>
                    )}
                    {item.id === 'requests' && pendingRequestsCount > 0 && (
                      <div className="absolute -top-1 -right-1 flex items-center justify-center z-10">
                        <span className="relative flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border border-white items-center justify-center text-[8px] font-black text-white leading-none">
                            {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                          </span>
                        </span>
                      </div>
                    )}
                    {isActive && <div className="absolute -bottom-1 left-4 right-4 h-[2px] bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>}
                  </button>
                );
              })}

              {overflowTabs.length > 0 && (
                <button
                  onClick={() => { resumeAudioContext(); playSound('click'); setShowMoreModal(true); }}
                  className={`relative flex items-center gap-2 px-3 lg:px-4 py-2.5 font-semibold text-[10px] lg:text-[11px] uppercase transition-all duration-200 shrink-0 group rounded-xl mr-2 ${isMoreActive ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <div className={`transition-all duration-200 ${isMoreActive ? 'scale-110 text-emerald-400' : 'group-hover:text-emerald-300'}`}>{Icons.more}</div>
                  <span className={`tracking-widest whitespace-nowrap transition-opacity duration-200 opacity-80 group-hover:opacity-100 ${isMoreActive ? 'opacity-100' : ''}`}>
                    More
                  </span>
                  {isMoreActive && <div className="absolute -bottom-1 left-4 right-4 h-[2px] bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>}
                </button>
              )}
            </div>
          </div>
        </nav>
      ) : (
        /* MOBILE NAV */
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] no-print w-full px-4">
          <div className="bg-slate-800/95 backdrop-blur-2xl px-2 py-3 rounded-[32px] shadow-[0_15px_45px_-5px_rgba(0,0,0,0.5)] ring-1 ring-white/10 border border-white/5 flex items-center transition-all duration-500">
            {visibleTabs.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative flex-1 min-w-0 px-1 ${isActive ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
                >
                  <div className={`transition-all duration-300 ${isActive ? 'text-emerald-400' : 'text-white'}`}>
                    {item.icon}
                    {item.id === 'employees' && resetRequestCount > 0 && (
                      <div className="absolute -top-1 right-2 flex items-center justify-center">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600 border border-slate-800"></span>
                        </span>
                      </div>
                    )}
                    {item.id === 'requests' && pendingRequestsCount > 0 && (
                      <div className="absolute -top-1 right-1 flex items-center justify-center">
                        <span className="relative flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border border-slate-800 items-center justify-center text-[8px] font-black text-white leading-none">
                            {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                  <span className={`text-[8px] font-bold uppercase tracking-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>{item.label}</span>
                  {isActive && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]"></div>}
                </button>
              );
            })}

            {overflowTabs.length > 0 && (
              <button
                onClick={() => { resumeAudioContext(); playSound('click'); setShowMoreModal(true); }}
                className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative flex-1 min-w-0 px-1 ${isMoreActive ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
              >
                <div className={`transition-all duration-300 relative ${isMoreActive ? 'text-emerald-400' : 'text-white'}`}>
                  {Icons.more}
                  {starredIds.size > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                  )}
                </div>
                <span className={`text-[8px] font-bold uppercase tracking-tight ${isMoreActive ? 'text-white' : 'text-slate-300'}`}>More</span>
                {isMoreActive && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]"></div>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* MORE MODAL */}
      {mounted && showMoreModal && createPortal(
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-xl no-print"
          onClick={() => { playSound('click'); setShowMoreModal(false); }}
        >
          <div
            className={`bg-white w-full max-w-3xl ${UI_THEME.radius.modal} shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 sm:px-7 sm:py-5 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-black uppercase tracking-tighter text-slate-900 leading-none">All Modules</h3>
              </div>
              <button
                onClick={() => { playSound('click'); setShowMoreModal(false); }}
                className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-all border border-slate-100 active:scale-90 shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-5 sm:px-8 sm:py-6 space-y-7">

              {/* ── Favorites ── */}
              {starredOverflow.length > 0 && (
                <section className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Favorites</span>
                    </div>
                    <div className="h-px bg-amber-100 flex-1" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {starredOverflow.map(item => renderTile(item))}
                  </div>
                </section>
              )}

              {/* ── Category groups ── */}
              {CATEGORY_ORDER.map(cat => {
                const catTabs = overflowTabs.filter(t => t.category === cat && !starredIds.has(t.id));
                if (catTabs.length === 0) return null;

                const catColor: Record<string, string> = {
                  Finance:  'text-emerald-600',
                  Reports:  'text-indigo-500',
                  People:   'text-violet-500',
                  Branches: 'text-amber-600',
                  System:   'text-slate-400',
                };

                return (
                  <section key={cat} className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${catColor[cat] ?? 'text-slate-400'}`}>{cat}</span>
                      <div className="h-px bg-slate-100 flex-1" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                      {catTabs.map(item => renderTile(item))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
