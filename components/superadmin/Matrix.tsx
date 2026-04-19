import React, { useState, useMemo } from 'react';
import { CatalogGroup } from './ServiceCatalog';
import { resumeAudioContext } from '../../lib/audio';

type SortField = 'name' | 'duration' | 'price' | 'catalogName';
type SortOrder = 'asc' | 'desc';

export const GlobalServicesMatrix: React.FC<{ catalogs: CatalogGroup[] }> = ({ catalogs }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('catalogName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterType, setFilterType] = useState<'all' | 'dual' | 'high_value' | 'bonesetter_only'>('all');
  
  const handleSort = (field: SortField) => {
    resumeAudioContext();
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const allServices = useMemo(() => {
    const list: any[] = [];
    catalogs.forEach(cat => {
      cat.services.forEach(srv => {
        const effectiveRole = srv.primaryRole || 'THERAPIST';
        
        // FIX: Map strictly by Lead/Support status instead of hard-mapping role to column
        list.push({ 
          ...srv, 
          catalogName: cat.name,
          role: effectiveRole,
          leadPayout: { 
            val: srv.commissionValue, 
            type: srv.commissionType,
            role: effectiveRole
          },
          supportPayout: { 
            val: srv.secondaryCommissionValue || 0, 
            type: srv.secondaryCommissionType,
            role: effectiveRole === 'THERAPIST' ? 'BONESETTER' : 'THERAPIST'
          }
        });
      });
    });

    let filtered = list;
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(term) || s.catalogName.toLowerCase().includes(term));
    }

    if (filterType === 'dual') filtered = filtered.filter(s => s.isDualProvider);
    else if (filterType === 'high_value') filtered = filtered.filter(s => Number(s.price) >= 1000);
    else if (filterType === 'bonesetter_only') filtered = filtered.filter(s => s.role === 'BONESETTER');

    return filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      let comparison = 0;
      if (typeof aVal === 'string') comparison = (aVal || '').localeCompare(bVal || '');
      else comparison = (aVal as number) - (bVal as number);
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [catalogs, search, sortField, sortOrder, filterType]);

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return (
      <svg className="w-3 h-3 opacity-20 ml-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
    );
    return (
      <svg className={`w-3.5 h-3.5 ml-2 text-emerald-500 transition-transform duration-300 shrink-0 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-[1400px] mx-auto pb-32 px-4">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-1 border-b border-slate-200 pb-6">
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Network Pricing & Commission Matrix</p>
          <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">Master service registry synchronization</p>
        </div>
        <div className="hidden md:flex gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-emerald-600"></span> Therapist</span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-indigo-600"></span> Specialist</span>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
         <div className="relative flex-1 group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input 
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter catalog..."
              className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm uppercase tracking-wider outline-none focus:border-emerald-500 transition-all shadow-sm placeholder:text-slate-300"
            />
         </div>
         <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 overflow-x-auto no-scrollbar shrink-0 border border-slate-200/50 shadow-inner">
           {['all', 'dual', 'high_value', 'bonesetter_only'].map((id) => (
             <button
               key={id} onClick={() => { setFilterType(id as any); resumeAudioContext(); }}
               className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filterType === id ? 'bg-white text-slate-900 shadow-md border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
             >
               {id.replace('_', ' ')}
             </button>
           ))}
         </div>
      </div>

      {/* MOBILE LIST VIEW */}
      <div className="md:hidden space-y-4">
        {allServices.length > 0 ? allServices.map((srv, idx) => {
          const leadRole = srv.leadPayout.role;
          const supportRole = srv.supportPayout.role;

          return (
            <div key={`${srv.id}-${idx}`} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="font-bold text-slate-900 uppercase text-sm tracking-tight">{srv.name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{srv.catalogName}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 text-base tabular-nums">₱{Number(srv.price).toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{srv.duration}m</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Lead ({leadRole})</p>
                  <div className={`text-xs font-bold tabular-nums px-3 py-1.5 rounded-xl border inline-block ${
                    leadRole === 'THERAPIST' 
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-100' 
                      : 'text-indigo-700 bg-indigo-50 border-indigo-100'
                  }`}>
                    {srv.leadPayout.type === 'percentage' ? `${srv.leadPayout.val}%` : `₱${srv.leadPayout.val}`}
                  </div>
                </div>
                {srv.isDualProvider && (
                  <div className="space-y-1.5 text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Support ({supportRole})</p>
                    <div className={`text-xs font-bold tabular-nums px-3 py-1.5 rounded-xl border inline-block ${
                      supportRole === 'THERAPIST' 
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-100' 
                        : 'text-indigo-700 bg-indigo-50 border-indigo-100'
                    }`}>
                      {srv.supportPayout.type === 'percentage' ? `${srv.supportPayout.val}%` : `₱${srv.supportPayout.val}`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
            <p className="text-[11px] font-bold uppercase text-slate-300 tracking-[0.4em]">No matching units</p>
          </div>
        )}
      </div>

      {/* DESKTOP DATA GRID */}
      <div className="hidden md:block bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left min-w-[1100px] border-collapse table-fixed">
            <thead>
              <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b bg-slate-50/80">
                <th className="w-[32%] px-8 py-6 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center">Designation <SortIndicator field="name" /></div>
                </th>
                <th className="px-4 py-6 w-[12%] text-right cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('price')}>
                  <div className="flex items-center justify-end">Yield (₱) <SortIndicator field="price" /></div>
                </th>
                <th className="px-4 py-6 w-[10%] text-center cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('duration')}>
                  <div className="flex items-center justify-center">Length <SortIndicator field="duration" /></div>
                </th>
                <th className="px-4 py-6 w-[14%] text-center font-black">Lead Payout</th>
                <th className="px-4 py-6 w-[14%] text-center font-black">Support Pay</th>
                <th className="px-8 py-6 w-[18%] text-right cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('catalogName')}>
                  <div className="flex items-center justify-end opacity-60">Source Catalog <SortIndicator field="catalogName" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allServices.length > 0 ? allServices.map((srv, idx) => {
                const leadRole = srv.leadPayout.role;
                const supportRole = srv.supportPayout.role;

                return (
                  <tr key={`${srv.id}-${idx}`} className="hover:bg-slate-50/50 transition-all duration-150 group">
                    <td className="px-8 py-5">
                      <p className="font-bold text-slate-900 uppercase text-[13px] tracking-tight truncate group-hover:text-emerald-700 transition-colors">{srv.name}</p>
                    </td>
                    <td className="px-4 py-5 text-right">
                      <span className="font-bold text-slate-900 text-[15px] tabular-nums">₱{Number(srv.price).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className="font-bold text-slate-400 text-[11px] tabular-nums">{srv.duration}m</span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded border ${
                        leadRole === 'THERAPIST' 
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-100' 
                          : 'text-indigo-700 bg-indigo-50 border-indigo-100'
                      }`}>
                        {srv.leadPayout.type === 'percentage' ? `${srv.leadPayout.val}%` : `₱${srv.leadPayout.val}`}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      {srv.isDualProvider ? (
                        <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded border ${
                          supportRole === 'THERAPIST' 
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-100' 
                            : 'text-indigo-700 bg-indigo-50 border-indigo-100'
                        }`}>
                          {srv.supportPayout.type === 'percentage' ? `${srv.supportPayout.val}%` : `₱${srv.supportPayout.val}`}
                        </span>
                      ) : <span className="text-[10px] font-bold text-slate-200">—</span>}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-60">{srv.catalogName}</span>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="py-32 text-center text-[11px] font-bold uppercase text-slate-300 tracking-[0.4em]">No matching service units found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};