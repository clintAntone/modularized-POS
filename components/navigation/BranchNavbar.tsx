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
  UserSearch
} from 'lucide-react';

interface BranchNavbarProps {
  activeTab: TabID;
  onTabChange: (id: TabID) => void;
  enableShiftTracking: boolean;
  isRelief: boolean;
  showBillsAlert?: boolean;
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
  more: <MoreHorizontal className="w-6 h-6 sm:w-5 sm:h-5" />
};

// Estimate rendered width of a tab button in pixels.
// Each button has: px-3/px-4 padding + icon (19px) + gap (8px) + label text + inter-tab gap (6px)
const estimateTabWidth = (label: string) => 62 + label.length * 9;
const MORE_BUTTON_WIDTH = 96; // "More" button estimated width

export const BranchNavbar: React.FC<BranchNavbarProps> = ({ activeTab, onTabChange, enableShiftTracking, isRelief, showBillsAlert = false }) => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  // containerWidth tracks the actual pixel width of the desktop nav strip
  const [containerWidth, setContainerWidth] = useState(
    typeof window !== 'undefined' ? Math.min(window.innerWidth - 40, 1360) : 1200
  );
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => setWindowWidth(window.innerWidth);
    // orientationchange fires before the browser updates innerWidth on iOS — use a short delay
    const handleOrientation = () => setTimeout(() => setWindowWidth(window.innerWidth), 150);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  // Re-attach ResizeObserver every time windowWidth changes so it reconnects
  // when the desktop nav element mounts after crossing the 640px threshold.
  useEffect(() => {
    if (!containerRef.current) return;
    // Read the current width immediately — don't wait for the next resize event
    setContainerWidth(containerRef.current.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [windowWidth]);

  const masterTabRegistry = useMemo(() => {
    const tabs = [
      { id: 'pos',             label: 'POS',            icon: Icons.pos,             desc: 'Session Registry',    color: 'bg-emerald-50 text-emerald-600', group: 'Operations' },
      { id: 'sales',           label: 'Sales',          icon: Icons.sales,           desc: 'Daily Performance',   color: 'bg-emerald-50 text-emerald-600', group: 'Operations' },
      { id: 'staff',           label: 'Staff',          icon: Icons.staff,           desc: 'Personnel Roster',    color: 'bg-indigo-50 text-indigo-600',   group: 'Personnel'  },
      { id: 'sales_reports',   label: 'Sales Reports',  icon: Icons.archive,         desc: 'Historical Data',     color: 'bg-indigo-50 text-indigo-600',   group: 'Reports'    },
      { id: 'remittance',      label: 'Remittance',     icon: Icons.payroll,         desc: 'Weekly Distributions',color: 'bg-indigo-50 text-indigo-600',   group: 'Finance'    },
      { id: 'salaries',        label: 'Payroll',        icon: Icons.payroll,         desc: 'Cycle Audit',         color: 'bg-rose-50 text-rose-600',       group: 'Finance'    },
      { id: 'monthly_bills',   label: 'Monthly Bills',  icon: Icons.vault,           desc: 'Settle Dues',         color: 'bg-rose-50 text-rose-600',       group: 'Finance'    },
      { id: 'clients',         label: 'Clients',        icon: Icons.clients,         desc: 'Client Lookup',       color: 'bg-indigo-50 text-indigo-600',   group: 'Personnel'  },
      { id: 'expense_reports', label: 'Expense Reports',icon: Icons.expenses_ledger, desc: 'Financial History',   color: 'bg-indigo-50 text-indigo-600',   group: 'Reports'    },
      { id: 'backfill',        label: 'Backfill',       icon: Icons.backfill,        desc: 'Request Data Entry',  color: 'bg-amber-50 text-amber-600',     group: 'Reports'    },
      { id: 'how_to',          label: 'How-To',         icon: Icons.how_to,          desc: 'Manual',              color: 'bg-slate-100 text-slate-600',    group: 'System'     },
      { id: 'settings',        label: 'Settings',       icon: Icons.settings,        desc: 'Node Config',         color: 'bg-rose-50 text-rose-600',       group: 'System'     },
    ];
    
    if (isRelief) {
      const restrictedTabs = ['settings', 'salaries', 'expense_reports', 'monthly_bills'];
      return tabs.filter(t => !restrictedTabs.includes(t.id));
    }
    return tabs;
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
    // Mobile: always show a fixed set in the bottom nav
    if (windowWidth < 640) {
      const mobileVisibleIds = ['pos', 'sales', 'staff'];
      const visible = masterTabRegistry.filter(t => mobileVisibleIds.includes(t.id));
      const overflow = masterTabRegistry.filter(t => !mobileVisibleIds.includes(t.id));
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

  const handleTabClick = (id: string) => {
    resumeAudioContext();
    playSound('click');
    onTabChange(id as TabID);
    setShowMoreModal(false);
  };

  if (!mounted) return null;

  return (
    <>
      {windowWidth >= 640 ? (
        <nav className="bg-slate-800 border-b border-white/5 z-[900] shadow-lg no-print w-full">
          <div ref={containerRef} className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} flex items-center h-20`}>
            <div className="flex items-center gap-1 lg:gap-2">
              {visibleTabs.map(tab => {
                const isActive = activeTab === tab.id;
                const hasBillsAlert = showBillsAlert && tab.id === 'monthly_bills';
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`relative flex items-center gap-2 px-3 lg:px-4 py-2.5 font-semibold text-[10px] lg:text-[11px] uppercase transition-all duration-200 shrink-0 group rounded-xl ${isActive ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <div className={`transition-all duration-200 ${isActive ? 'scale-110 text-emerald-400' : 'group-hover:text-emerald-300'}`}>{tab.icon}</div>
                    <span className={`tracking-widest whitespace-nowrap transition-opacity duration-200 opacity-80 group-hover:opacity-100 ${isActive ? 'opacity-100' : ''}`}>
                      {tab.label}
                    </span>
                    {hasBillsAlert && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] animate-pulse shrink-0" />
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
                  {showBillsAlert && overflowTabs.some(t => t.id === 'monthly_bills') && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] animate-pulse shrink-0" />
                  )}
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
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button 
                  key={tab.id} 
                  onClick={() => handleTabClick(tab.id)}
                  className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative shrink-0 min-w-[56px] ${isActive ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
                >
                  <div className={`transition-all duration-300 ${isActive ? 'text-emerald-400' : 'text-white'}`}>{tab.icon}</div>
                  <span className={`text-[8px] font-bold uppercase tracking-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>{tab.label}</span>
                  {isActive && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]"></div>}
                </button>
              );
            })}

            {overflowTabs.length > 0 && (
              <button
                onClick={() => { resumeAudioContext(); playSound('click'); setShowMoreModal(true); }}
                className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative shrink-0 min-w-[56px] ${isMoreActive ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
              >
                <div className="relative">
                  <div className={`transition-all duration-300 ${isMoreActive ? 'text-emerald-400' : 'text-white'}`}>{Icons.more}</div>
                  {showBillsAlert && overflowTabs.some(t => t.id === 'monthly_bills') && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)] animate-pulse" />
                  )}
                </div>
                <span className={`text-[8px] font-bold uppercase tracking-tight ${isMoreActive ? 'text-white' : 'text-slate-300'}`}>More</span>
                {isMoreActive && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]"></div>}
              </button>
            )}
          </div>
        </div>
      )}

      {mounted && showMoreModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-6 bg-slate-900/40 backdrop-blur-md no-print animate-in fade-in duration-300">
          <div className={`bg-white ${UI_THEME.radius.modal} w-[96vw] sm:w-[92vw] sm:max-w-4xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] relative animate-in zoom-in-95 duration-200 max-h-[96vh] sm:max-h-full overflow-y-auto no-scrollbar border border-slate-200 flex flex-col`}>
            
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-30 flex justify-between items-center py-4 px-5 sm:py-8 sm:px-12 border-b border-slate-100 shrink-0">
              <div className="space-y-0.5 sm:space-y-1">
                <h3 className="text-lg sm:text-2xl font-black uppercase tracking-tighter text-slate-900">More options</h3>
                <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 opacity-80">Extended Branch Operations</p>
              </div>
              <button 
                onClick={() => { playSound('click'); setShowMoreModal(false); }} 
                className="p-2 sm:p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all border border-slate-200 shadow-sm active:scale-90"
              >
                <X className="w-5 h-5 sm:w-6 h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-12 sm:pt-8 space-y-10">
              {tabGroups.map(group => {
                const groupOverflowTabs = group.tabs.filter(t => overflowTabs.some(ot => ot.id === t.id));
                if (groupOverflowTabs.length === 0) return null;
                
                return (
                  <div key={group.name} className="space-y-5">
                    <div className="flex items-center gap-4 px-2">
                      <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.4em] whitespace-nowrap">{group.name}</h5>
                      <div className="h-px flex-1 bg-slate-100"></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
                      {groupOverflowTabs.map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleTabClick(item.id)}
                          style={{ transform: 'translateZ(0)' }}
                          className={`p-4 sm:p-6 ${UI_THEME.radius.card} border text-left flex flex-col justify-between transition-all duration-300 group relative overflow-hidden min-h-[110px] sm:min-h-[140px] sm:col-span-2 transform-gpu ${activeTab === item.id ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : showBillsAlert && item.id === 'monthly_bills' ? 'border-amber-300 bg-amber-50/50 shadow-[0_0_16px_rgba(251,191,36,0.15)]' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 bg-slate-50/50'}`}
                        >
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg mb-3 sm:mb-4 shrink-0 transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                            {item.icon}
                          </div>
                          <div>
                            <h4 className="text-[11px] sm:text-[13px] font-black text-slate-900 uppercase tracking-widest leading-none mb-1.5 group-hover:text-emerald-600 transition-colors duration-200">{item.label}</h4>
                            <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-slate-500 transition-colors">{item.desc}</p>
                          </div>
                          {activeTab === item.id && (
                            <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
                          )}
                          {showBillsAlert && item.id === 'monthly_bills' && activeTab !== item.id && (
                            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-amber-400 text-white rounded-full px-2 py-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              <span className="text-[7px] font-black uppercase tracking-widest">Setup</span>
                            </div>
                          )}
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