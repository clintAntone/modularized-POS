import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Branch, Transaction, Expense, Service, AuditLog, SalesReport, Employee, Attendance, UserRole } from '../../types';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { UI_THEME } from '../../constants/ui_designs';

type AdminTab = 'network' | 'catalogs' | 'sales_hub' | 'analytics' | 'employees' | 'archive' | 'settings' | 'audit' | 'how_to' | 'backfill' | 'expenses' | 'attendance' | 'payroll' | 'requests' | 'remittances' | 'bills';

interface SuperAdminNavbarProps {
  activeTab: AdminTab;
  onTabChange: (id: AdminTab) => void;
  employees?: Employee[];
  isSticky?: boolean;
  allowedTabs?: string[]; // undefined = all tabs (superadmin)
}

const Icons = {
  live: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2m-4-10v2m0 12v2m10-10h-2M4 12H2"/></svg>,
  analytics: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
  reports: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6m-4 5H8m8 4H8m2-8H8"/></svg>,
  nodes: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  staff: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8zm14-2v2m-3-1h6"/></svg>,
  audit: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4m0 4h.01"/></svg>,
  catalogs: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  expenses: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
  settings: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 01-2-2 2 2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  how_to: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>,
  external_portal: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  more: <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  requests: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>,
};

export const SuperAdminNavbar: React.FC<SuperAdminNavbarProps> = ({ activeTab, onTabChange, employees = [], isSticky = true, allowedTabs }) => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  const resetRequestCount = useMemo(() => 
    employees.filter(e => e.requestReset).length
  , [employees]);

  const pendingRequestsCount = useMemo(() => 
    // We'll pass this in or fetch it. For now, let's assume we might need it.
    0 
  , []);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const allTabRegistry = useMemo(() => [
    // PRIORITY TABS
    { id: 'sales_hub', label: 'Live', icon: Icons.live, desc: 'Network Stream', color: 'bg-emerald-50 text-emerald-600', category: 'Operations', adminOnly: false },
    { id: 'archive', label: 'Reports', icon: Icons.reports, desc: 'Daily History', color: 'bg-slate-200 text-slate-500', category: 'Operations', adminOnly: false },
    { id: 'employees', label: 'Employees', icon: Icons.staff, desc: 'Staff Master', color: 'bg-indigo-50 text-indigo-600', category: 'Management', adminOnly: false },
    { id: 'attendance', label: 'Attendance', icon: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>, desc: 'Clock-in Logs', color: 'bg-emerald-50 text-emerald-600', category: 'Operations', adminOnly: false },
    { id: 'network', label: 'Branches', icon: Icons.nodes, desc: 'Branch Control', color: 'bg-slate-50 text-slate-600', category: 'Management', adminOnly: false },
    { id: 'catalogs', label: 'Catalogs', icon: Icons.catalogs, desc: 'Service Groups', color: 'bg-emerald-50 text-emerald-600', category: 'Management', adminOnly: false },
    { id: 'backfill', label: 'Backfill', icon: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>, desc: 'Mass Data Entry', color: 'bg-emerald-50 text-emerald-600', category: 'Operations', adminOnly: false },

    // OTHER TABS (Moved to More)
    { id: 'bills', label: 'Bills', icon: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>, desc: 'Monthly Bills', color: 'bg-indigo-50 text-indigo-600', category: 'Operations', adminOnly: false },
    { id: 'remittances', label: 'Remittances', icon: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.407 2.67 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.407-2.67-1M12 16v1m4-12H8a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2z"/></svg>, desc: 'Weekly Payouts', color: 'bg-emerald-50 text-emerald-600', category: 'Operations', adminOnly: false },
    { id: 'requests', label: 'Approvals', icon: Icons.requests, desc: 'Pending Requests', color: 'bg-amber-50 text-amber-600', category: 'Operations', adminOnly: false },
    { id: 'payroll', label: 'Payroll', icon: <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>, desc: 'Network Payouts', color: 'bg-emerald-50 text-emerald-600', category: 'Operations', adminOnly: false },
    { id: 'expenses', label: 'Expenses', icon: Icons.expenses, desc: 'Global Ledger', color: 'bg-rose-50 text-rose-600', category: 'Operations', adminOnly: false },
    { id: 'analytics', label: 'Analytics', icon: Icons.analytics, desc: 'Performance Heatmaps', color: 'bg-indigo-50 text-indigo-600', category: 'System', adminOnly: false },
    { id: 'audit', label: 'Audit', icon: Icons.audit, desc: 'Security Registry', color: 'bg-rose-50 text-rose-600', category: 'System', adminOnly: false },
    { id: 'how_to', label: 'SOP', icon: Icons.how_to, desc: 'Admin Manual', color: 'bg-slate-100 text-slate-600', category: 'System', adminOnly: false },
    { id: 'settings', label: 'Settings', icon: Icons.settings, desc: 'Core Settings', color: 'bg-slate-900 text-white', category: 'System', adminOnly: false },
    { id: 'portal_users', label: 'Portal Users', icon: Icons.external_portal, desc: 'User Accounts', color: 'bg-slate-100 text-slate-600', category: 'System', adminOnly: true },
  ], []);

  const adminTabRegistry = useMemo(() => {
    if (allowedTabs) {
      // Portal user: only show explicitly permitted tabs (no admin-only tabs)
      return allTabRegistry.filter(t => !t.adminOnly && allowedTabs.includes(t.id));
    }
    // Superadmin: show all tabs
    return allTabRegistry;
  }, [allTabRegistry, allowedTabs]);

  const groupedTabs = useMemo(() => {
    const groups: Record<string, typeof adminTabRegistry> = {};
    adminTabRegistry.forEach(tab => {
      const cat = tab.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tab);
    });
    return groups;
  }, [adminTabRegistry]);

  const { visibleTabs, overflowTabs, isMoreActive } = useMemo(() => {
    const priorityIds = ['sales_hub', 'archive', 'employees', 'attendance', 'network', 'catalogs', 'backfill', 'remittances', 'bills', 'requests', 'payroll'];

    // How many tabs fit before we need a "More" button
    let capacity = 4;  // mobile fallback (≥480px)
    if (windowWidth >= 1536) capacity = 14;
    else if (windowWidth >= 1280) capacity = 11;
    else if (windowWidth >= 1024) capacity = 9;
    else if (windowWidth >= 768)  capacity = 7;
    else if (windowWidth >= 640)  capacity = 5;

    let visible: typeof adminTabRegistry;
    if (windowWidth < 480) {
      // Very small mobile: 3 fixed tabs
      visible = adminTabRegistry.filter(t => priorityIds.slice(0, 3).includes(t.id));
    } else if (windowWidth < 640) {
      // Mobile: 4 tabs
      visible = adminTabRegistry.filter(t => priorityIds.slice(0, 4).includes(t.id));
    } else {
      // Tablet/Desktop: fill up to capacity, reserve 1 slot for "More" if there's overflow
      const allPriority = adminTabRegistry.filter(t => priorityIds.includes(t.id));
      const others = adminTabRegistry.filter(t => !priorityIds.includes(t.id));
      const visibleCount = others.length > 0
        ? Math.min(allPriority.length, capacity - 1)
        : Math.min(allPriority.length, capacity);
      visible = allPriority.slice(0, visibleCount);
    }

    const visibleIds = new Set(visible.map(t => t.id));
    const overflow = adminTabRegistry.filter(t => !visibleIds.has(t.id));
    const moreActive = overflow.some(t => t.id === activeTab);

    return { visibleTabs: visible, overflowTabs: overflow, isMoreActive: moreActive };
  }, [adminTabRegistry, activeTab, windowWidth]);

  const handleTabClick = (id: string) => {
    resumeAudioContext();
    playSound('click');
    onTabChange(id as AdminTab);
    setShowMoreModal(false);
  };

  if (!mounted) return null;

  return (
      <>
        {windowWidth >= 640 ? (
          <nav className={`bg-slate-800 border-b border-white/5 no-print ${isSticky ? 'sticky top-[72px] sm:top-20' : ''} z-[900] shadow-lg w-full`}>
            <div className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} flex items-center h-20`}>
              <div className="flex items-center gap-1 lg:gap-2">
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
                      {isActive && <div className="absolute -bottom-1 left-4 right-4 h-[2px] bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>}
                    </button>
                  );
                })}

                {overflowTabs.length > 0 && (
                  <button
                    onClick={() => { resumeAudioContext(); playSound('click'); setShowMoreModal(true); }}
                    className={`relative flex items-center gap-2 px-3 lg:px-4 py-2.5 font-semibold text-[10px] lg:text-[11px] uppercase transition-all duration-200 shrink-0 group rounded-xl ${isMoreActive ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
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
          /* MOBILE NAV - REFINED WITH MORE BUTTON */
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] no-print w-full px-4">
            <div className="bg-slate-800/95 backdrop-blur-2xl px-2 py-3 rounded-[32px] shadow-[0_15px_45px_-5px_rgba(0,0,0,0.5)] ring-1 ring-white/10 border border-white/5 flex items-center justify-around transition-all duration-500">
              {visibleTabs.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative shrink-0 min-w-[56px] ${isActive ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
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
                    </div>
                    <span className={`text-[8px] font-bold uppercase tracking-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>{item.label}</span>
                    {isActive && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981] text-emerald-400"></div>}
                  </button>
                );
              })}

              {overflowTabs.length > 0 && (
                <button
                  onClick={() => { resumeAudioContext(); playSound('click'); setShowMoreModal(true); }}
                  className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative shrink-0 min-w-[56px] ${isMoreActive ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
                >
                  <div className={`transition-all duration-300 ${isMoreActive ? 'text-emerald-400' : 'text-white'}`}>{Icons.more}</div>
                  <span className={`text-[8px] font-bold uppercase tracking-tight ${isMoreActive ? 'text-white' : 'text-slate-300'}`}>More</span>
                  {isMoreActive && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981] text-emerald-400"></div>}
                </button>
              )}
            </div>
          </div>
        )}

        {mounted && showMoreModal && createPortal(
            <div className="fixed inset-0 z-[1100] flex items-center justify-center p-2 sm:p-6 bg-slate-950/90 backdrop-blur-xl no-print transition-opacity duration-200">
              <div className={`bg-white ${UI_THEME.radius.modal} w-[96vw] sm:w-[92vw] sm:max-w-4xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative transition-transform duration-200 max-h-[96vh] sm:max-h-full overflow-y-auto no-scrollbar border border-white/10 flex flex-col`}>

                <div className="sticky top-0 bg-white/95 backdrop-blur-md z-30 flex justify-between items-center py-4 px-5 sm:py-6 sm:px-12 sm:pt-12 sm:pb-5 border-b border-slate-50 shrink-0">
                  <div className="space-y-0.5 sm:space-y-1">
                    <h3 className="text-lg sm:text-2xl font-bold uppercase tracking-tight text-slate-900">More options</h3>
                    <p className="text-[8px] sm:text-[10px] font-medium uppercase tracking-widest text-slate-400 opacity-50">Extended Global Branch Operations</p>
                  </div>
                  <button
                      onClick={() => { playSound('click'); setShowMoreModal(false); }}
                      className="p-2 sm:p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-all border border-slate-100 shadow-sm active:scale-90"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-12 sm:pt-8 space-y-8 sm:space-y-12">
                  {['Operations', 'Management', 'System'].map(cat => {
                    const catTabs = overflowTabs.filter(t => t.category === cat);
                    if (catTabs.length === 0) return null;
                    return (
                      <div key={cat} className="space-y-4">
                        <div className="flex items-center gap-4">
                          <h4 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.3em] whitespace-nowrap">{cat}</h4>
                          <div className="h-px bg-slate-100 w-full"></div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 sm:gap-4">
                          {catTabs.map(item => (
                            <button
                              key={item.id}
                              onClick={() => handleTabClick(item.id)}
                              style={{ transform: 'translateZ(0)' }}
                              className={`p-4 sm:p-8 ${UI_THEME.radius.card} border text-left flex flex-col justify-between transition-colors duration-200 group relative overflow-hidden min-h-[100px] sm:min-h-[140px] sm:col-span-2 transform-gpu ${activeTab === item.id ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-100 hover:border-emerald-200 hover:shadow-md bg-white'}`}
                            >
                              <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-inner mb-3 sm:mb-4 shrink-0 ${item.color}`}>
                                {item.icon}
                                {item.id === 'employees' && resetRequestCount > 0 && (
                                  <div className="absolute top-2 right-2 flex items-center justify-center">
                                    <span className="relative flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600 border border-white"></span>
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <h4 className="text-[11px] sm:text-base font-semibold text-slate-900 uppercase tracking-widest leading-none mb-1 group-hover:text-emerald-700 transition-colors duration-200">{item.label}</h4>
                                <p className="text-[8px] sm:text-[10px] font-medium uppercase tracking-widest text-slate-400 opacity-60 truncate">{item.desc}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
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