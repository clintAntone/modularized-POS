import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TabID } from '../BranchManagerDashboard';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { UI_THEME } from '../../constants/ui_designs';
import {
  LayoutGrid,
  TrendingUp,
  Users,
  Clock,
  DollarSign,
  BookOpen,
  Banknote,
  Archive,
  Lock,
  Settings,
  Code,
  HelpCircle,
  Upload,
  MoreHorizontal,
  X,
  UserSearch,

  Flag,
} from 'lucide-react';

interface BranchNavbarProps {
  activeTab: TabID;
  onTabChange: (id: TabID) => void;
  enableShiftTracking: boolean;
  isRelief: boolean;
  showBillsAlert?: boolean;
  vaultEnabled?: boolean;
  hasVaultRecord?: boolean;
}

const c = "w-[19px] h-[19px]";
const Icons = {
  pos: <LayoutGrid className={c} />,
  sales: <TrendingUp className={c} />,
  staff: <Users className={c} />,
  clients: <UserSearch className={c} />,
  expenses: <DollarSign className={c} />,
  expenses_ledger: <BookOpen className={c} />,
  payroll: <Banknote className={c} />,
  archive: <Archive className={c} />,
  vault: <Lock className={c} />,
  settings: <Settings className={c} />,
  developer: <Code className={c} />,
  how_to: <HelpCircle className={c} />,
  backfill: <Upload className={c} />,
  insights: <TrendingUp className={c} />,
  complaints: <Flag className={c} />,
  more: <MoreHorizontal className="w-6 h-6 sm:w-5 sm:h-5" />
};

// Estimate rendered width of a tab button in pixels.
// Each button has: px-3/px-4 padding + icon (19px) + gap (8px) + label text + inter-tab gap (6px)
const estimateTabWidth = (label: string) => 62 + label.length * 9;
const MORE_BUTTON_WIDTH = 96; // "More" button estimated width

