import React, { useState, useEffect, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Service, Branch, ProviderRole, CommissionType } from '../../types';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { supabase } from '../../lib/supabase';
import { UI_THEME } from '../../constants/ui_designs';
import { Plus, Trash2, Pencil, ChevronLeft, Save, X, FileText, Share2, Search, BookOpen, Settings, AlertTriangle, Check, Download, LayoutGrid, List, GitBranch } from 'lucide-react';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { getTrueISOString, getTrueDate } from '../../lib/time';

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

// Stable color palette — color is derived from catalog ID so it never shifts when other catalogs are added/removed
const CATALOG_COLORS = [
  { dot: 'bg-emerald-500', light: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200', tag: 'bg-emerald-100 text-emerald-700' },
  { dot: 'bg-indigo-500', light: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200', tag: 'bg-indigo-100 text-indigo-700' },
  { dot: 'bg-violet-500', light: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-200', tag: 'bg-violet-100 text-violet-700' },
  { dot: 'bg-amber-500', light: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200', tag: 'bg-amber-100 text-amber-700' },
  { dot: 'bg-rose-500', light: 'bg-rose-50', icon: 'text-rose-600', border: 'border-rose-200', tag: 'bg-rose-100 text-rose-700' },
  { dot: 'bg-sky-500', light: 'bg-sky-50', icon: 'text-sky-600', border: 'border-sky-200', tag: 'bg-sky-100 text-sky-700' },
  { dot: 'bg-teal-500', light: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200', tag: 'bg-teal-100 text-teal-700' },
];

function getCatalogColor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % CATALOG_COLORS.length;
  return CATALOG_COLORS[hash];
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
      bg-white border shadow-sm cursor-pointer active:scale-[0.98] p-3 sm:p-7 rounded-2xl sm:rounded-3xl
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
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [branchSearch, setBranchSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [globalServiceSearch, setGlobalServiceSearch] = useState('');
  const [listView, setListView] = useState<'catalogs' | 'branches'>('catalogs');

  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [editingCatalogName, setEditingCatalogName] = useState('');
  const [branchAssignModal, setBranchAssignModal] = useState<{ id: string; name: string } | null>(null);

  const activeCatalog = useMemo(() =>
    localCatalogs.find(c => c.id === activeCatalogId) || null
  , [localCatalogs, activeCatalogId]);

  // ── Network-level stats ────────────────────────────────────────────────
  const networkStats = useMemo(() => {
    const totalServices = localCatalogs.reduce((s, c) => s + (c.services || []).length, 0);
    const coveredBranchIds = new Set(localCatalogs.flatMap(c => c.branchIds || []));
    return {
      totalCatalogs: localCatalogs.length,
      totalServices,
      coveredBranches: coveredBranchIds.size,
      totalBranches: branches.length,
      uncoveredBranches: branches.filter(b => !coveredBranchIds.has(b.id)).length,
    };
  }, [localCatalogs, branches]);

  // ── Branch-centric coverage data ───────────────────────────────────────
  const branchCoverageData = useMemo(() => {
    return branches
      .map(b => {
        const assignedCatalogs = localCatalogs.filter(c => (c.branchIds || []).includes(b.id));
        const totalServices = assignedCatalogs.reduce((s, c) => s + (c.services || []).length, 0);
        return { branch: b, catalogs: assignedCatalogs, totalServices };
      })
      .sort((a, b) => a.branch.name.localeCompare(b.branch.name));
  }, [branches, localCatalogs]);

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

      for (const cat of enrichedCatalogs) {
        await supabase.from(DB_TABLES.SERVICE_CATALOGS).upsert({
          [DB_COLUMNS.ID]: cat.id,
          [DB_COLUMNS.NAME]: cat.name,
          [DB_COLUMNS.SERVICES]: cat.services,
          [DB_COLUMNS.BRANCH_IDS]: cat.branchIds,
          [DB_COLUMNS.CAN_BE_LOYALTY]: cat.can_be_loyalty || false,
          [DB_COLUMNS.UPDATED_AT]: getTrueISOString()
        });
      }

      const initialIds = initialCatalogs.map(c => c.id);
      const currentIds = enrichedCatalogs.map(c => c.id);
      const deletedIds = initialIds.filter(id => !currentIds.includes(id));
      if (deletedIds.length > 0) {
        await supabase.from(DB_TABLES.SERVICE_CATALOGS).delete().in(DB_COLUMNS.ID, deletedIds);
      }

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
    const timestamp = getTrueDate().toLocaleString();

    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    doc.text(activeCatalog.name, 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${timestamp}`, 14, 30);

    const linkedBranches = branches
      .filter(b => (activeCatalog.branchIds || []).includes(b.id))
      .map(b => b.name)
      .join(', ');

    if (linkedBranches) {
      doc.setFontSize(9);
      doc.setTextColor(16, 185, 129);
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
    <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-300 pb-48 px-2">

      {!activeCatalogId && (
        <div className="space-y-6">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className={`bg-white ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} border border-slate-200 shadow-sm no-print`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Service Catalogs</h3>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Master Distribution Control</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={globalServiceSearch}
                  onChange={e => setGlobalServiceSearch(e.target.value)}
                  placeholder="SEARCH SERVICE..."
                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-10 text-xs font-medium uppercase tracking-wide outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-colors placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
                />
                {globalServiceSearch && (
                  <button onClick={() => setGlobalServiceSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Stats strip ─────────────────────────────────────────── */}
            <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Catalogs</p>
                <p className="text-[20px] font-black text-slate-900 tabular-nums leading-none">{networkStats.totalCatalogs}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Services</p>
                <p className="text-[20px] font-black text-emerald-600 tabular-nums leading-none">{networkStats.totalServices}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branches Covered</p>
                <p className="text-[20px] font-black text-slate-900 tabular-nums leading-none">
                  {networkStats.coveredBranches}<span className="text-xs font-bold text-slate-400">/{networkStats.totalBranches}</span>
                </p>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No Catalog</p>
                <p className={`text-[20px] font-black tabular-nums leading-none ${networkStats.uncoveredBranches > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                  {networkStats.uncoveredBranches}
                </p>
              </div>
            </div>
          </div>

          {/* ── View toggle ────────────────────────────────────────────── */}
          {!globalServiceSearch.trim() && (
            <div className="flex items-center gap-2 px-1">
              <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1 shadow-inner border border-slate-200/80">
                <button
                  onClick={() => { setListView('catalogs'); playSound('click'); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${listView === 'catalogs' ? 'bg-white text-slate-900 shadow-md border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Catalogs
                </button>
                <button
                  onClick={() => { setListView('branches'); playSound('click'); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${listView === 'branches' ? 'bg-white text-slate-900 shadow-md border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <List className="w-3.5 h-3.5" />
                  By Branch
                </button>
              </div>
            </div>
          )}

          {/* ── Global search results ───────────────────────────────────── */}
          {globalServiceSearch.trim() && (
            <div className="px-1">
              {globalSearchResults.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 py-12 text-center">
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No services found matching "{globalServiceSearch}"</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{globalSearchResults.length} result{globalSearchResults.length !== 1 ? 's' : ''} across {new Set(globalSearchResults.map(r => r.catalog.id)).size} catalog{new Set(globalSearchResults.map(r => r.catalog.id)).size !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
                    {globalSearchResults.map(({ service: s, catalog: cat }) => {
                      const color = getCatalogColor(cat.id);
                      return (
                        <div
                          key={`${cat.id}-${s.id}`}
                          onClick={() => { setActiveCatalogId(cat.id); setGlobalServiceSearch(''); playSound('click'); }}
                          className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors group"
                        >
                          <div className={`w-8 h-8 rounded-xl ${color.light} ${color.icon} flex items-center justify-center text-sm shrink-0`}>
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate group-hover:text-emerald-700 transition-colors">{s.name}</p>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">{cat.name}</p>
                          </div>
                          <div className="shrink-0 text-right space-y-0.5">
                            <p className="text-xs font-black text-emerald-600 tabular-nums">₱{s.price.toLocaleString()}</p>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{s.duration}M</p>
                          </div>
                          <Settings className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CATALOG GRID view ───────────────────────────────────────── */}
          {!globalServiceSearch.trim() && listView === 'catalogs' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-1">
              {localCatalogs.map(cat => {
                const color = getCatalogColor(cat.id);
                const linkedBranches = branches.filter(b => (cat.branchIds || []).includes(b.id));
                const previewServices = (cat.services || []).slice(0, 3);
                const priceRange = (cat.services || []).length > 0
                  ? { min: Math.min(...cat.services.map(s => s.price)), max: Math.max(...cat.services.map(s => s.price)) }
                  : null;

                return (
                  <div
                    key={cat.id}
                    onClick={() => { setActiveCatalogId(cat.id); playSound('click'); }}
                    className="bg-white border border-slate-100 rounded-2xl shadow-sm cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all overflow-hidden active:scale-[0.98] flex flex-col group"
                  >
                    {/* Color accent bar */}
                    <div className={`h-1 ${color.dot}`} />

                    <div className="p-5 flex flex-col flex-1 gap-3">
                      {/* Top row: icon + actions */}
                      <div className="flex justify-between items-start">
                        <div className={`w-10 h-10 ${color.light} ${color.icon} rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}>
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleStartRename(e, cat)}
                            className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-slate-100 shadow-sm active:scale-90"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleCatalogDeleteFromList(e, cat)}
                            className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all border border-slate-100 shadow-sm active:scale-90"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Catalog name */}
                      <div>
                        <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight leading-tight">{cat.name}</h4>
                        {priceRange && (
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
                            ₱{priceRange.min.toLocaleString()} – ₱{priceRange.max.toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* Service name preview */}
                      {previewServices.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {previewServices.map(s => (
                            <div key={s.id} className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-600 uppercase tracking-tight truncate pr-2">{s.name}</span>
                              <span className="text-xs font-bold text-slate-400 shrink-0 tabular-nums">₱{s.price.toLocaleString()}</span>
                            </div>
                          ))}
                          {(cat.services || []).length > 3 && (
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">+{cat.services.length - 3} more</p>
                          )}
                        </div>
                      )}
                      {previewServices.length === 0 && (
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest italic">No services yet</p>
                      )}

                      {/* Branch chips + quick assign */}
                      <div className="mt-auto pt-3 border-t border-slate-50 space-y-2">
                        {linkedBranches.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {linkedBranches.slice(0, 3).map(b => (
                              <span key={b.id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-semibold uppercase tracking-wide truncate max-w-[100px]">{b.name}</span>
                            ))}
                            {linkedBranches.length > 3 && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-md text-xs font-semibold uppercase tracking-wide">+{linkedBranches.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">No branches linked</span>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                            <span className={`text-xs font-bold uppercase tracking-tight ${color.icon}`}>{(cat.services || []).length} services</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {cat.can_be_loyalty && (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-xs font-semibold uppercase tracking-wide">Loyalty</span>
                            )}
                          </div>
                        </div>

                        {/* Quick branch-assign shortcut */}
                        <div onClick={e => e.stopPropagation()}>
                          <button
                            onClick={e => { e.stopPropagation(); setActiveCatalogId(cat.id); playSound('click'); }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all active:scale-95 ${linkedBranches.length === 0 ? 'bg-rose-50 border-rose-100 hover:bg-rose-100' : 'bg-slate-50 border-slate-100 hover:bg-emerald-50 hover:border-emerald-200'}`}
                          >
                            <div className="flex items-center gap-2">
                              <GitBranch className={`w-3 h-3 shrink-0 ${linkedBranches.length === 0 ? 'text-rose-400' : 'text-slate-400'}`} />
                              <span className={`text-xs font-semibold uppercase tracking-wide ${linkedBranches.length === 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                                {linkedBranches.length === 0 ? 'No branches linked' : `${linkedBranches.length} branch${linkedBranches.length !== 1 ? 'es' : ''}`}
                              </span>
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Manage →</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add new */}
              <button
                onClick={startNewCatalog}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all group active:scale-95 bg-white/50 min-h-[200px]"
              >
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-300 group-hover:text-emerald-600 shadow-sm border border-slate-100 transition-all group-hover:scale-110 group-hover:rotate-12">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-tight group-hover:text-emerald-700">New Catalog</p>
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Initialize distribution set</p>
                </div>
              </button>
            </div>
          )}

          {/* ── BY BRANCH view ─────────────────────────────────────────── */}
          {!globalServiceSearch.trim() && listView === 'branches' && (
            <div className="px-1 space-y-3">
              {networkStats.uncoveredBranches > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <p className="text-xs font-black text-rose-700 uppercase tracking-widest">
                    {networkStats.uncoveredBranches} branch{networkStats.uncoveredBranches !== 1 ? 'es have' : ' has'} no catalog assigned
                  </p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_2fr_auto_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</p>
                  <p className="hidden sm:block text-xs font-medium text-slate-400 uppercase tracking-wide">Assigned Catalogs</p>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Services</p>
                  <p className="hidden sm:block text-xs font-medium text-slate-400 uppercase tracking-wide"></p>
                </div>

                {branchCoverageData.map(({ branch: b, catalogs: assigned, totalServices }) => (
                  <div
                    key={b.id}
                    onClick={() => { setBranchAssignModal({ id: b.id, name: b.name }); playSound('click'); }}
                    className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_2fr_auto_auto] gap-4 items-center px-5 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                  >
                    {/* Branch name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-emerald-50 transition-colors">
                        <span className="text-xs font-black text-slate-600 group-hover:text-emerald-600 transition-colors">{b.name.charAt(0)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-xs text-slate-900 uppercase tracking-tight truncate leading-none">{b.name}</p>
                        {!b.isEnabled && <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mt-0.5">Disabled</p>}
                      </div>
                    </div>

                    {/* Catalog chips */}
                    <div className="hidden sm:flex flex-wrap gap-1.5">
                      {assigned.length === 0 ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-500 border border-rose-100 rounded-lg text-xs font-semibold uppercase tracking-wide">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          No catalog
                        </span>
                      ) : (
                        assigned.map(c => {
                          const color = getCatalogColor(c.id);
                          return (
                            <span
                              key={c.id}
                              className={`flex items-center gap-1.5 px-2.5 py-1 ${color.tag} rounded-lg text-xs font-semibold uppercase tracking-wide`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                              {c.name}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Service count */}
                    <div className="text-right shrink-0">
                      {totalServices > 0 ? (
                        <p className="text-sm font-black text-emerald-600 tabular-nums leading-none">{totalServices}</p>
                      ) : (
                        <p className="text-sm font-black text-slate-200 tabular-nums leading-none">—</p>
                      )}
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">svcs</p>
                    </div>

                    {/* Manage button */}
                    <div className="shrink-0 hidden sm:flex">
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-semibold uppercase tracking-wide group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-all">
                        <Pencil className="w-2.5 h-2.5" />
                        Manage
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CATALOG DETAIL VIEW ──────────────────────────────────────────── */}
      {activeCatalog && (() => {
        const color = getCatalogColor(activeCatalog.id);
        return (
          <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500 px-2 sm:px-1">
            {/* Detail header */}
            <div className={`bg-white ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print overflow-hidden relative`}>
              {/* Color accent bar */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${color.dot}`} />

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full md:w-auto mt-1">
                <button onClick={() => setActiveCatalogId(null)} className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-all active:scale-90 border border-slate-100 shadow-inner shrink-0">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3 flex-1 min-w-[120px]">
                  <div className={`w-10 h-10 ${color.light} ${color.icon} rounded-xl flex items-center justify-center shadow-inner shrink-0`}>
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <input
                        autoFocus
                        className="text-sm font-black text-slate-900 uppercase tracking-tighter bg-slate-50 border-b border-emerald-500 outline-none w-full max-w-sm"
                        value={activeCatalog.name}
                        onChange={e => updateCatalog(activeCatalog.id, { name: e.target.value.toUpperCase() })}
                        onBlur={() => setIsRenaming(false)}
                        onKeyDown={e => e.key === 'Enter' && setIsRenaming(false)}
                      />
                    ) : (
                      <div className="flex items-center gap-2 overflow-hidden">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter truncate leading-none">{activeCatalog.name}</h3>
                        <button onClick={() => setIsRenaming(true)} className="p-1 text-slate-300 hover:text-slate-600 transition-colors shrink-0"><Pencil className="w-3 h-3" /></button>
                      </div>
                    )}
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Catalog Configuration</p>
                  </div>
                </div>

                {/* Loyalty toggle */}
                <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={activeCatalog.can_be_loyalty || false}
                        onChange={e => updateCatalog(activeCatalog.id, { can_be_loyalty: e.target.checked })}
                      />
                      <div className={`w-10 h-5 rounded-full transition-colors duration-300 ${activeCatalog.can_be_loyalty ? 'bg-amber-500' : 'bg-slate-200'}`}></div>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${activeCatalog.can_be_loyalty ? 'translate-x-5' : ''}`}></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-widest leading-none">Loyalty Reward</span>
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Eligible for POS Rewards</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <button onClick={handleCatalogDelete} className="h-10 sm:h-12 w-10 sm:w-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-2xl border border-rose-100 hover:bg-rose-100 transition-all shadow-sm active:scale-95 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </button>
                <button onClick={() => { setEditingServiceId('new'); playSound('click'); }} className="h-10 sm:h-12 px-6 rounded-2xl bg-slate-900 text-white flex items-center gap-3 text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all shadow-lg active:scale-95 shrink-0 flex-1 sm:flex-none justify-center">
                  <Plus className="w-4 h-4" />
                  <span className="font-black">Add Service</span>
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
                        onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
                      />
                    </div>
                    <button onClick={() => handleExportPDF()} className="h-14 w-14 sm:w-auto px-0 sm:px-6 rounded-2xl bg-emerald-600 text-white flex items-center justify-center sm:justify-start gap-3 text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0">
                      <Download className="w-5 h-5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline font-black text-xs uppercase tracking-widest">Export PDF</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={serviceSearch}
                      onChange={e => setServiceSearch(e.target.value)}
                      placeholder="Search services…"
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-10 text-xs font-medium uppercase tracking-wide outline-none focus:border-slate-400 focus:bg-white transition-colors placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
                    />
                    {serviceSearch && (
                      <button onClick={() => setServiceSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile card view */}
                <div className="sm:hidden space-y-4">
                  {paginatedServices.length > 0 ? paginatedServices.map(srv => (
                    <div key={srv.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 relative overflow-hidden group">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${color.dot}`} />
                      <div className="flex justify-between items-start pl-2">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">{srv.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{srv.duration} MINS</span>
                            <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">₱{srv.price.toLocaleString()}</span>
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
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Lead Pay</p>
                          <p className={`text-xs font-bold uppercase tracking-tighter ${color.icon}`}>{srv.commissionType === 'percentage' ? `${srv.commissionValue}%` : `₱${srv.commissionValue}`}</p>
                        </div>
                        {srv.isDualProvider && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Support Pay</p>
                            <p className="text-xs font-bold text-indigo-600 uppercase tracking-tighter">{srv.secondaryCommissionType === 'percentage' ? `${srv.secondaryCommissionValue}%` : `₱${srv.secondaryCommissionValue}`}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="py-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 opacity-40">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">No Services Defined</p>
                    </div>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-6 py-5 text-xs font-medium text-slate-400 uppercase tracking-wide">Service</th>
                          <th className="px-6 py-5 text-xs font-medium text-slate-400 uppercase tracking-wide hidden sm:table-cell">Duration</th>
                          <th className="px-6 py-5 text-xs font-medium text-slate-400 uppercase tracking-wide">Price</th>
                          <th className="px-6 py-5 text-xs font-medium text-slate-400 uppercase tracking-wide hidden md:table-cell">Commission</th>
                          <th className="px-6 py-5 text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {paginatedServices.length > 0 ? paginatedServices.map(srv => (
                          <tr key={srv.id} className="hover:bg-slate-50/30 transition-colors group">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className={`w-1 h-8 rounded-full ${color.dot} shrink-0`} />
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900 uppercase text-sm tracking-tight leading-none">{srv.name}</span>
                                  {srv.isDualProvider && <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-1">Dual Provider</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5 hidden sm:table-cell">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide tabular-nums">{srv.duration}M</span>
                            </td>
                            <td className="px-6 py-5">
                              <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest whitespace-nowrap tabular-nums">₱{srv.price.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-5 hidden md:table-cell">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Lead:</span>
                                  <span className={`text-xs font-bold tabular-nums ${color.icon}`}>{srv.commissionType === 'percentage' ? `${srv.commissionValue}%` : `₱${srv.commissionValue}`}</span>
                                </div>
                                {srv.isDualProvider && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Support:</span>
                                    <span className="text-xs font-bold text-indigo-600 tabular-nums">{srv.secondaryCommissionType === 'percentage' ? `${srv.secondaryCommissionValue}%` : `₱${srv.secondaryCommissionValue}`}</span>
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
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">No services — add one above</p>
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
                <div className="bg-slate-900 rounded-3xl sm:rounded-[48px] p-5 sm:p-10 shadow-xl relative overflow-hidden text-white border border-slate-100">
                  <div className={`absolute top-0 left-0 right-0 h-1 ${color.dot}`} />
                  <div className="absolute top-0 right-0 w-32 sm:w-40 h-32 sm:h-40 bg-emerald-500/10 blur-[90px] rounded-full translate-x-1/4 -translate-y-1/4"></div>
                  <div className="relative z-10 space-y-6 sm:space-y-8">
                    <div className="flex justify-between items-center h-10">
                      <div className="flex flex-col">
                        <h4 className={`text-xs sm:text-xs font-bold uppercase tracking-wider leading-none ${color.icon}`}>Branch Assignment</h4>
                        <p className="text-xs sm:text-xs font-bold text-slate-500 uppercase tracking-wide mt-1.5 sm:mt-2">Toggle to link / unlink</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="bg-white/10 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-xs font-bold border border-slate-100 shadow-inner">{(activeCatalog.branchIds || []).length} linked</span>
                        {(activeCatalog.branchIds || []).length < branches.length ? (
                          <button
                            onClick={() => {
                              setLocalCatalogs(prev => prev.map(c =>
                                c.id === activeCatalog.id ? { ...c, branchIds: branches.map(b => b.id) } : c
                              ));
                              setHasUnsavedChanges(true);
                              playSound('click');
                            }}
                            className="h-7 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold uppercase tracking-wide transition-all active:scale-95"
                          >
                            All
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setLocalCatalogs(prev => prev.map(c =>
                                c.id === activeCatalog.id ? { ...c, branchIds: [] } : c
                              ));
                              setHasUnsavedChanges(true);
                              playSound('click');
                            }}
                            className="h-7 px-3 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold uppercase tracking-wide transition-all active:scale-95"
                          >
                            None
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative group">
                      <input
                        value={branchSearch}
                        onChange={e => setBranchSearch(e.target.value)}
                        placeholder="Filter branches..."
                        className="w-full bg-white/5 border border-slate-200 rounded-[18px] sm:rounded-[22px] pl-12 sm:pl-14 pr-4 sm:pr-6 py-3.5 sm:py-4 text-xs sm:text-sm font-bold uppercase tracking-wide focus:border-emerald-500 outline-none transition-all placeholder:text-white/20 shadow-inner"
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
                            className={`w-full flex items-center justify-between p-4 sm:p-5 rounded-[18px] sm:rounded-[22px] transition-all border group active:scale-[0.97] ${isLinked ? `${color.dot.replace('bg-', 'bg-')} bg-emerald-600 border-emerald-500 text-white shadow-xl scale-[1.02]` : 'bg-white/5 border-slate-100 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                          >
                            <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
                              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isLinked ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-500'}`}>
                                <span className="text-xs font-black">{b.name.charAt(0)}</span>
                              </div>
                              <span className="font-bold uppercase text-xs sm:text-xs tracking-tight truncate leading-none">{b.name}</span>
                            </div>
                            {isLinked && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-in zoom-in shrink-0" />}
                          </button>
                        );
                      }) : (
                        <div className="py-12 sm:py-20 text-center opacity-30">
                          <p className="text-xs sm:text-xs font-bold uppercase tracking-wide">No matching branches</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── UNSAVED CHANGES BAR ─────────────────────────────────────────── */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-24 lg:bottom-12 left-4 right-4 sm:left-6 sm:right-6 z-[400] bg-white/95 backdrop-blur-md border border-amber-200 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom-12 flex items-center justify-center">
          <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-4 px-2 sm:px-6">
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-50 text-amber-500 animate-pulse flex items-center justify-center border border-amber-200 shadow-inner text-lg sm:text-xl shrink-0">⚠️</div>
              <div className="hidden sm:block">
                <p className="text-sm font-bold uppercase text-slate-900 tracking-tight leading-none">Unsaved Catalog Changes</p>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-2">Save to sync changes to all linked branches</p>
              </div>
              <div className="sm:hidden text-center">
                <p className="text-xs font-bold uppercase text-slate-900 leading-tight">Unsaved Changes</p>
              </div>
            </div>
            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
              <button onClick={() => { setLocalCatalogs(JSON.parse(JSON.stringify(initialCatalogs))); setHasUnsavedChanges(false); playSound('warning'); }} className="flex-1 sm:flex-none px-4 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-xs uppercase text-slate-400 hover:text-rose-600 transition-colors">Discard</button>
              <button onClick={handleGlobalSave} disabled={isSaving} className="flex-1 sm:flex-none bg-emerald-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-xs uppercase tracking-widest shadow-xl shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-4">
                {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : '⚡'}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BRANCH ASSIGN MODAL ─────────────────────────────────────────── */}
      {branchAssignModal && (() => {
        const assignedIds = localCatalogs
          .filter(c => (c.branchIds || []).includes(branchAssignModal.id))
          .map(c => c.id);
        return (
          <div className="fixed inset-0 z-[1100] bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full sm:max-w-lg rounded-t-[40px] sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300 max-h-[90vh]">
              {/* Header */}
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
                    <GitBranch className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Assign Catalogs to</p>
                    <h3 className="text-sm font-bold text-slate-900 leading-none mt-0.5">{branchAssignModal.name}</h3>
                  </div>
                </div>
                <button
                  onClick={() => setBranchAssignModal(null)}
                  className="p-2.5 bg-slate-100 rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition-all active:scale-90"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Subtitle */}
              <div className="px-8 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  {assignedIds.length} of {localCatalogs.length} catalog{localCatalogs.length !== 1 ? 's' : ''} assigned
                </p>
              </div>

              {/* Catalog list */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {localCatalogs.length === 0 ? (
                  <div className="py-16 text-center opacity-40">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No catalogs yet</p>
                  </div>
                ) : localCatalogs.map(cat => {
                  const color = getCatalogColor(cat.id);
                  const isAssigned = assignedIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleBranchLink(cat.id, branchAssignModal.id)}
                      className={`w-full flex items-center gap-4 px-8 py-5 text-left transition-all active:scale-[0.99] ${isAssigned ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}
                    >
                      {/* Color dot + icon */}
                      <div className={`w-10 h-10 ${color.light} ${color.icon} rounded-xl flex items-center justify-center shrink-0`}>
                        <BookOpen className="w-4 h-4" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none truncate">{cat.name}</p>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">
                          {(cat.services || []).length} service{(cat.services || []).length !== 1 ? 's' : ''}
                          {cat.can_be_loyalty && <span className="ml-2 text-amber-500">· Loyalty</span>}
                        </p>
                      </div>

                      {/* Toggle indicator */}
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isAssigned ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'}`}>
                        {isAssigned && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0 bg-white">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Changes save with the catalog</p>
                <button
                  onClick={() => setBranchAssignModal(null)}
                  className="h-10 px-6 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 active:scale-95 transition-all shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── RENAME MODAL ────────────────────────────────────────────────── */}
      {editingCatalogId && (
        <div className="fixed inset-0 z-[1100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Rename Catalog</h3>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-1">Update catalog identity</p>
              </div>
              <button onClick={() => setEditingCatalogId(null)} className="p-3 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-all active:scale-90 border border-slate-100 shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Catalog Name</label>
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
                className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-xs uppercase tracking-wide shadow-xl hover:bg-emerald-600 transition-all active:scale-95"
              >
                Confirm Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SERVICE EDITOR MODAL ────────────────────────────────────────── */}
      {editingServiceId && editingServiceData && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-3xl sm:rounded-[56px] shadow-xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
            <div className="p-8 sm:p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tight">{editingServiceId === 'new' ? 'Add Service' : 'Edit Service'}</h3>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-1">{activeCatalog?.name}</p>
              </div>
              <button onClick={() => setEditingServiceId(null)} className="p-4 bg-white rounded-2xl text-slate-400 hover:text-rose-600 transition-all active:scale-90 border border-slate-100 shadow-sm">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 sm:p-10 space-y-8 no-scrollbar">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Service Name</label>
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
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Price (₱)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold tabular-nums focus:border-emerald-500 outline-none transition-all"
                    value={editingServiceData.price}
                    onChange={e => setEditingServiceData({ ...editingServiceData, price: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Duration (mins)</label>
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
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Lead Provider</h4>
                  <select
                    className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-medium uppercase tracking-wide outline-none"
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
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Pay Model</label>
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
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Pay Value</label>
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
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-widest">Dual Provider</span>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Enable secondary support commission</span>
                  </div>
                </label>

                {editingServiceData.isDualProvider && (
                  <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Support Provider</h4>
                      <select
                        className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-medium uppercase tracking-wide outline-none"
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
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Support Pay Model</label>
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
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Support Pay Value</label>
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
                className="w-full bg-slate-900 text-white py-6 rounded-2xl sm:rounded-2xl font-bold text-xs uppercase tracking-wide shadow-xl hover:bg-emerald-600 transition-all active:scale-95"
              >
                {editingServiceId === 'new' ? 'Add Service' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
