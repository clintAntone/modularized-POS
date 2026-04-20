import React, { useState, useEffect, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Service, Branch, ProviderRole, CommissionType } from '../../types';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { supabase } from '../../lib/supabase';
import { UI_THEME } from '../../constants/ui_designs';
import { Plus, Trash2, Pencil, ChevronLeft, Save, X, FileText, Share2, Search, BookOpen, Settings, AlertTriangle, Check, Download } from 'lucide-react';
import { Pagination } from '../dashboard/sections/common/Pagination';

export interface CatalogGroup {
  id: string;
  name: string;
  services: Service[];
  branchIds: string[];
  can_be_loyalty?: boolean;
}

interface ServiceCatalogProps {
  branches: Branch[];
  catalogs: CatalogGroup[];
  onSave: (catalogs: CatalogGroup[]) => Promise<void>;
  setConfirmState?: (state: any) => void;
}

const CardShell: React.FC<{ 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string;
  isActive?: boolean;
}> = ({ children, onClick, className, isActive }) => (
  <div
    onClick={onClick}
    className={`
      w-full text-left flex flex-col transition-all duration-300 group relative overflow-hidden
      bg-white border shadow-sm cursor-pointer active:scale-[0.98] p-3 sm:p-7 rounded-2xl sm:rounded-[40px]
      ${isActive ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-100 hover:border-emerald-200 hover:shadow-md'}
      ${className}
    `}
  >
    {children}
  </div>
);