export const BranchNavbar: React.FC<BranchNavbarProps> = ({ activeTab, onTabChange, enableShiftTracking, isRelief, showBillsAlert = false, vaultEnabled = false, hasVaultRecord = false }) => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  // containerWidth tracks the actual pixel width of the desktop nav strip
  const [containerWidth, setContainerWidth] = useState(
    typeof window !== 'undefined' ? Math.min(window.innerWidth - 40, 1360) : 1200
  );
  const [showMoreModal, setShowMoreModal] = useState(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('more_starred_tabs') || '[]')); }
    catch { return new Set(); }
  });
  const starLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => setWindowWidth(window.innerWidth), 80);
    };
    // orientationchange fires before the browser updates innerWidth on iOS — use a short delay
    const handleOrientation = () => setTimeout(() => setWindowWidth(window.innerWidth), 200);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, []);

  // Attach ResizeObserver once on mount. windowWidth state handles mobile/desktop
  // breakpoint switching; the RO measures the actual container on desktop.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const masterTabRegistry = useMemo(() => {
    const tabs = [
      { id: 'pos',             label: 'POS',            icon: Icons.pos,             desc: 'Session Registry',    color: 'bg-emerald-50 text-emerald-600', group: 'Operations' },
      { id: 'sales',           label: 'Sales',          icon: Icons.sales,           desc: 'Daily Performance',   color: 'bg-emerald-50 text-emerald-600', group: 'Operations' },
      { id: 'staff',           label: enableShiftTracking ? 'Attendance' : 'Staff', icon: Icons.staff, desc: enableShiftTracking ? 'Shift Tracking' : 'Personnel Roster', color: 'bg-indigo-50 text-indigo-600', group: 'Personnel' },
      { id: 'sales_reports',   label: 'Sales Reports',  icon: Icons.archive,         desc: 'Historical Data',     color: 'bg-indigo-50 text-indigo-600',   group: 'Reports'    },
      { id: 'insights',        label: 'Insights',       icon: Icons.insights,        desc: 'Sales Anomaly Detection', color: 'bg-rose-50 text-rose-600',   group: 'Reports'    },
{ id: 'remittance',      label: 'Remittance',     icon: Icons.payroll,         desc: 'Weekly Distributions',color: 'bg-indigo-50 text-indigo-600',   group: 'Finance'    },
      { id: 'salaries',        label: 'Payroll',        icon: Icons.payroll,         desc: 'Cycle Audit',         color: 'bg-rose-50 text-rose-600',       group: 'Finance'    },
      { id: 'monthly_bills',   label: 'Vault Fund',     icon: Icons.vault,           desc: 'Bills & Vault',       color: 'bg-emerald-50 text-emerald-600', group: 'Finance'    },
      { id: 'clients',         label: 'Clients',        icon: Icons.clients,         desc: 'Client Lookup',       color: 'bg-indigo-50 text-indigo-600',   group: 'Personnel'  },
      { id: 'expense_reports', label: 'Expense Reports',icon: Icons.expenses_ledger, desc: 'Financial History',   color: 'bg-indigo-50 text-indigo-600',   group: 'Reports'    },
      { id: 'backfill',        label: 'Backfill',       icon: Icons.backfill,        desc: 'Request Data Entry',  color: 'bg-amber-50 text-amber-600',     group: 'Reports'    },
      { id: 'complaints',      label: 'Complaints',     icon: Icons.complaints,      desc: 'Employee Reports',    color: 'bg-rose-50 text-rose-600',       group: 'Personnel'  },
      { id: 'how_to',          label: 'How-To',         icon: Icons.how_to,          desc: 'Manual',              color: 'bg-slate-100 text-slate-600',    group: 'System'     },
      { id: 'settings',        label: 'Settings',       icon: Icons.settings,        desc: 'Node Config',         color: 'bg-rose-50 text-rose-600',       group: 'System'     },
    ];
    
    const hidden = new Set<string>();
    if (isRelief) {
      ['settings', 'salaries', 'expense_reports', 'monthly_bills'].forEach(id => hidden.add(id));
    }
    if (!vaultEnabled && !hasVaultRecord) hidden.add('monthly_bills');
    return hidden.size > 0 ? tabs.filter(t => !hidden.has(t.id)) : tabs;
  }, [enableShiftTracking, isRelief]);

  const tabGroups = useMemo(() => {
    const groups: { name: string, tabs: typeof masterTabRegistry }[] = [];
    masterTabRegistry.forEach(tab => {
      let group = groups.find(g => g.name === tab.group);
      if (!group) {
        group = { name: tab.group, tabs: [] };
        groups.push(group);
      }
      group.tabs.push(tab);
    });
    return groups;
  }, [masterTabRegistry]);

  const { visibleTabs, overflowTabs, isMoreActive } = useMemo(() => {
    // Mobile: dynamically fit as many tabs as the pill width allows.
    // Pill available width = screenWidth - 32px (container px-4) - 16px (pill px-2) = screenWidth - 48px.
    // Each button slot is ~60px (min-w-[56px] + justify-around spacing allowance).
    if (windowWidth < 640) {
      const pillWidth = windowWidth - 48;
      // Use 68px slot width so that 360px+ phones (pillWidth=312) fit 4 slots → 3 visible + More.
      // Buttons use flex-1 so they expand evenly regardless of this estimate.
      const slotWidth = 68;
      const maxSlots = Math.floor(pillWidth / slotWidth);
      // If everything fits, skip the MORE button
      if (maxSlots >= masterTabRegistry.length) {
        return { visibleTabs: masterTabRegistry, overflowTabs: [], isMoreActive: false };
      }
      // Reserve 1 slot for the MORE button
      const visibleCount = Math.max(1, maxSlots - 1);
      const visible = masterTabRegistry.slice(0, visibleCount);
      const overflow = masterTabRegistry.slice(visibleCount);
      return { visibleTabs: visible, overflowTabs: overflow, isMoreActive: overflow.some(t => t.id === activeTab) };
    }

    // Desktop: greedily pack tabs until they'd overflow the container.
    // Reserve MORE_BUTTON_WIDTH whenever there are tabs that won't fit.
    let usedWidth = 0;
    let fitCount = 0;

    for (let i = 0; i < masterTabRegistry.length; i++) {
      const tabW = estimateTabWidth(masterTabRegistry[i].label);
      const remainingAfter = masterTabRegistry.length - (i + 1);
      const wouldNeedMore = remainingAfter > 0;
      const projected = usedWidth + tabW + (wouldNeedMore ? MORE_BUTTON_WIDTH : 0);

      if (projected <= containerWidth) {
        usedWidth += tabW;
        fitCount++;
      } else {
        break;
      }
    }

    fitCount = Math.max(1, fitCount); // always show at least one tab

    const visible = masterTabRegistry.slice(0, fitCount);
    const overflow = masterTabRegistry.slice(fitCount);
    return { visibleTabs: visible, overflowTabs: overflow, isMoreActive: overflow.some(t => t.id === activeTab) };
  }, [masterTabRegistry, activeTab, windowWidth, containerWidth]);

  const toggleStar = (id: string) => {
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      try { localStorage.setItem('more_starred_tabs', JSON.stringify([...next])); } catch {}
      return next;
    });
    playSound('click');
  };

  const handleTabClick = (id: string) => {
    resumeAudioContext();
    playSound('click');
    onTabChange(id as TabID);
    setShowMoreModal(false);
  };

  return (
    <>
      {windowWidth >= 640 ? (
        <nav className="bg-white border-b border-slate-100 z-[900] no-print w-full">
          <div ref={containerRef} className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} flex items-center h-12`}>
            <div className="flex items-center gap-0.5">
              {visibleTabs.map(tab => {
                const isActive = activeTab === tab.id;
                const hasBillsAlert = showBillsAlert && tab.id === 'monthly_bills';
                const isSoon = (tab as any).comingSoon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => !isSoon && handleTabClick(tab.id)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 font-medium text-xs transition-all duration-150 shrink-0 rounded-lg ${isSoon ? 'text-slate-300 cursor-not-allowed' : isActive ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
                  >
                    <div className={`transition-all duration-150 ${isActive ? 'text-emerald-600' : ''}`}>{tab.icon}</div>
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {isSoon && (
                      <span className="text-xs font-bold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full leading-none">New</span>
                    )}
                    {hasBillsAlert && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    )}
                    {isActive && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-500 rounded-full"></div>}
                  </button>
                );
              })}

              {overflowTabs.length > 0 && (
                <button
                  onClick={() => { resumeAudioContext(); playSound('click'); setShowMoreModal(true); }}
                  className={`relative flex items-center gap-1.5 px-3 py-2 font-medium text-xs transition-all duration-150 shrink-0 rounded-lg ${isMoreActive ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
                >
                  <div>{Icons.more}</div>
                  <span className="whitespace-nowrap">More</span>
                  {showBillsAlert && overflowTabs.some(t => t.id === 'monthly_bills') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  )}
                  {isMoreActive && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-500 rounded-full"></div>}
                </button>
              )}
            </div>
          </div>
        </nav>
      ) : (
        /* MOBILE NAV */
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] no-print w-full px-4" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
          <div className="bg-white/95 backdrop-blur-xl px-3 py-2 rounded-2xl flex items-center
            shadow-[0_8px_32px_-4px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.06)]">
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab.id;
              const isSoon = (tab as any).comingSoon;
              return (
                <button
                  key={tab.id}
                  onClick={() => !isSoon && handleTabClick(tab.id)}
                  className={`flex flex-col items-center gap-0.5 transition-all duration-300 relative flex-1 min-w-0 py-1 ${isSoon ? 'opacity-30 cursor-not-allowed' : !isActive ? 'opacity-40 active:opacity-70' : ''}`}
                >
                  {/* Icon with active pill background */}
                  <div className={`flex items-center justify-center w-11 h-7 rounded-xl transition-all duration-300 ${isActive ? 'bg-emerald-50' : ''}`}>
                    <div className={`transition-all duration-300 ${isActive ? 'text-emerald-600 scale-110' : 'text-slate-400'}`}>
                      {tab.icon}
                    </div>
                  </div>
                  <span className={`text-xs uppercase tracking-tight transition-all ${isActive ? 'font-bold text-emerald-700' : 'font-medium text-slate-400'}`}>
                    {tab.label}
                  </span>
                  {isSoon && <span className="text-[6px] font-bold uppercase bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">New</span>}
                  {isActive && <div className="w-4 h-0.5 rounded-full bg-emerald-500 mt-0.5" />}
                </button>
              );
            })}

            {overflowTabs.length > 0 && (
              <button
                onClick={() => { resumeAudioContext(); playSound('click'); setShowMoreModal(true); }}
                className={`flex flex-col items-center gap-0.5 transition-all duration-300 relative flex-1 min-w-0 py-1 ${!isMoreActive ? 'opacity-40 active:opacity-70' : ''}`}
              >
                <div className={`flex items-center justify-center w-11 h-7 rounded-xl transition-all duration-300 ${isMoreActive ? 'bg-emerald-50' : ''}`}>
                  <div className="relative">
                    <div className={`transition-all duration-300 ${isMoreActive ? 'text-emerald-600 scale-110' : 'text-slate-400'}`}>{Icons.more}</div>
                    {showBillsAlert && overflowTabs.some(t => t.id === 'monthly_bills') && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </div>
                </div>
                <span className={`text-xs uppercase tracking-tight transition-all ${isMoreActive ? 'font-bold text-emerald-700' : 'font-medium text-slate-400'}`}>More</span>
                {isMoreActive && <div className="w-4 h-0.5 rounded-full bg-emerald-500 mt-0.5" />}
              </button>
            )}
          </div>
        </div>
      )}

      {showMoreModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-6 bg-slate-900/40 backdrop-blur-md no-print animate-in fade-in duration-300">
          <div className={`bg-white ${UI_THEME.radius.modal} w-[96vw] sm:w-[92vw] sm:max-w-2xl shadow-xl relative animate-in zoom-in-95 duration-200 max-h-[96vh] overflow-y-auto no-scrollbar border border-slate-200 flex flex-col`}>
            
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-30 flex justify-between items-center py-4 px-5 sm:py-8 sm:px-12 border-b border-slate-100 shrink-0">
              <div className="space-y-0.5 sm:space-y-1">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">More options</h3>
                <p className="text-xs sm:text-xs font-bold uppercase tracking-wider text-emerald-600 opacity-80">Extended Branch Operations</p>
              </div>
              <button 
                onClick={() => { playSound('click'); setShowMoreModal(false); }} 
                className="p-2 sm:p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all border border-slate-200 shadow-sm active:scale-90"
              >
                <X className="w-5 h-5 sm:w-6 h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-12 sm:pt-8 space-y-10">
              {(() => {
                const renderTile = (item: any) => {
                  const isStarred = starredIds.has(item.id);
                  const isSoon = !!item.comingSoon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !isSoon && handleTabClick(item.id)}
                      onPointerDown={() => {
                        starLongPressRef.current = setTimeout(() => {
                          toggleStar(item.id);
                          starLongPressRef.current = null;
                        }, 600);
                      }}
                      onPointerUp={() => { if (starLongPressRef.current) { clearTimeout(starLongPressRef.current); starLongPressRef.current = null; } }}
                      onPointerLeave={() => { if (starLongPressRef.current) { clearTimeout(starLongPressRef.current); starLongPressRef.current = null; } }}
                      onPointerCancel={() => { if (starLongPressRef.current) { clearTimeout(starLongPressRef.current); starLongPressRef.current = null; } }}
                      style={{ transform: 'translateZ(0)' }}
                      className={`p-4 sm:p-6 ${UI_THEME.radius.card} border text-left flex flex-col justify-between transition-all duration-300 group relative overflow-hidden min-h-[110px] sm:min-h-[140px] sm:col-span-2 transform-gpu select-none ${
                        isSoon
                          ? 'border-slate-200/60 bg-white shadow-sm opacity-50 cursor-not-allowed'
                          : isStarred
                            ? 'border-amber-300 bg-amber-50/40 shadow-[0_0_16px_rgba(251,191,36,0.12)]'
                            : activeTab === item.id
                              ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                              : showBillsAlert && item.id === 'monthly_bills'
                                ? 'border-amber-300 bg-amber-50/50 shadow-[0_0_16px_rgba(251,191,36,0.15)]'
                                : 'border-slate-200/60 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300/60'
                      }`}
                    >
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md mb-3 sm:mb-4 shrink-0 transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                        {item.icon}
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1.5 group-hover:text-emerald-600 transition-colors duration-200">{item.label}</h4>
                        <p className="text-xs sm:text-xs font-medium uppercase tracking-wide text-slate-400 group-hover:text-slate-500 transition-colors">{item.desc}</p>
                      </div>
                      {isStarred && (
                        <div className="absolute top-2.5 right-2.5">
                          <svg className="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        </div>
                      )}
                      {!isStarred && activeTab === item.id && (
                        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
                      )}
                      {showBillsAlert && item.id === 'monthly_bills' && activeTab !== item.id && !isStarred && (
                        <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-amber-400 text-white rounded-full px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          <span className="text-xs font-semibold uppercase tracking-wide">Setup</span>
                        </div>
                      )}
                      {isSoon && (
                        <div className="absolute top-2 right-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-full px-2 py-0.5 shadow-[0_0_10px_rgba(167,139,250,0.5)] animate-pulse">
                          <span className="text-xs font-semibold uppercase tracking-wide">✦ New</span>
                        </div>
                      )}
                    </button>
                  );
                };

                const allOverflow = overflowTabs;
                const starredItems = allOverflow.filter(t => starredIds.has(t.id));

                return (
                  <>
                    {/* ── Favorites section ── */}
                    {starredItems.length > 0 && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-4 px-2">
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3 text-amber-400 fill-amber-400" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            <h5 className="text-xs font-black text-amber-500 uppercase tracking-wide whitespace-nowrap">Favorites</h5>
                          </div>
                          <div className="h-px flex-1 bg-amber-100"></div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
                          {starredItems.map(renderTile)}
                        </div>
                      </div>
                    )}

                    {/* ── Original groups (excluding starred items) ── */}
                    {tabGroups.map(group => {
                      const groupOverflowTabs = group.tabs.filter(t =>
                        overflowTabs.some(ot => ot.id === t.id) && !starredIds.has(t.id)
                      );
                      if (groupOverflowTabs.length === 0) return null;
                      return (
                        <div key={group.name} className="space-y-5">
                          <div className="flex items-center gap-4 px-2">
                            <h5 className="text-xs font-black text-emerald-600 uppercase tracking-wide whitespace-nowrap">{group.name}</h5>
                            <div className="h-px flex-1 bg-slate-100"></div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
                            {groupOverflowTabs.map(renderTile)}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};