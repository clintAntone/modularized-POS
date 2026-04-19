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
      .filter((b): b is Branch => !!b && b.isEnabled);
  }, [recentIds, branches]);

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col relative overflow-hidden">
      {/* Screen-Saver Like Animated Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          {/* Subtle Grain Texture Overlay */}
          <div className="absolute inset-0 bg-grain z-10"></div>
          
          {/* Drifting Fluid Blobs */}
          <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-emerald-100/30 blur-[120px] rounded-full animate-float-slow" style={{ animationDuration: '30s' }}></div>
          <div className="absolute bottom-[-15%] right-[-10%] w-[55vw] h-[55vw] bg-indigo-100/30 blur-[150px] rounded-full animate-float-slow" style={{ animationDuration: '35s', animationDelay: '-10s', animationDirection: 'reverse' }}></div>
          <div className="absolute top-[30%] right-[10%] w-[40vw] h-[40vw] bg-emerald-50/40 blur-[100px] rounded-full animate-float-slow" style={{ animationDuration: '40s', animationDelay: '-5s' }}></div>
          <div className="absolute bottom-[20%] left-[5%] w-[35vw] h-[35vw] bg-indigo-50/20 blur-[130px] rounded-full animate-float-slow" style={{ animationDuration: '28s', animationDelay: '-15s' }}></div>
          
          {/* Pulsating Orbs */}
          <div className="absolute top-[10%] left-[20%] w-4 h-4 bg-emerald-400/20 blur-xl rounded-full animate-pulse-slow"></div>
          <div className="absolute bottom-[25%] right-[30%] w-6 h-6 bg-indigo-400/20 blur-xl rounded-full animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      </div>
      
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

                <div className="grid grid-cols-1 gap-2.5">
                  {items.map(b => (
                    <button 
                      key={b.id} 
                      onClick={() => handleNodeSelect(b.id)} 
                      className="w-full bg-white/70 backdrop-blur-md p-5 rounded-[24px] text-left group transition-all border border-white/60 shadow-sm hover:shadow-2xl hover:border-emerald-400 hover:bg-white hover:translate-x-1 active:scale-[0.99] flex items-center justify-between overflow-hidden relative"
                    >
                      <div className="flex items-center gap-5 min-w-0 flex-1">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-inner bg-slate-50 text-slate-300 group-hover:bg-emerald-600 group-hover:text-white shrink-0`}>
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <div className="min-w-0 pr-4">
                          <h3 className="font-bold uppercase text-[15px] tracking-tight leading-tight truncate text-slate-900 group-hover:text-emerald-700 transition-colors">
                            {b.name.replace(/BRANCH - /i, '')}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">TRACE-HC{b.id.slice(0,4).toUpperCase()}</span>
                             <div className={`w-1 h-1 rounded-full ${b.isOpen ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-slate-200'}`}></div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 shrink-0">
                         <span className="text-[9px] font-black text-slate-300 group-hover:text-emerald-500 transition-colors uppercase tracking-widest hidden sm:block">Link Terminal</span>
                         <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-200 group-hover:text-emerald-500 group-hover:border-emerald-100 transition-all">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
                         </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER BUILD INFO */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent z-[110]">
           <div className="max-w-3xl mx-auto flex justify-between items-center">
              <button 
                onClick={() => { playSound('click'); setShowCredits(true); }}
                className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] hover:text-emerald-600 transition-colors pointer-events-auto"
              >
                Node Network v{version || '1.0'}
              </button>
              <div className="flex gap-1 opacity-30">
                 {[1,2,3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-slate-400"></div>)}
              </div>
           </div>
        </div>

        {showCredits && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto no-scrollbar">
              <DeveloperSection version={version} onClose={() => setShowCredits(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};