export const ServiceCatalog: React.FC<ServiceCatalogProps> = ({ branches, catalogs: initialCatalogs, onSave, setConfirmState }) => {
  const [localCatalogs, setLocalCatalogs] = useState<CatalogGroup[]>(initialCatalogs);
  const [activeCatalogId, setActiveCatalogId] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingServiceData, setEditingServiceData] = useState<Service | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [branchSearch, setBranchSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [globalServiceSearch, setGlobalServiceSearch] = useState('');

  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [editingCatalogName, setEditingCatalogName] = useState('');

  const activeCatalog = useMemo(() => 
    localCatalogs.find(c => c.id === activeCatalogId) || null
  , [localCatalogs, activeCatalogId]);

  const handleStartRename = (e: React.MouseEvent, cat: CatalogGroup) => {
    e.stopPropagation();
    setEditingCatalogId(cat.id);
    setEditingCatalogName(cat.name);
    playSound('click');
  };

  const handleConfirmRename = async () => {
    if (!editingCatalogId) return;
    updateCatalog(editingCatalogId, { name: editingCatalogName.toUpperCase() });
    setEditingCatalogId(null);
    playSound('success');
  };

  const handleCatalogDeleteFromList = (e: React.MouseEvent, cat: CatalogGroup) => {
    e.stopPropagation();
    setConfirmState?.({
      isOpen: true,
      title: 'Erase Catalog Group?',
      message: `Authorize permanent erasure of "${cat.name}". Linked branches will lose these units on next relay.`,
      variant: 'danger',
      onConfirm: () => {
        setLocalCatalogs(prev => prev.filter(c => c.id !== cat.id));
        setHasUnsavedChanges(true);
        if (activeCatalogId === cat.id) setActiveCatalogId(null);
        setConfirmState({ isOpen: false });
        playSound('warning');
      }
    });
  };

  const globalSearchResults = useMemo(() => {
    const q = globalServiceSearch.trim().toLowerCase();
    if (!q) return [];
    const results: { service: Service; catalog: CatalogGroup }[] = [];
    localCatalogs.forEach(cat => {
      (cat.services || []).forEach(s => {
        if (s.name.toLowerCase().includes(q)) results.push({ service: s, catalog: cat });
      });
    });
    return results;
  }, [localCatalogs, globalServiceSearch]);

  const filteredServices = useMemo(() => {
    if (!activeCatalog) return [];
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return activeCatalog.services;
    return activeCatalog.services.filter(s => s.name.toLowerCase().includes(q));
  }, [activeCatalog, serviceSearch]);

  const paginatedServices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredServices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredServices, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredServices.length / itemsPerPage);
  }, [filteredServices]);

  useEffect(() => {
    setCurrentPage(1);
    setServiceSearch('');
  }, [activeCatalogId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [serviceSearch]);

  useEffect(() => {
    setLocalCatalogs(JSON.parse(JSON.stringify(initialCatalogs || [])));
    setHasUnsavedChanges(false);
  }, [initialCatalogs]);

  useEffect(() => {
    if (editingServiceId) {
      if (editingServiceId === 'new') {
        setEditingServiceData({ 
          id: 'new', name: '', price: 0, duration: 60, 
          commissionType: 'fixed' as CommissionType, commissionValue: 0, 
          isDualProvider: false, primaryRole: 'THERAPIST' as ProviderRole,
          secondaryRole: 'BONESETTER' as ProviderRole,
          secondaryCommissionType: 'fixed' as CommissionType,
          secondaryCommissionValue: 0
        });
      } else {
        const srv = activeCatalog?.services.find(s => s.id === editingServiceId);
        if (srv) setEditingServiceData({ ...srv });
      }
    } else {
      setEditingServiceData(null);
    }
  }, [editingServiceId, activeCatalog]);

  const filteredBranches = useMemo(() => {
    const term = branchSearch.toLowerCase().trim();
    if (!term) return branches;
    return branches.filter(b => b.name.toLowerCase().includes(term));
  }, [branches, branchSearch]);

  const updateCatalog = (id: string, updates: Partial<CatalogGroup>) => {
    setLocalCatalogs(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    setHasUnsavedChanges(true);
  };

  const toggleBranchLink = (catalogId: string, branchId: string) => {
    setLocalCatalogs(prev => prev.map(c => {
      if (c.id === catalogId) {
        const ids = c.branchIds || [];
        const nextIds = ids.includes(branchId) 
          ? ids.filter(id => id !== branchId) 
          : [...ids, branchId];
        return { ...c, branchIds: nextIds };
      }
      return c;
    }));
    setHasUnsavedChanges(true);
    playSound('click');
  };

  const handleSaveService = () => {
      if (!activeCatalogId || !editingServiceData || !activeCatalog) return;
      
      const { 
        secondaryRole: _sr, 
        secondaryCommissionType: _sct, 
        secondaryCommissionValue: _scv, 
        ...serviceBase 
      } = editingServiceData;

      const enrichedService = {
        ...serviceBase,
        primaryRole: editingServiceData.primaryRole || 'THERAPIST',
        ...(editingServiceData.isDualProvider ? { 
          secondaryRole: editingServiceData.secondaryRole || 'BONESETTER',
          secondaryCommissionType: editingServiceData.secondaryCommissionType || 'fixed',
          secondaryCommissionValue: editingServiceData.secondaryCommissionValue ?? 0
        } : {}),
        catalogId: activeCatalog.id,
        catalogName: activeCatalog.name
      };

      setLocalCatalogs(prev => prev.map(c => {
          if (c.id === activeCatalogId) {
              if (editingServiceId === 'new') {
                const newService = { ...enrichedService, id: Math.random().toString(36).substr(2, 9) };
                return { ...c, services: [...c.services, newService] };
              } else {
                return {
                  ...c,
                  services: c.services.map(s => s.id === editingServiceId ? enrichedService : s)
                };
              }
          }
          return c;
      }));
      
      setHasUnsavedChanges(true);
      setEditingServiceId(null);
      playSound('success');
  };

  const handleDeleteService = (serviceId: string) => {
    if (!activeCatalogId) return;
    setLocalCatalogs(prev => prev.map(c => {
      if (c.id === activeCatalogId) {
        return { ...c, services: c.services.filter(s => s.id !== serviceId) };
      }
      return c;
    }));
    setHasUnsavedChanges(true);
    playSound('warning');
  };

  const handleGlobalSave = async () => {
    setIsSaving(true);
    resumeAudioContext();
    try {
      // 1. Enforce catalog info on all services in local state before saving
      const enrichedCatalogs = localCatalogs.map(cat => ({
        ...cat,
        services: (cat.services || []).map(s => {
          const { 
            secondaryRole: _sr, 
            secondaryCommissionType: _sct, 
            secondaryCommissionValue: _scv, 
            ...serviceBase 
          } = s;
          
          return {
            ...serviceBase,
            primaryRole: s.primaryRole || 'THERAPIST',
            ...(s.isDualProvider ? { 
              secondaryRole: s.secondaryRole || 'BONESETTER',
              secondaryCommissionType: s.secondaryCommissionType || 'fixed',
              secondaryCommissionValue: s.secondaryCommissionValue ?? 0
            } : {}),
            catalogId: cat.id,
            catalogName: cat.name
          };
        })
      }));

      // 2. Persist to SERVICE_CATALOGS table
      for (const cat of enrichedCatalogs) {
        await supabase.from(DB_TABLES.SERVICE_CATALOGS).upsert({
          [DB_COLUMNS.ID]: cat.id,
          [DB_COLUMNS.NAME]: cat.name,
          [DB_COLUMNS.SERVICES]: cat.services,
          [DB_COLUMNS.BRANCH_IDS]: cat.branchIds,
          [DB_COLUMNS.CAN_BE_LOYALTY]: cat.can_be_loyalty || false,
          [DB_COLUMNS.UPDATED_AT]: new Date().toISOString()
        });
      }

      // 3. Handle Deletions: Remove catalogs that are no longer in the local state
      const initialIds = initialCatalogs.map(c => c.id);
      const currentIds = enrichedCatalogs.map(c => c.id);
      const deletedIds = initialIds.filter(id => !currentIds.includes(id));

      if (deletedIds.length > 0) {
        await supabase.from(DB_TABLES.SERVICE_CATALOGS).delete().in(DB_COLUMNS.ID, deletedIds);
      }

      // 4. Distribute to BRANCHES table with catalog info included
      const branchServiceMap: Record<string, Service[]> = {};
      branches.forEach(b => { branchServiceMap[b.id] = []; });

      enrichedCatalogs.forEach(catalog => {
        (catalog.branchIds || []).forEach(branchId => {
          if (branchServiceMap[branchId]) {
            branchServiceMap[branchId] = [
              ...branchServiceMap[branchId],
              ...(catalog.services || []).map(s => ({
                ...s,
                catalogId: catalog.id,
                catalogName: catalog.name,
                canBeLoyalty: catalog.can_be_loyalty || false
              }))
            ];
          }
        });
      });

      const updatePromises = Object.entries(branchServiceMap).map(([branchId, services]) => {
        return supabase.from(DB_TABLES.BRANCHES).update({ [DB_COLUMNS.SERVICES]: services }).eq(DB_COLUMNS.ID, branchId);
      });
      
      await Promise.all(updatePromises);
      setHasUnsavedChanges(false);
      playSound('success');
      if (onSave) await onSave(enrichedCatalogs);
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCatalogDelete = () => {
    if (!activeCatalog) return;
    setConfirmState?.({
      isOpen: true,
      title: 'Erase Catalog Group?',
      message: `Authorize permanent erasure of "${activeCatalog.name}". Linked branches will lose these units on next relay.`,
      variant: 'danger',
      onConfirm: () => {
        setLocalCatalogs(prev => prev.filter(c => c.id !== activeCatalogId));
        setHasUnsavedChanges(true);
        setActiveCatalogId(null);
        setConfirmState({ isOpen: false });
        playSound('warning');
      }
    });
  };

  const handleExportPDF = () => {
    if (!activeCatalog) return;
    playSound('click');
    
    const doc = new jsPDF();
    const timestamp = new Date().toLocaleString();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(activeCatalog.name, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-400
    doc.text(`Generated on: ${timestamp}`, 14, 30);
    
    const linkedBranches = branches
      .filter(b => (activeCatalog.branchIds || []).includes(b.id))
      .map(b => b.name)
      .join(', ');
      
    if (linkedBranches) {
      doc.setFontSize(9);
      doc.setTextColor(16, 185, 129); // emerald-500
      const splitBranches = doc.splitTextToSize(`Subscribed Branches: ${linkedBranches}`, 180);
      doc.text(splitBranches, 14, 38);
    }

    const tableData = activeCatalog.services.map(s => [
      s.name,
      `${s.duration} mins`,
      `P${s.price.toLocaleString()}`,
      s.commissionType === 'percentage' ? `${s.commissionValue}%` : `P${s.commissionValue}`,
      s.isDualProvider ? (s.secondaryCommissionType === 'percentage' ? `${s.secondaryCommissionValue}%` : `P${s.secondaryCommissionValue}`) : '-'
    ]);

    autoTable(doc, {
      startY: linkedBranches ? 50 : 40,
      head: [['Service Name', 'Duration', 'Price', 'Lead Pay', 'Support Pay']],
      body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 40 },
      styles: { fontSize: 9, cellPadding: 4 }
    });

    doc.save(`${activeCatalog.name.replace(/\s+/g, '_')}_Services.pdf`);
    playSound('success');
  };

  const startNewCatalog = () => {
    const newCat = { id: Math.random().toString(36).substr(2, 9), name: 'NEW CATALOG', services: [], branchIds: [], can_be_loyalty: false };
    setLocalCatalogs([...localCatalogs, newCat]);
    setActiveCatalogId(newCat.id);
    setHasUnsavedChanges(true);
    playSound('click');
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-10 animate-in fade-in duration-300 pb-48 px-2">
      
      {!activeCatalogId && (
        <div className="space-y-10">
          <div className={`bg-white ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print`}>
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Service Catalogs</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master Distribution Control</p>
              </div>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={globalServiceSearch}
                onChange={e => setGlobalServiceSearch(e.target.value)}
                placeholder="Search any service across all catalogs…"
                className="w-full h-10 bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-10 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-emerald-400 focus:bg-white transition-colors placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
              />
              {globalServiceSearch && (
                <button onClick={() => setGlobalServiceSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Global search results */}
          {globalServiceSearch.trim() && (
            <div className="px-4">
              {globalSearchResults.length === 0 ? (
                <div className="bg-white rounded-[28px] border border-slate-100 py-12 text-center">
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No services found matching "{globalServiceSearch}"</p>
                </div>
              ) : (
                <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{globalSearchResults.length} result{globalSearchResults.length !== 1 ? 's' : ''} across {new Set(globalSearchResults.map(r => r.catalog.id)).size} catalog{new Set(globalSearchResults.map(r => r.catalog.id)).size !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
                    {globalSearchResults.map(({ service: s, catalog: cat }) => (
                      <div
                        key={`${cat.id}-${s.id}`}
                        onClick={() => { setActiveCatalogId(cat.id); setGlobalServiceSearch(''); playSound('click'); }}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center text-sm shrink-0">📋</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight truncate group-hover:text-emerald-700 transition-colors">{s.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{cat.name}</p>
                        </div>
                        <div className="shrink-0 text-right space-y-0.5">
                          <p className="text-[11px] font-black text-emerald-600 tabular-nums">₱{s.price.toLocaleString()}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{s.duration}M</p>
                        </div>
                        <div className="shrink-0 text-[9px] font-bold text-slate-300 uppercase tracking-widest group-hover:text-slate-500 transition-colors">
                          <Settings className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4">
            {localCatalogs.map(cat => (
              <CardShell key={cat.id} onClick={() => setActiveCatalogId(cat.id)}>
                <div className="flex flex-col h-full relative">
                  <div className="flex justify-between items-start mb-3 sm:mb-8">
                    <div className="w-9 h-9 sm:w-14 sm:h-14 bg-slate-900 text-emerald-400 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-2xl shadow-xl border border-white/5 transition-transform group-hover:scale-110">📂</div>
                    <div className="flex gap-1.5 sm:gap-2">
                      <button
                        onClick={(e) => handleStartRename(e, cat)}
                        className="p-1.5 sm:p-2 rounded-lg bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-slate-100 shadow-sm active:scale-90"
                      >
                        <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                      <button
                        onClick={(e) => handleCatalogDeleteFromList(e, cat)}
                        className="p-1.5 sm:p-2 rounded-lg bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all border border-slate-100 shadow-sm active:scale-90"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>

                  <h4 className="text-sm sm:text-lg font-bold text-slate-900 uppercase tracking-tight pr-10 mb-1 sm:mb-2 leading-tight">{cat.name}</h4>
                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-6">Unit Distribution Set</p>

                  <div className="mt-auto border-t border-slate-50 pt-3 sm:pt-6 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
                       <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tighter">{(cat.services || []).length} Services</span>
                     </div>
                     <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{(cat.branchIds || []).length} Branches</span>
                  </div>
                </div>
              </CardShell>
            ))}

            <button 
              onClick={startNewCatalog}
              className="border-2 border-dashed border-slate-200 rounded-[32px] sm:rounded-[44px] p-8 sm:p-10 flex flex-col items-center justify-center gap-6 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all group active:scale-95 bg-white/50"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white flex items-center justify-center text-slate-300 group-hover:text-emerald-600 shadow-sm border border-slate-100 transition-all group-hover:scale-110 group-hover:rotate-12">
                <Plus className="w-8 h-8" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-bold text-slate-400 uppercase tracking-tight group-hover:text-emerald-700">Add Core Catalog</p>
                <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">Initialize New Distribution</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {activeCatalog && (
        <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500 px-2 sm:px-4">
           {/* HEADER */}
            <div className={`bg-white ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print`}>
               <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full md:w-auto">
                  <button onClick={() => setActiveCatalogId(null)} className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-all active:scale-90 border border-slate-100 shadow-inner shrink-0">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-3 flex-1 min-w-[120px]">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                         <input 
                           autoFocus
                           className="text-[14px] font-black text-slate-900 uppercase tracking-tighter bg-slate-50 border-b border-emerald-500 outline-none w-full max-w-sm"
                           value={activeCatalog.name}
                           onChange={e => updateCatalog(activeCatalog.id, { name: e.target.value.toUpperCase() })}
                           onBlur={() => setIsRenaming(false)}
                           onKeyDown={e => e.key === 'Enter' && setIsRenaming(false)}
                         />
                      ) : (
                        <div className="flex items-center gap-2 overflow-hidden">
                          <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter truncate leading-none">{activeCatalog.name}</h3>
                          <button onClick={() => setIsRenaming(true)} className="p-1 text-slate-300 hover:text-slate-600 transition-colors shrink-0"><Pencil className="w-3 h-3" /></button>
                        </div>
                      )}
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Catalog Configuration</p>
                    </div>
                  </div>
                  
                  {/* LOYALTY TOGGLE */}
                  <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox"
                          className="sr-only"
                          checked={activeCatalog.can_be_loyalty || false}
                          onChange={e => updateCatalog(activeCatalog.id, { can_be_loyalty: e.target.checked })}
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors duration-300 ${activeCatalog.can_be_loyalty ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${activeCatalog.can_be_loyalty ? 'translate-x-5' : ''}`}></div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest leading-none">Loyalty Reward</span>
                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-1">Eligible for POS Rewards</span>
                      </div>
                    </label>
                  </div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                 <button onClick={handleCatalogDelete} className="h-10 sm:h-12 w-10 sm:w-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-2xl border border-rose-100 hover:bg-rose-100 transition-all shadow-sm active:scale-95 shrink-0">
                    <Trash2 className="w-5 h-5" />
                 </button>
                 <button onClick={() => { setEditingServiceId('new'); playSound('click'); }} className={`h-10 sm:h-12 px-6 rounded-2xl bg-slate-900 text-white flex items-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95 shrink-0 flex-1 sm:flex-none justify-center`}>
                    <Plus className="w-4 h-4" />
                    <span className="font-black">Add Unit</span>
                 </button>
              </div>
           </div>

            <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">
              {/* LEFT: SERVICES TABLE */}
              <div className="flex-1 w-full space-y-4 px-1 no-print">
                <div className="flex flex-col gap-3 px-1 sm:px-2">
                <div className="flex flex-row items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      totalItems={filteredServices.length}
                      itemsPerPage={itemsPerPage}
                    />
                  </div>
                  <button onClick={() => handleExportPDF()} className={`h-14 w-14 sm:w-auto px-0 sm:px-6 rounded-2xl bg-emerald-600 text-white flex items-center justify-center sm:justify-start gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0`}>
                    <Download className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline font-black text-[10px] uppercase tracking-widest">Export Services</span>
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={e => setServiceSearch(e.target.value)}
                    placeholder="Search services…"
                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-10 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-slate-400 focus:bg-white transition-colors placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
                  />
                  {serviceSearch && (
                    <button onClick={() => setServiceSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

                {/* MOBILE CARD VIEW */}
                <div className="sm:hidden space-y-4">
                  {paginatedServices.length > 0 ? paginatedServices.map(srv => (
                    <div key={srv.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 relative overflow-hidden group">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">{srv.name}</h4>
                          <div className="flex items-center gap-2">
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{srv.duration} MINS</span>
                             <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                             <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">₱{srv.price.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingServiceId(srv.id)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 active:scale-90 border border-slate-100">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteService(srv.id)} className="p-2.5 rounded-xl bg-rose-50 text-rose-400 active:scale-90 border border-rose-100">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                        <div className="space-y-1">
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Lead Pay</p>
                          <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-tighter">{srv.commissionType === 'percentage' ? `${srv.commissionValue}%` : `₱${srv.commissionValue}`}</p>
                        </div>
                        {srv.isDualProvider && (
                          <div className="space-y-1">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Support Pay</p>
                            <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-tighter">{srv.secondaryCommissionType === 'percentage' ? `${srv.secondaryCommissionValue}%` : `₱${srv.secondaryCommissionValue}`}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="py-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 opacity-40">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No Services Defined</p>
                    </div>
                  )}
                </div>

                {/* DESKTOP TABLE VIEW */}
                <div className="hidden sm:block bg-white rounded-[32px] sm:rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Service Unit</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Duration</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Market Yield</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Provider Pay</th>
                          <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {paginatedServices.length > 0 ? paginatedServices.map(srv => (
                          <tr key={srv.id} className="hover:bg-slate-50/30 transition-colors group">
                            <td className="px-6 py-5">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 uppercase text-[13px] tracking-tight leading-none">{srv.name}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 sm:hidden">{srv.duration}M</span>
                              </div>
                            </td>
                            <td className="px-6 py-5 hidden sm:table-cell">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest tabular-nums">{srv.duration}M</span>
                            </td>
                            <td className="px-6 py-5">
                              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest whitespace-nowrap">₱{srv.price.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-5 hidden md:table-cell">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Lead:</span>
                                  <span className="text-[10px] font-bold text-emerald-600 tabular-nums">{srv.commissionType === 'percentage' ? `${srv.commissionValue}%` : `₱${srv.commissionValue}`}</span>
                                </div>
                                {srv.isDualProvider && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Support:</span>
                                    <span className="text-[10px] font-bold text-indigo-600 tabular-nums">{srv.secondaryCommissionType === 'percentage' ? `${srv.secondaryCommissionValue}%` : `₱${srv.secondaryCommissionValue}`}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingServiceId(srv.id)} className="p-2 rounded-lg bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-slate-100 shadow-sm active:scale-90">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteService(srv.id)} className="p-2 rounded-lg bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all border border-slate-100 shadow-sm active:scale-90">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={5} className="py-20 text-center opacity-30">
                              <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-slate-400">Empty Distribution Registry</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

             {/* RIGHT: BRANCH SUBSCRIPTION SIDEBAR */}
             <div className="w-full lg:w-96 shrink-0 space-y-6 sm:space-y-8 relative lg:sticky lg:top-10">
                <div className="bg-slate-900 rounded-3xl sm:rounded-[48px] p-5 sm:p-10 shadow-2xl relative overflow-hidden text-white border border-white/5">
                   <div className="absolute top-0 right-0 w-32 sm:w-40 h-32 sm:h-40 bg-emerald-500/10 blur-[90px] rounded-full translate-x-1/4 -translate-y-1/4"></div>
                   <div className="relative z-10 space-y-6 sm:space-y-8">
                      <div className="flex justify-between items-center h-10">
                         <div className="flex flex-col">
                           <h4 className="text-[10px] sm:text-[12px] font-bold uppercase tracking-[0.2em] text-emerald-400 leading-none">Subscribed Branches</h4>
                           <p className="text-[7px] sm:text-[8px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-1.5 sm:mt-2">Active Relay Registry</p>
                         </div>
                         <span className="bg-white/10 px-3 sm:px-4 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold border border-white/5 shadow-inner shrink-0">{(activeCatalog.branchIds || []).length} Branches</span>
                      </div>
                      
                      <div className="relative group">
                         <input 
                           value={branchSearch}
                           onChange={e => setBranchSearch(e.target.value)}
                           placeholder="Filter physical branches..."
                           className="w-full bg-white/5 border border-white/10 rounded-[18px] sm:rounded-[22px] pl-12 sm:pl-14 pr-4 sm:pr-6 py-3.5 sm:py-4 text-[12px] sm:text-sm font-bold uppercase tracking-wide focus:border-emerald-500 outline-none transition-all placeholder:text-white/20 shadow-inner"
                         />
                         <div className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-emerald-500 transition-colors">
                            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                         </div>
                      </div>

                      <div className="space-y-2 min-h-[300px] max-h-[500px] sm:max-h-[600px] overflow-y-auto no-scrollbar pr-1">
                         {filteredBranches.length > 0 ? filteredBranches.map(b => {
                           const isLinked = (activeCatalog.branchIds || []).includes(b.id);
                           return (
                             <button 
                               key={b.id}
                               onClick={() => toggleBranchLink(activeCatalog.id, b.id)}
                               className={`w-full flex items-center justify-between p-4 sm:p-5 rounded-[18px] sm:rounded-[22px] transition-all border group active:scale-[0.97] ${isLinked ? 'bg-emerald-600 border-emerald-500 text-white shadow-xl scale-[1.02]' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                             >
                               <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
                                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isLinked ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-500'}`}>🏢</div>
                                  <span className="font-bold uppercase text-[11px] sm:text-[12px] tracking-tight truncate leading-none">{b.name}</span>
                               </div>
                               {isLinked && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-in zoom-in" />}
                             </button>
                           );
                         }) : (
                           <div className="py-12 sm:py-20 text-center opacity-30">
                              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.4em]">No matching terminals</p>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
             </div>
           </div>
        </div>
      )}

      {/* UNSAVED CHANGES FLOATING BAR */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-24 lg:bottom-12 left-4 right-4 sm:left-6 sm:right-6 z-[400] bg-white/95 backdrop-blur-md border border-amber-200 p-4 sm:p-5 rounded-[28px] sm:rounded-[36px] shadow-[0_30px_70px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom-12 flex items-center justify-center">
          <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-4 px-2 sm:px-6">
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-50 text-amber-500 animate-pulse flex items-center justify-center border border-amber-200 shadow-inner text-lg sm:text-xl shrink-0">⚠️</div>
              <div className="hidden sm:block">
                <p className="text-sm font-bold uppercase text-slate-900 tracking-tight leading-none">Modified Registry Parameters</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Commit to synchronize all branch catalogs</p>
              </div>
              <div className="sm:hidden text-center">
                <p className="text-[10px] font-bold uppercase text-slate-900 leading-tight">Unsaved Registry Changes</p>
              </div>
            </div>
            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
               <button onClick={() => { setLocalCatalogs(JSON.parse(JSON.stringify(initialCatalogs))); setHasUnsavedChanges(false); playSound('warning'); }} className="flex-1 sm:flex-none px-4 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-[10px] sm:text-[11px] uppercase text-slate-400 hover:text-rose-600 transition-colors">Discard</button>
               <button onClick={handleGlobalSave} disabled={isSaving} className="flex-1 sm:flex-none bg-emerald-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-[10px] sm:text-[12px] uppercase tracking-widest shadow-xl shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-4">
                  {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : '⚡'}
                  {isSaving ? 'Synching...' : 'Commit Relay'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* CATALOG RENAME MODAL */}
      {editingCatalogId && (
        <div className="fixed inset-0 z-[1100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <div>
                  <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Rename Catalog</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Identity Modification</p>
               </div>
               <button onClick={() => setEditingCatalogId(null)} className="p-3 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-all active:scale-90 border border-slate-100 shadow-sm">
                  <X className="w-5 h-5" />
               </button>
            </div>
            <div className="p-8 space-y-6">
               <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Catalog Name</label>
                  <input 
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-wide focus:border-emerald-500 outline-none transition-all"
                    value={editingCatalogName}
                    onChange={e => setEditingCatalogName(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handleConfirmRename()}
                  />
               </div>
               <button 
                 onClick={handleConfirmRename}
                 className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-[12px] uppercase tracking-[0.3em] shadow-xl hover:bg-emerald-600 transition-all active:scale-95"
               >
                 Confirm Rename
               </button>
            </div>
          </div>
        </div>
      )}

      {/* SERVICE EDITOR MODAL */}
      {editingServiceId && editingServiceData && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] sm:rounded-[56px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
            <div className="p-8 sm:p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tight">{editingServiceId === 'new' ? 'Initialize Unit' : 'Calibrate Unit'}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Service Specification Hub</p>
               </div>
               <button onClick={() => setEditingServiceId(null)} className="p-4 bg-white rounded-2xl text-slate-400 hover:text-rose-600 transition-all active:scale-90 border border-slate-100 shadow-sm">
                  <X className="w-6 h-6" />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 sm:p-10 space-y-8 no-scrollbar">
               <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Unit Designation</label>
                  <input 
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-wide focus:border-emerald-500 outline-none transition-all"
                    value={editingServiceData.name}
                    onChange={e => setEditingServiceData({ ...editingServiceData, name: e.target.value.toUpperCase() })}
                    placeholder="E.G. SIGNATURE MASSAGE..."
                  />
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Market Yield (₱)</label>
                     <input 
                       type="number"
                       className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold tabular-nums focus:border-emerald-500 outline-none transition-all"
                       value={editingServiceData.price}
                       onChange={e => setEditingServiceData({ ...editingServiceData, price: Number(e.target.value) })}
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Duration (Mins)</label>
                     <input 
                       type="number"
                       className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold tabular-nums focus:border-emerald-500 outline-none transition-all"
                       value={editingServiceData.duration}
                       onChange={e => setEditingServiceData({ ...editingServiceData, duration: Number(e.target.value) })}
                     />
                  </div>
               </div>

               <div className="space-y-6 pt-4 border-t border-slate-50">
                  <div className="flex items-center justify-between">
                     <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Lead Provider Configuration</h4>
                     <select 
                        className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest outline-none"
                        value={editingServiceData.primaryRole}
                        onChange={e => setEditingServiceData({ ...editingServiceData, primaryRole: e.target.value as ProviderRole })}
                     >
                        <option value="THERAPIST">THERAPIST</option>
                        <option value="BONESETTER">BONESETTER</option>
                        <option value="MANAGER">MANAGER</option>
                        <option value="TRAINEE">TRAINEE</option>
                     </select>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Pay Model</label>
                        <select 
                           className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-wide outline-none"
                           value={editingServiceData.commissionType}
                           onChange={e => setEditingServiceData({ ...editingServiceData, commissionType: e.target.value as CommissionType })}
                        >
                           <option value="fixed">FIXED (₱)</option>
                           <option value="percentage">PERCENTAGE (%)</option>
                        </select>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Pay Value</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold tabular-nums focus:border-emerald-500 outline-none transition-all"
                          value={editingServiceData.commissionValue}
                          onChange={e => setEditingServiceData({ ...editingServiceData, commissionValue: Number(e.target.value) })}
                        />
                     </div>
                  </div>
               </div>

               <div className="pt-6 border-t border-slate-50 space-y-6">
                  <label className="flex items-center gap-4 cursor-pointer group">
                     <div className="relative">
                        <input 
                          type="checkbox"
                          className="sr-only"
                          checked={editingServiceData.isDualProvider}
                          onChange={e => {
                            const isDual = e.target.checked;
                            setEditingServiceData({ 
                              ...editingServiceData, 
                              isDualProvider: isDual,
                              ...(isDual ? {
                                secondaryRole: editingServiceData.secondaryRole || 'BONESETTER',
                                secondaryCommissionType: editingServiceData.secondaryCommissionType || 'fixed',
                                secondaryCommissionValue: editingServiceData.secondaryCommissionValue ?? 0
                              } : {})
                            });
                          }}
                        />
                        <div className={`w-14 h-8 rounded-full transition-colors duration-300 ${editingServiceData.isDualProvider ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
                        <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 shadow-md ${editingServiceData.isDualProvider ? 'translate-x-6' : ''}`}></div>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Dual Provider Relay</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Enable secondary support commission</span>
                     </div>
                  </label>

                  {editingServiceData.isDualProvider && (
                    <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                       <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Support Provider Configuration</h4>
                          <select 
                             className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest outline-none"
                             value={editingServiceData.secondaryRole || 'BONESETTER'}
                             onChange={e => setEditingServiceData({ ...editingServiceData, secondaryRole: e.target.value as ProviderRole })}
                          >
                             <option value="THERAPIST">THERAPIST</option>
                             <option value="BONESETTER">BONESETTER</option>
                             <option value="MANAGER">MANAGER</option>
                             <option value="TRAINEE">TRAINEE</option>
                          </select>
                       </div>

                       <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Support Pay Model</label>
                             <select 
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-wide outline-none"
                                value={editingServiceData.secondaryCommissionType || 'fixed'}
                                onChange={e => setEditingServiceData({ ...editingServiceData, secondaryCommissionType: e.target.value as CommissionType })}
                             >
                                <option value="fixed">FIXED (₱)</option>
                                <option value="percentage">PERCENTAGE (%)</option>
                             </select>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Support Pay Value</label>
                             <input 
                               type="number"
                               className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold tabular-nums focus:border-emerald-500 outline-none transition-all"
                               value={editingServiceData.secondaryCommissionValue || 0}
                               onChange={e => setEditingServiceData({ ...editingServiceData, secondaryCommissionValue: Number(e.target.value) })}
                             />
                          </div>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="p-8 sm:p-10 bg-slate-50/50 border-t border-slate-50">
               <button 
                 onClick={handleSaveService}
                 className="w-full bg-slate-900 text-white py-6 rounded-[24px] sm:rounded-[32px] font-bold text-[12px] uppercase tracking-[0.3em] shadow-xl hover:bg-emerald-600 transition-all active:scale-95"
               >
                 Commit Specification
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};