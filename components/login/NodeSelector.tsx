import React, { useMemo, useEffect, useState } from 'react';
import { Branch } from '../../types';
import { playSound } from '../../lib/audio';
import { DeveloperSection } from '../dashboard/sections/DeveloperSection';
import { UI_THEME } from '../../constants/ui_designs';

interface NodeSelectorProps {
  branches: Branch[];
  searchTerm: string;
  onSearch: (term: string) => void;
  onSelect: (id: string) => void;
  logo: string | null;
  version: string | null;
  appName?: string;
  connectionError?: any;
  isAuthenticating?: boolean;
}

const RECENT_KEY = 'hilot_core_recent_nodes_v1';

export const NodeSelector: React.FC<NodeSelectorProps> = ({ 
  branches, searchTerm, onSearch, onSelect, logo, version, appName = "Hilot Center - Core", connectionError,
  isAuthenticating
}) => {
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [showCredits, setShowCredits] = useState(false);

  // Load recents on mount
  useEffect(() => {
    const saved = localStorage.getItem(RECENT_KEY);
    if (saved) {
      try { setRecentIds(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  const handleNodeSelect = (id: string) => {
    playSound('click');
    // Update recents
    const nextRecents = [id, ...recentIds.filter(rid => rid !== id)].slice(0, 4);
    setRecentIds(nextRecents);
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecents));
    onSelect(id);
  };

  const nameParts = appName.includes(' - ') ? appName.split(' - ') : [appName, ''];

  // Group branches alphabetically based on their displayed name
  const groupedBranches = useMemo(() => {
    const groups: Record<string, Branch[]> = {};
    const filtered = [...branches].sort((a, b) => {
      if (!a || !b) return 0;
      const nameA = (a.name || '').replace(/BRANCH - /i, '').trim();
      const nameB = (b.name || '').replace(/BRANCH - /i, '').trim();
      return nameA.localeCompare(nameB);
    });

    filtered.forEach(b => {
      const displayName = (b.name || '').replace(/BRANCH - /i, '').trim();
      const firstChar = displayName.charAt(0).toUpperCase();
      const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });

    return Object.entries(groups).sort(([a], [b]) => (a || '').localeCompare(b || ''));
  }, [branches]);

  const recentBranches = useMemo(() => {
    return recentIds
      .map(id => branches.find(b => b.id === id))
      .filter((b): b is Branch => !!b);
  }, [recentIds, branches]);

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #f8fafc 45%, #f0fdf4 100%)' }}
    >
      {/* Background Design Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">

          {/* Subtle dot grid */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, #a5b4fc 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              opacity: 0.18,
            }}
          />

          {/* Large decorative arc — top-right corner */}
          <svg className="absolute -top-32 -right-32 w-[520px] h-[520px] opacity-[0.06]" viewBox="0 0 520 520" fill="none">
            <circle cx="520" cy="0" r="300" stroke="#6366f1" strokeWidth="1.5" fill="none" />
            <circle cx="520" cy="0" r="380" stroke="#6366f1" strokeWidth="1" fill="none" />
            <circle cx="520" cy="0" r="460" stroke="#6366f1" strokeWidth="0.5" fill="none" />
          </svg>

          {/* Large decorative arc — bottom-left corner */}
          <svg className="absolute -bottom-24 -left-24 w-[420px] h-[420px] opacity-[0.05]" viewBox="0 0 420 420" fill="none">
            <circle cx="0" cy="420" r="220" stroke="#10b981" strokeWidth="1.5" fill="none" />
            <circle cx="0" cy="420" r="300" stroke="#10b981" strokeWidth="1" fill="none" />
          </svg>

          {/* Center radial fade — keeps content area clean */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 70% 60% at 50% 35%, rgba(248,250,252,0.85) 30%, transparent 100%)',
            }}
          />
      </div>
      
      {/* Hamburger — top-left (toggles credits) */}
      <button
        onClick={() => { playSound('click'); setShowCredits(prev => !prev); }}
        className="fixed top-5 left-5 z-[1100] w-10 h-10 bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-2xl flex flex-col items-center justify-center gap-[5px] shadow-sm hover:bg-white hover:shadow-md transition-all active:scale-95"
        aria-label="Menu"
      >
        <span className="w-4 h-[1.5px] bg-slate-500 rounded-full" />
        <span className="w-4 h-[1.5px] bg-slate-500 rounded-full" />
        <span className="w-2.5 h-[1.5px] bg-slate-500 rounded-full self-start ml-3" />
      </button>

      <div className="max-w-3xl mx-auto w-full relative z-10 flex-1 flex flex-col pt-10 px-4 sm:px-6">
        {/* BRANDING HEADER */}
         <div className="flex flex-col items-center mb-10">
          <div className="bg-emerald-600 px-3 py-1 rounded-full mb-4 shadow-lg shadow-emerald-200 flex items-center gap-2 border border-emerald-400 relative z-20">
             <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
             <span className="text-[8px] font-semibold text-white uppercase tracking-[0.2em]">Core Active</span>
          </div>
          {logo ? (
            <img 
              src={logo} 
              alt="System Logo" 
              className="w-[20vw] h-[20vw] max-w-[140px] max-h-[140px] min-w-[96px] min-h-[96px] object-contain mb-6 drop-shadow-2xl" 
              style={{ animation: 'spin-stop-flip 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
            />
          ) : null}
          <h1 className="text-[7vw] sm:text-4xl lg:text-5xl font-bold text-slate-950 tracking-tighter uppercase leading-none text-center px-4">
            {nameParts[0]}<br/>{nameParts[1] && <span className="text-emerald-600">{nameParts[1]}</span>}
          </h1>
        </div>

        {/* PERSISTENT COMMAND BAR */}
        <div className="sticky top-4 z-[100] mb-8 w-full space-y-4">
          <div className="relative group">
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => onSearch(e.target.value)} 
              placeholder="Find branch node..." 
              className="w-full py-5 pr-5 pl-14 sm:py-6 sm:pl-16 bg-white/70 backdrop-blur-2xl border-2 border-slate-100 rounded-[28px] font-bold text-sm uppercase tracking-widest text-slate-900 outline-none focus:border-emerald-500 focus:bg-white/90 shadow-xl transition-all placeholder:text-slate-300" 
            />
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 space-y-10 pb-32">
          {connectionError && (
            <div className="bg-red-50 border-2 border-red-200 rounded-[28px] p-6 animate-in slide-in-from-top-4 duration-500">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-red-900 uppercase text-xs tracking-widest mb-1">Connection Interrupted</h3>
                  <p className="text-red-700 text-sm font-medium leading-relaxed">
                    {connectionError.message || 'The system could not establish a secure handshake with the data node. Please verify your network connection or system credentials.'}
                  </p>
                  <div className="mt-4 p-3 bg-red-100/50 rounded-xl">
                    <p className="text-[10px] font-mono text-red-800 break-all">
                      {JSON.stringify(connectionError)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* RECENT SHORTCUTS */}
          {!searchTerm && recentBranches.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="flex items-center gap-3 px-4">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Quick Access</span>
                 <div className="h-px flex-1 bg-slate-200/40"></div>
               </div>
               <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
                 {recentBranches.map(b => (
                   <button 
                     key={b.id}
                     onClick={() => handleNodeSelect(b.id)}
                     className="flex-none w-[140px] bg-slate-900/90 backdrop-blur-md p-5 rounded-[28px] text-left relative overflow-hidden group active:scale-95 transition-all shadow-lg border border-white/5"
                   >
                     <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-xl rounded-full"></div>
                     <div className="relative z-10 space-y-3">
                        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/5">
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <p className="font-bold text-white uppercase text-[11px] leading-tight line-clamp-2">{b.name.replace(/BRANCH - /i, '')}</p>
                     </div>
                   </button>
                 ))}
               </div>
            </div>
          )}

          {/* PORTAL ACCESS */}
          {searchTerm.toLowerCase().trim() === 'portal' && (
            <button
              onClick={() => handleNodeSelect('portal')}
              className="w-full bg-slate-950/90 backdrop-blur-md p-8 rounded-[40px] text-left group transition-all active:scale-[0.98] border border-slate-800 shadow-2xl animate-in zoom-in duration-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-3xl rounded-full"></div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white mb-6 border border-white/5 shadow-xl">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  </div>
                  <h3 className="font-black text-white uppercase text-2xl tracking-tighter mb-1">Central Mainframe</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Administrative Access</p>
                </div>
                <div className="w-16 h-16 rounded-full border-2 border-white/5 flex items-center justify-center group-hover:border-emerald-500/50 transition-colors">
                  <svg className="w-6 h-6 text-white group-hover:text-emerald-500 transition-all group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                </div>
              </div>
            </button>
          )}

          {/* ALPHABETICAL DIRECTORY */}
          <div className="space-y-12">
            {groupedBranches.map(([letter, items]) => (
              <div key={letter} className="space-y-4">
                <div className="sticky top-[100px] z-50 flex items-center gap-4 bg-[#f8fafc]/40 backdrop-blur-md py-2 px-2">
                   <span className="w-10 h-10 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center font-black text-emerald-600 shadow-sm">{letter}</span>
                   <div className="h-px flex-1 bg-slate-300/30"></div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {items.map(b => (
                    <button
                      key={b.id}
                      onClick={() => handleNodeSelect(b.id)}
                      className={`w-full backdrop-blur-md rounded-[20px] text-left transition-all border shadow-sm flex items-center justify-between overflow-hidden relative group cursor-pointer ${
                        b.isEnabled
                          ? 'bg-white/80 border-slate-100/80 hover:shadow-md hover:bg-white hover:border-slate-200 active:scale-[0.99]'
                          : 'bg-white/60 border-amber-100/60 hover:shadow-md hover:bg-white active:scale-[0.99]'
                      }`}
                    >
                      {/* Amber ribbon for inactive */}
                      {!b.isEnabled && (
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400 rounded-r-full" />
                      )}

                      <div className="flex items-center gap-4 min-w-0 flex-1 pl-5 pr-3 py-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
                          b.isEnabled
                            ? 'bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white'
                            : 'bg-amber-50 text-amber-400 group-hover:bg-amber-500 group-hover:text-white'
                        }`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <div className="min-w-0">
                          <h3 className={`font-bold uppercase text-[14px] tracking-tight leading-tight truncate transition-colors ${
                            b.isEnabled ? 'text-slate-900 group-hover:text-slate-700' : 'text-slate-500 group-hover:text-slate-700'
                          }`}>
                            {b.name.replace(/BRANCH - /i, '')}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[8px] font-black text-slate-300 font-mono tracking-widest">TRACE-HC{b.id.slice(0,4).toUpperCase()}</span>
                            {b.isEnabled
                              ? <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.isOpen ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                              : <span className="text-[7px] font-black text-amber-400 uppercase tracking-widest">Inactive</span>
                            }
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pr-4 shrink-0">
                        {!b.isEnabled && (
                          <span className="text-[9px] font-black text-amber-300 group-hover:text-amber-500 transition-colors uppercase tracking-widest hidden sm:block">Inactive</span>
                        )}
                        {b.isEnabled && (
                          <span className="text-[9px] font-black text-slate-300 group-hover:text-slate-500 transition-colors uppercase tracking-widest hidden sm:block">Link Terminal</span>
                        )}
                        <div className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
                          b.isEnabled
                            ? 'border-slate-100 text-slate-300 group-hover:text-slate-600 group-hover:border-slate-200'
                            : 'border-amber-100 text-amber-300 group-hover:text-amber-500 group-hover:border-amber-200'
                        }`}>
                          <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER — just bottom padding spacer for scroll */}
        <div className="h-16" />

        {showCredits && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer"
            onClick={() => setShowCredits(false)}
          >
            <div
              className="w-full max-w-lg max-h-[88vh] overflow-y-auto no-scrollbar cursor-default py-4"
              onClick={(e) => e.stopPropagation()}
            >
              <DeveloperSection version={version} onClose={() => setShowCredits(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};