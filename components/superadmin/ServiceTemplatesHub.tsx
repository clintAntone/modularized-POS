import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { Search, Plus, X, Edit2, Trash2, BookOpen, LayoutGrid, List, GitBranch, Check, Zap } from 'lucide-react';

const CATALOG_PALETTES = [
  { dot: 'bg-emerald-500', light: 'bg-emerald-50', icon: 'text-emerald-600', tag: 'bg-emerald-100 text-emerald-700' },
  { dot: 'bg-indigo-500', light: 'bg-indigo-50', icon: 'text-indigo-600', tag: 'bg-indigo-100 text-indigo-700' },
  { dot: 'bg-violet-500', light: 'bg-violet-50', icon: 'text-violet-600', tag: 'bg-violet-100 text-violet-700' },
  { dot: 'bg-amber-500', light: 'bg-amber-50', icon: 'text-amber-600', tag: 'bg-amber-100 text-amber-700' },
  { dot: 'bg-rose-500', light: 'bg-rose-50', icon: 'text-rose-600', tag: 'bg-rose-100 text-rose-700' },
  { dot: 'bg-sky-500', light: 'bg-sky-50', icon: 'text-sky-600', tag: 'bg-sky-100 text-sky-700' },
  { dot: 'bg-teal-500', light: 'bg-teal-50', icon: 'text-teal-600', tag: 'bg-teal-100 text-teal-700' },
];

function getCatalogPalette(catalogName: string | null) {
  if (!catalogName) return CATALOG_PALETTES[0];
  let hash = 0;
  for (const ch of catalogName) hash = (hash * 31 + ch.charCodeAt(0)) % CATALOG_PALETTES.length;
  return CATALOG_PALETTES[hash];
}

interface ServiceTemplate {
  id: string;
  name: string;
  catalog_name: string | null;
  default_price: number;
  duration: number;
  primary_role: string;
  secondary_role: string | null;
  commission_type: string;
  commission_value: number;
  is_dual_provider: boolean;
  secondary_commission_type: string | null;
  secondary_commission_value: number | null;
  can_be_loyalty: boolean;
}

interface BranchService {
  branch_id: string;
  template_id: string;
  price: number | null;
}

interface ServiceTemplatesHubProps {
  branches: Branch[];
  isReadOnly?: boolean;
  onRefresh?: () => void;
}

const BLANK: Omit<ServiceTemplate, 'id'> = {
  name: '',
  catalog_name: '',
  default_price: 0,
  duration: 60,
  primary_role: 'THERAPIST',
  secondary_role: null,
  commission_type: 'fixed',
  commission_value: 0,
  is_dual_provider: false,
  secondary_commission_type: 'fixed',
  secondary_commission_value: null,
  can_be_loyalty: false,
};

export const ServiceTemplatesHub: React.FC<ServiceTemplatesHubProps> = ({ branches, isReadOnly = false, onRefresh }) => {
  const queryClient = useQueryClient();
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [branchServices, setBranchServices] = useState<BranchService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCatalog, setFilterCatalog] = useState('ALL');
  const [viewMode, setViewMode] = useState<'services' | 'branches'>('services');
  const [editingTemplate, setEditingTemplate] = useState<ServiceTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [managingTemplate, setManagingTemplate] = useState<ServiceTemplate | null>(null);
  // Draft state for the per-service branch assignment modal
  const [draftBranchIds, setDraftBranchIds] = useState<string[]>([]);
  const [isAssignSaving, setIsAssignSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ServiceTemplate | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Bulk assign: assign all services in a catalog group to selected branches
  const [bulkAssign, setBulkAssign] = useState<{ catalogName: string; templateIds: string[] } | null>(null);
  const [bulkSelectedBranches, setBulkSelectedBranches] = useState<string[]>([]);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkMode, setBulkMode] = useState<'assign' | 'unassign'>('assign');
  // Import Services state
  const [importTo, setImportTo] = useState<string | null>(null);
  const [importSelected, setImportSelected] = useState<string[]>([]);
  const [importPrices, setImportPrices] = useState<Record<string, string>>({});
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [isImportSaving, setIsImportSaving] = useState(false);
  // PRIO catalogs — stored in system_config under key 'prio_service_catalogs'
  const [prioCatalogs, setPrioCatalogs] = useState<string[]>([]);
  // Per-catalog overflow menu
  const [openCatalogMenu, setOpenCatalogMenu] = useState<string | null>(null);
  const catalogMenuRef = useRef<HTMLDivElement | null>(null);
  // New catalog creation
  const [showNewCatalogModal, setShowNewCatalogModal] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState('');
  const [localCatalogNames, setLocalCatalogNames] = useState<string[]>([]); // empty catalogs (not yet in DB)
  // Branch-centric assign: pick services for a branch
  const [branchManage, setBranchManage] = useState<Branch | null>(null);
  // Long-press to delete
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [longPressingId, setLongPressingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: tData }, { data: bsData }, { data: cfgData }] = await Promise.all([
      supabase.from(DB_TABLES.SERVICE_TEMPLATES).select('*').order('catalog_name').order('name'),
      supabase.from(DB_TABLES.BRANCH_SERVICES).select('*'),
      supabase.from(DB_TABLES.SYSTEM_CONFIG).select('value').eq('key', 'prio_service_catalogs').maybeSingle(),
    ]);
    setTemplates(tData || []);
    setBranchServices(bsData || []);
    try { setPrioCatalogs(cfgData?.value ? JSON.parse(cfgData.value) : []); } catch { setPrioCatalogs([]); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!openCatalogMenu) return;
    const handler = (e: MouseEvent) => {
      if (catalogMenuRef.current && !catalogMenuRef.current.contains(e.target as Node)) {
        setOpenCatalogMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCatalogMenu]);

  const catalogGroups = useMemo(() => {
    const groups: Record<string, ServiceTemplate[]> = {};
    templates.forEach(t => {
      const key = t.catalog_name || 'Uncategorized';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [templates]);

  const catalogNames = useMemo(() => {
    const fromTemplates = Object.keys(catalogGroups);
    const extras = localCatalogNames.filter(n => !fromTemplates.includes(n));
    return ['ALL', ...fromTemplates, ...extras];
  }, [catalogGroups, localCatalogNames]);

  const filteredGroups = useMemo(() => {
    const result: Record<string, ServiceTemplate[]> = {};
    // Real groups from templates
    (Object.entries(catalogGroups) as [string, ServiceTemplate[]][]).forEach(([group, items]) => {
      if (filterCatalog !== 'ALL' && filterCatalog !== group) return;
      const filtered = items.filter(t =>
        !search ||
        t.name.includes(search) ||
        t.default_price.toString().includes(search)
      );
      if (filtered.length > 0) result[group] = filtered;
    });
    // Empty local catalogs (no services yet)
    localCatalogNames
      .filter(n => !catalogGroups[n])
      .forEach(n => {
        if (filterCatalog === 'ALL' || filterCatalog === n) result[n] = [];
      });
    return result;
  }, [catalogGroups, localCatalogNames, filterCatalog, search]);

  const branchCount = (templateId: string) =>
    branchServices.filter(bs => bs.template_id === templateId).length;

  const overrideCount = (templateId: string) =>
    branchServices.filter(bs => bs.template_id === templateId && bs.price !== null).length;

  const totalOverrides = branchServices.filter(bs => bs.price !== null).length;

  const handleSaveTemplate = async () => {
    if (!editingTemplate || !editingTemplate.name.trim()) return;
    setIsSaving(true);
    try {
      if (isNew) {
        const id = Math.random().toString(36).substr(2, 9);
        await supabase.from(DB_TABLES.SERVICE_TEMPLATES).insert({ ...editingTemplate, id });
      } else {
        const { id, ...rest } = editingTemplate;
        await supabase.from(DB_TABLES.SERVICE_TEMPLATES).update(rest).eq('id', id);
      }
      playSound('success');
      setEditingTemplate(null);
      await load();
      onRefresh?.();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setIsSaving(true);
    try {
      await supabase.from(DB_TABLES.BRANCH_SERVICES).delete().eq('template_id', deleteConfirm.id);
      await supabase.from(DB_TABLES.SERVICE_TEMPLATES).delete().eq('id', deleteConfirm.id);
      playSound('success');
      setDeleteConfirm(null);
      await load();
      onRefresh?.();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBranch = async (branchId: string, templateId: string, assigned: boolean) => {
    if (assigned) {
      await supabase.from(DB_TABLES.BRANCH_SERVICES).delete()
        .eq('branch_id', branchId).eq('template_id', templateId);
    } else {
      await supabase.from(DB_TABLES.BRANCH_SERVICES).insert({ branch_id: branchId, template_id: templateId, price: null });
    }
    await load();
  };

  const handleUpdatePrice = async (branchId: string, templateId: string, raw: string) => {
    const val = raw === '' ? null : Number(raw);
    await supabase.from(DB_TABLES.BRANCH_SERVICES)
      .update({ price: val })
      .eq('branch_id', branchId).eq('template_id', templateId);
    setBranchServices(prev => prev.map(bs =>
      bs.branch_id === branchId && bs.template_id === templateId ? { ...bs, price: val } : bs
    ));
  };

  const togglePrioCatalog = async (catalogName: string) => {
    const next = prioCatalogs.includes(catalogName)
      ? prioCatalogs.filter(n => n !== catalogName)
      : [...prioCatalogs, catalogName];
    setPrioCatalogs(next);
    await supabase.from(DB_TABLES.SYSTEM_CONFIG).upsert(
      { key: 'prio_service_catalogs', value: JSON.stringify(next) },
      { onConflict: 'key' }
    );
    // Bust all branch service template caches so POS picks up the PRIO change immediately
    queryClient.invalidateQueries({ queryKey: ['branch_service_templates'] });
    playSound('click');
  };

  // Bulk-assign all templates in a catalog group to the selected branches
  const handleBulkAssign = async () => {
    if (!bulkAssign || bulkSelectedBranches.length === 0) return;
    setIsBulkSaving(true);
    try {
      if (bulkMode === 'assign') {
        // Always additive — PRIO only affects POS display filtering, not assignment storage
        const rows: { branch_id: string; template_id: string; price: number | null }[] = [];
        for (const branchId of bulkSelectedBranches) {
          for (const templateId of bulkAssign.templateIds) {
            rows.push({ branch_id: branchId, template_id: templateId, price: null });
          }
        }
        if (rows.length > 0) {
          await supabase.from(DB_TABLES.BRANCH_SERVICES)
            .upsert(rows, { onConflict: 'branch_id,template_id', ignoreDuplicates: true });
        }
      } else if (bulkMode === 'unassign') {
        for (const branchId of bulkSelectedBranches) {
          await supabase.from(DB_TABLES.BRANCH_SERVICES)
            .delete()
            .eq('branch_id', branchId)
            .in('template_id', bulkAssign.templateIds);
        }
      }
      playSound('success');
      setBulkAssign(null); setBulkSelectedBranches([]); setBulkMode('assign');
      await load();
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleImport = async () => {
    if (!importTo || importSelected.length === 0) return;
    setIsImportSaving(true);
    try {
      const toInsert = importSelected.map(tid => {
        const tmpl = templates.find(t => t.id === tid)!;
        const priceStr = importPrices[tid];
        const price = priceStr !== undefined && priceStr !== '' ? parseFloat(priceStr) : tmpl.default_price;
        return {
          id: Math.random().toString(36).substr(2, 9),
          name: tmpl.name,
          catalog_name: importTo,
          default_price: price,
          duration: tmpl.duration,
          primary_role: tmpl.primary_role,
          secondary_role: tmpl.secondary_role,
          commission_type: tmpl.commission_type,
          commission_value: tmpl.commission_value,
          is_dual_provider: tmpl.is_dual_provider,
          secondary_commission_type: tmpl.secondary_commission_type,
          secondary_commission_value: tmpl.secondary_commission_value,
          can_be_loyalty: tmpl.can_be_loyalty,
        };
      });
      const { error } = await supabase.from(DB_TABLES.SERVICE_TEMPLATES).insert(toInsert);
      if (error) throw error;
      playSound('success');
      // Catalog now has real services — remove from local-only list
      setLocalCatalogNames(prev => prev.filter(n => n !== importTo));
      setFilterCatalog(importTo); // navigate to the newly populated catalog
      setImportTo(null);
      setImportSelected([]);
      setImportPrices({});
      setImportStep(1);
      await load();
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsImportSaving(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-slate-900 leading-none tracking-tight">Service Templates</h3>
          {!isReadOnly && (
            <button
              onClick={() => { setNewCatalogName(''); setShowNewCatalogModal(true); playSound('click'); }}
              className="h-8 px-3 bg-slate-900 text-white rounded-xl text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 hover:bg-emerald-600 transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-3 h-3" strokeWidth={3} />
              <span>New Catalog</span>
            </button>
          )}
        </div>
        {/* Stats row — separate so button never overlaps */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{templates.length} services</span>
          <span className="text-slate-200">·</span>
          <span className="text-xs text-slate-400">{branchServices.length} assignments</span>
          {totalOverrides > 0 && <>
            <span className="text-slate-200">·</span>
            <span className="text-xs text-amber-500">{totalOverrides} price overrides</span>
          </>}
        </div>

        {/* Search + view toggle row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value.toUpperCase())}
              placeholder="Search services..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-400 transition-all"
            />
          </div>
          <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5 shrink-0">
            <button onClick={() => setViewMode('services')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${
                viewMode === 'services' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}>
              <LayoutGrid className="w-3 h-3" strokeWidth={2.5} />
              <span className="hidden sm:inline">Catalogs</span>
            </button>
            <button onClick={() => setViewMode('branches')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${
                viewMode === 'branches' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}>
              <List className="w-3 h-3" strokeWidth={2.5} />
              <span className="hidden sm:inline">By Branch</span>
            </button>
          </div>
        </div>

        {/* Catalog filter pills */}
        {viewMode === 'services' && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {catalogNames.map(c => (
              <button key={c} onClick={() => setFilterCatalog(c)}
                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  filterCatalog === c
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}>
                {c === 'ALL' ? 'All' : c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Branches view ── */}
      {viewMode === 'branches' && (
        <div className="space-y-3">
          {branches.filter(branch =>
            !search || branch.name.toUpperCase().includes(search)
          ).map(branch => {
            const totalAssigned = templates.filter(t =>
              branchServices.some(bs => bs.template_id === t.id && bs.branch_id === branch.id)
            ).length;
            return (
              <div key={branch.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                {/* Branch header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
                      <span className="text-xs font-black text-slate-600">{branch.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tight text-slate-900 leading-none">{branch.name}</p>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">{totalAssigned} of {templates.length} services assigned</p>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <button
                      onClick={() => { setBranchManage(branch); playSound('click'); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all active:scale-95"
                    >
                      <GitBranch className="w-3 h-3" />
                      Manage
                    </button>
                  )}
                </div>
                {/* Catalog groups for this branch */}
                <div className="divide-y divide-slate-50">
                  {(Object.entries(catalogGroups) as [string, ServiceTemplate[]][])
                    .filter(([, items]) => filterCatalog === 'ALL' || filterCatalog === items[0]?.catalog_name)
                    .map(([group, items]) => {
                      const assignedInGroup = items.filter(t =>
                        branchServices.some(bs => bs.template_id === t.id && bs.branch_id === branch.id)
                      );
                      const allAssigned = assignedInGroup.length === items.length;
                      const partiallyAssigned = assignedInGroup.length > 0 && !allAssigned;
                      const palette = getCatalogPalette(group);
                      return (
                        <div key={group} className="flex items-center gap-4 px-5 py-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${allAssigned ? palette.dot : partiallyAssigned ? 'bg-amber-400' : 'bg-slate-200'}`} />
                          <p className="flex-1 text-xs font-black uppercase tracking-tight text-slate-700">{group}</p>
                          <span className={`text-xs font-bold ${allAssigned ? 'text-emerald-600' : partiallyAssigned ? 'text-amber-500' : 'text-slate-300'} uppercase tracking-widest`}>
                            {assignedInGroup.length}/{items.length}
                          </span>
                          {!isReadOnly && (
                            <button
                              onClick={() => {
                                setBulkAssign({ catalogName: group, templateIds: items.map(t => t.id) });
                                setBulkSelectedBranches([branch.id]);
                                setBulkMode('assign');
                                playSound('click');
                              }}
                              className="text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-emerald-600 transition-colors"
                            >
                              {allAssigned ? 'All assigned' : 'Assign all →'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Template list ── */}
      {viewMode === 'services' && isLoading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : viewMode === 'services' && Object.keys(filteredGroups).length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-xs font-medium uppercase tracking-wide">No services found</p>
        </div>
      ) : viewMode === 'services' ? (
        (Object.entries(filteredGroups) as [string, ServiceTemplate[]][]).map(([group, items]) => (
          <div key={group} className="space-y-3">
            {/* Group header */}
            <div className="flex items-center gap-2 px-1">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 whitespace-nowrap shrink-0">{group}</p>
              {prioCatalogs.includes(group) && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-600 text-xs font-semibold uppercase tracking-wide shrink-0">PRIO</span>
              )}
              <div className="flex-1 h-px bg-slate-200 min-w-0" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap shrink-0">{items.length} service{items.length !== 1 ? 's' : ''}</span>
              {!isReadOnly && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* ⋯ overflow menu */}
                  <div className="relative" ref={openCatalogMenu === group ? catalogMenuRef : null}>
                    <button
                      onClick={() => { setOpenCatalogMenu(openCatalogMenu === group ? null : group); playSound('click'); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all text-sm font-bold"
                    >
                      ···
                    </button>
                    {openCatalogMenu === group && (
                      <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                          onClick={() => {
                            setEditingTemplate({ id: '', ...BLANK, catalog_name: group });
                            setIsNew(true);
                            setOpenCatalogMenu(null);
                            playSound('click');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Plus className="w-3 h-3 text-slate-400" strokeWidth={3} />
                          Add Service
                        </button>
                        <button
                          onClick={() => {
                            setImportTo(group);
                            setImportSelected([]);
                            setImportPrices({});
                            setImportStep(1);
                            setOpenCatalogMenu(null);
                            playSound('click');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <BookOpen className="w-3 h-3 text-slate-400" />
                          Import Services
                        </button>
                        <div className="my-1 border-t border-slate-100" />
                        <button
                          onClick={() => { togglePrioCatalog(group); setOpenCatalogMenu(null); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold transition-colors ${prioCatalogs.includes(group) ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span className="text-xs">★</span>
                          {prioCatalogs.includes(group) ? 'Remove PRIO' : 'Mark as PRIO'}
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Assign — primary action stays visible */}
                  {items.length > 0 && (
                    <button
                      onClick={() => {
                        setBulkAssign({ catalogName: group, templateIds: items.map(t => t.id) });
                        setBulkSelectedBranches([]);
                        setBulkMode('assign');
                        playSound('click');
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all active:scale-95"
                    >
                      <Zap className="w-2.5 h-2.5 shrink-0" />
                      <span className="hidden sm:inline">Assign</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Empty catalog placeholder */}
            {items.length === 0 && (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <BookOpen className="w-7 h-7 text-slate-200" />
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Empty Catalog</p>
                  <p className="text-xs text-slate-300 mt-1">Use <span className="font-bold text-indigo-400">Import</span> to pull services from other catalogs, or <span className="font-bold text-slate-500">Add</span> to create a new service.</p>
                </div>
              </div>
            )}
            {/* Service rows */}
            {items.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              {items.map((t, idx) => {
                const bc = branchCount(t.id);
                const oc = overrideCount(t.id);
                const palette = getCatalogPalette(t.catalog_name);
                const assignedBranches = branches.filter(b =>
                  branchServices.some(bs => bs.template_id === t.id && bs.branch_id === b.id)
                );
                const isLongPressing = longPressingId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`px-4 py-3 transition-colors select-none ${idx > 0 ? 'border-t border-slate-50' : ''} ${isLongPressing ? 'bg-rose-50' : 'hover:bg-slate-50/50'} ${!isReadOnly ? 'cursor-pointer active:bg-slate-100' : ''}`}
                    onClick={() => {
                      if (longPressTriggered.current) { longPressTriggered.current = false; return; }
                      if (isReadOnly) return;
                      setEditingTemplate(t); setIsNew(false); playSound('click');
                    }}
                    onMouseDown={() => {
                      if (isReadOnly) return;
                      longPressTriggered.current = false;
                      setLongPressingId(t.id);
                      longPressTimer.current = setTimeout(() => {
                        longPressTriggered.current = true;
                        setLongPressingId(null);
                        setDeleteConfirm(t);
                        playSound('warning');
                      }, 700);
                    }}
                    onMouseUp={() => { clearTimeout(longPressTimer.current!); setLongPressingId(null); }}
                    onMouseLeave={() => { clearTimeout(longPressTimer.current!); setLongPressingId(null); }}
                    onTouchStart={() => {
                      if (isReadOnly) return;
                      longPressTriggered.current = false;
                      setLongPressingId(t.id);
                      longPressTimer.current = setTimeout(() => {
                        longPressTriggered.current = true;
                        setLongPressingId(null);
                        setDeleteConfirm(t);
                        playSound('warning');
                      }, 700);
                    }}
                    onTouchEnd={() => { clearTimeout(longPressTimer.current!); setLongPressingId(null); }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Long-press progress indicator / color dot */}
                      <div className="relative shrink-0 w-4 h-4 flex items-center justify-center">
                        {isLongPressing ? (
                          <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
                            <circle cx="8" cy="8" r="6" fill="none" stroke="#fca5a5" strokeWidth="2" />
                            <circle cx="8" cy="8" r="6" fill="none" stroke="#ef4444" strokeWidth="2"
                              strokeDasharray="37.7" strokeDashoffset="37.7"
                              style={{ animation: 'dash 0.7s linear forwards' }}
                            />
                          </svg>
                        ) : (
                          <div className={`w-2 h-2 rounded-full ${palette.dot}`} />
                        )}
                      </div>

                      {/* Name + meta stacked */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-black uppercase tracking-tight truncate leading-none transition-colors ${isLongPressing ? 'text-rose-600' : 'text-slate-900'}`} title={t.name}>
                          {t.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 leading-none">
                          {t.duration} min · <span className={`font-bold ${palette.icon}`}>₱{t.default_price.toLocaleString()}</span>
                        </p>
                        {isLongPressing && (
                          <p className="text-xs font-black text-rose-400 uppercase tracking-widest mt-1 animate-pulse">Hold to delete…</p>
                        )}
                      </div>

                      {/* Assign button */}
                      {!isReadOnly && (
                        <button
                          onClick={e => { e.stopPropagation(); setManagingTemplate(t); setDraftBranchIds(assignedBranches.map(b => b.id)); playSound('click'); }}
                          onMouseDown={e => e.stopPropagation()}
                          onTouchStart={e => e.stopPropagation()}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all shrink-0 ${
                            bc === 0
                              ? 'bg-rose-50 text-rose-400 hover:bg-rose-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          <span className="text-xs font-black tabular-nums">{bc}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        ))
      ) : null}

      {/* ── Create / Edit Modal ── */}
      {editingTemplate && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{isNew ? 'New Service' : 'Edit Service'}</h3>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Template Definition</p>
              </div>
              <button onClick={() => { setEditingTemplate(null); setSaveConfirm(false); }} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Service Name</label>
                <input
                  value={editingTemplate.name}
                  onChange={e => setEditingTemplate(t => t && ({ ...t, name: e.target.value.toUpperCase() }))}
                  maxLength={80}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all uppercase"
                  placeholder="SERVICE NAME"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Catalog Group</label>
                <input
                  value={editingTemplate.catalog_name || ''}
                  onChange={e => setEditingTemplate(t => t && ({ ...t, catalog_name: e.target.value.toUpperCase() }))}
                  list="catalog-suggestions"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all uppercase"
                  placeholder="E.G. HILOT SERVICES"
                />
                <datalist id="catalog-suggestions">
                  {catalogNames.filter(c => c !== 'ALL').map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {(() => {
                  const val = editingTemplate.catalog_name || '';
                  const suggestions = catalogNames.filter(c => c !== 'ALL' && c !== val && c.includes(val) && val.length > 0);
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {suggestions.map(s => (
                        <button key={s} type="button"
                          onClick={() => setEditingTemplate(t => t && ({ ...t, catalog_name: s }))}
                          className="px-2.5 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold uppercase tracking-wide hover:bg-emerald-100 transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Default Price (₱)</label>
                  <input type="number" min="0"
                    value={editingTemplate.default_price}
                    onChange={e => setEditingTemplate(t => t && ({ ...t, default_price: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Duration (min)</label>
                  <input type="number" min="0"
                    value={editingTemplate.duration}
                    onChange={e => setEditingTemplate(t => t && ({ ...t, duration: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Primary Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {['THERAPIST', 'BONESETTER'].map(role => (
                    <button key={role}
                      onClick={() => setEditingTemplate(t => t && ({ ...t, primary_role: role }))}
                      className={`py-3 rounded-xl text-xs font-semibold uppercase tracking-wide border transition-all ${
                        editingTemplate.primary_role === role
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      }`}>
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-700">Dual Provider</p>
                  <p className="text-xs text-slate-400">Requires both therapist &amp; bonesetter</p>
                </div>
                <button
                  onClick={() => setEditingTemplate(t => t && ({
                    ...t,
                    is_dual_provider: !t.is_dual_provider,
                    secondary_role: !t.is_dual_provider ? (t.primary_role === 'THERAPIST' ? 'BONESETTER' : 'THERAPIST') : null,
                    secondary_commission_value: !t.is_dual_provider ? (t.secondary_commission_value ?? 0) : null,
                  }))}
                  className={`relative rounded-full transition-all shrink-0 ${editingTemplate.is_dual_provider ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  style={{ width: 44, height: 24 }}
                >
                  <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all ${editingTemplate.is_dual_provider ? 'left-[23px]' : 'left-[3px]'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Commission (₱)</label>
                  <input type="number" min="0"
                    value={editingTemplate.commission_value}
                    onChange={e => setEditingTemplate(t => t && ({ ...t, commission_value: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                  />
                </div>
                {editingTemplate.is_dual_provider && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">2nd Commission (₱)</label>
                    <input type="number" min="0"
                      value={editingTemplate.secondary_commission_value ?? 0}
                      onChange={e => setEditingTemplate(t => t && ({ ...t, secondary_commission_value: Number(e.target.value) }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-700">Loyalty Eligible</p>
                  <p className="text-xs text-slate-400">Can be redeemed as a loyalty reward</p>
                </div>
                <button
                  onClick={() => setEditingTemplate(t => t && ({ ...t, can_be_loyalty: !t.can_be_loyalty }))}
                  className={`relative rounded-full transition-all shrink-0 ${editingTemplate.can_be_loyalty ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  style={{ width: 44, height: 24 }}
                >
                  <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all ${editingTemplate.can_be_loyalty ? 'left-[23px]' : 'left-[3px]'}`} />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 shrink-0">
              {saveConfirm ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 text-center uppercase tracking-widest">
                    {isNew ? 'Create this service template?' : 'Save changes to this service?'}
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setSaveConfirm(false)}
                      className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50 transition-all">
                      Go Back
                    </button>
                    <button onClick={() => { setSaveConfirm(false); handleSaveTemplate(); }} disabled={isSaving}
                      className="flex-[2] py-3 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-slate-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                      {isSaving && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {isSaving ? 'Saving...' : 'Yes, Confirm'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => { setSaveConfirm(false); setEditingTemplate(null); }}
                    className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50 transition-all">
                    Cancel
                  </button>
                  <button onClick={() => setSaveConfirm(true)} disabled={!editingTemplate.name.trim()}
                    className="flex-[2] py-3 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-slate-800 transition-all disabled:opacity-40">
                    {isNew ? 'Create Service' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Branch Assignments Modal ── */}
      {managingTemplate && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-900 leading-tight truncate">{managingTemplate.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Default price: <span className="font-bold text-slate-600">₱{managingTemplate.default_price.toLocaleString()}</span></p>
                </div>
                <button
                  onClick={() => { setManagingTemplate(null); setDraftBranchIds([]); }}
                  className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary pill */}
              <div className="mt-3 flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold uppercase tracking-wide">
                  {draftBranchIds.length} branch{draftBranchIds.length !== 1 ? 'es' : ''} selected
                </span>
                {draftBranchIds.length > 0 && !isReadOnly && (
                  <button
                    onClick={() => setDraftBranchIds([])}
                    className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Branch list */}
            <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
              {branches.map(b => {
                const inDraft = draftBranchIds.includes(b.id);
                const assignment = branchServices.find(bs => bs.branch_id === b.id && bs.template_id === managingTemplate.id);
                return (
                  <div
                    key={b.id}
                    className={`rounded-2xl border-2 overflow-hidden transition-all ${
                      inDraft ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-white'
                    }`}
                  >
                    {/* Branch row — tap to toggle */}
                    <button
                      disabled={isReadOnly}
                      onClick={() => setDraftBranchIds(prev =>
                        prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                      )}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        inDraft ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                      }`}>
                        {inDraft && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`flex-1 text-xs font-bold truncate ${inDraft ? 'text-slate-900' : 'text-slate-500'}`}>
                        {b.name}
                      </span>
                      {assignment?.price != null && (
                        <span className="text-xs font-black text-amber-500 shrink-0">₱{assignment.price.toLocaleString()} custom</span>
                      )}
                    </button>

                    {/* Price override — only visible when selected */}
                    {inDraft && (
                      <div className="px-4 pb-3 flex items-center gap-2 border-t border-emerald-100">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide shrink-0">Custom price</span>
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-xs font-bold text-slate-400">₱</span>
                          <input
                            type="number"
                            min="0"
                            disabled={isReadOnly || !assignment}
                            value={assignment?.price ?? ''}
                            onChange={e => assignment && handleUpdatePrice(b.id, managingTemplate.id, e.target.value)}
                            placeholder={String(managingTemplate.default_price)}
                            className="w-24 px-2 py-1 bg-white border border-emerald-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-emerald-400 tabular-nums transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        </div>
                        {!assignment && (
                          <span className="text-xs text-slate-400 italic">Save first to set custom price</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            {!isReadOnly && (
              <div className="px-4 py-4 border-t border-slate-100 shrink-0 flex gap-2">
                <button
                  onClick={() => { setManagingTemplate(null); setDraftBranchIds([]); }}
                  className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={isAssignSaving}
                  onClick={async () => {
                    if (!managingTemplate) return;
                    setIsAssignSaving(true);
                    try {
                      const originalIds = branches
                        .filter(b => branchServices.some(bs => bs.branch_id === b.id && bs.template_id === managingTemplate.id))
                        .map(b => b.id);
                      const toAdd = draftBranchIds.filter(id => !originalIds.includes(id));
                      const toRemove = originalIds.filter(id => !draftBranchIds.includes(id));
                      if (toAdd.length > 0) {
                        await supabase.from(DB_TABLES.BRANCH_SERVICES)
                          .upsert(
                            toAdd.map(branch_id => ({ branch_id, template_id: managingTemplate.id, price: null })),
                            { onConflict: 'branch_id,template_id', ignoreDuplicates: true }
                          );
                      }
                      for (const branchId of toRemove) {
                        await supabase.from(DB_TABLES.BRANCH_SERVICES).delete()
                          .eq('branch_id', branchId).eq('template_id', managingTemplate.id);
                      }
                      playSound('success');
                      setManagingTemplate(null);
                      setDraftBranchIds([]);
                      await load();
                    } catch (err) {
                      console.error(err);
                      playSound('warning');
                    } finally {
                      setIsAssignSaving(false);
                    }
                  }}
                  className="flex-[2] py-3.5 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isAssignSaving && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                  {isAssignSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── New Catalog Modal ── */}
      {showNewCatalogModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-900">New Catalog</h3>
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Give your catalog a name</p>
              </div>
              <button onClick={() => setShowNewCatalogModal(false)} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <input
                autoFocus
                value={newCatalogName}
                onChange={e => setNewCatalogName(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newCatalogName.trim() && !catalogNames.includes(newCatalogName.trim())) {
                    const name = newCatalogName.trim();
                    setLocalCatalogNames(prev => [...prev, name]);
                    setShowNewCatalogModal(false);
                    setImportTo(name);
                    setImportSelected([]);
                    setImportPrices({});
                    setImportStep(1);
                    playSound('success');
                  }
                }}
                placeholder="E.G. BER SEASON RATES"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all uppercase tracking-wide"
              />
              {newCatalogName.trim() && catalogNames.includes(newCatalogName.trim()) && (
                <p className="text-xs font-bold text-rose-500 uppercase tracking-widest">A catalog with this name already exists.</p>
              )}
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  const name = newCatalogName.trim();
                  if (!name || catalogNames.includes(name)) return;
                  setLocalCatalogNames(prev => [...prev, name]);
                  setShowNewCatalogModal(false);
                  setImportTo(name);
                  setImportSelected([]);
                  setImportPrices({});
                  setImportStep(1);
                  playSound('success');
                }}
                disabled={!newCatalogName.trim() || catalogNames.includes(newCatalogName.trim())}
                className="w-full py-3.5 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                Create Catalog &amp; Import Services
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Import Services Modal ── */}
      {importTo !== null && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between shrink-0">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-0.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-slate-900">
                    {importStep === 1 ? 'Import Services' : 'Set Prices'}
                  </h3>
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">
                  Into: {importTo}{importStep === 2 ? ` · ${importSelected.length} service${importSelected.length !== 1 ? 's' : ''}` : ''}
                </p>
              </div>
              <button
                onClick={() => { setImportTo(null); setImportSelected([]); setImportPrices({}); setImportStep(1); setFilterCatalog('ALL'); }}
                className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1 — Pick services */}
            {importStep === 1 && (() => {
              const otherGroups = Object.entries(
                templates
                  .filter(t => t.catalog_name !== importTo)
                  .reduce<Record<string, ServiceTemplate[]>>((acc, t) => {
                    const key = t.catalog_name || 'Uncategorized';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(t);
                    return acc;
                  }, {})
              ) as [string, ServiceTemplate[]][];

              return (
                <>
                  <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 shrink-0">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest">
                      Select services to copy into <span className="text-indigo-900">{importTo}</span>. You'll set prices in the next step.
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {otherGroups.map(([catalogName, catalogItems]) => {
                      const allSelected = catalogItems.every(t => importSelected.includes(t.id));
                      const someSelected = catalogItems.some(t => importSelected.includes(t.id));
                      return (
                        <div key={catalogName}>
                          {/* Catalog sub-header with select-all */}
                          <button
                            onClick={() => {
                              if (allSelected) {
                                setImportSelected(prev => prev.filter(id => !catalogItems.map(t => t.id).includes(id)));
                              } else {
                                setImportSelected(prev => [...new Set([...prev, ...catalogItems.map(t => t.id)])]);
                              }
                            }}
                            className="w-full flex items-center gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-100 hover:bg-slate-100 transition-colors text-left"
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${allSelected ? 'bg-indigo-600 border-indigo-600' : someSelected ? 'bg-indigo-200 border-indigo-400' : 'border-slate-300'}`}>
                              {allSelected && <Check className="w-2.5 h-2.5 text-white" />}
                              {!allSelected && someSelected && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-sm" />}
                            </div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{catalogName}</p>
                            <span className="ml-auto text-xs font-bold text-slate-400">{catalogItems.length} services</span>
                          </button>
                          {/* Service rows */}
                          {catalogItems.map(t => {
                            const isSelected = importSelected.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                onClick={() => setImportSelected(prev =>
                                  prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                )}
                                className={`w-full flex items-center gap-3 px-5 py-3 border-b border-slate-50 transition-colors text-left ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                              >
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                  {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <p className="flex-1 text-xs font-bold text-slate-700 min-w-0 truncate">{t.name}</p>
                                <span className="text-xs font-bold text-slate-400 shrink-0">₱{t.default_price.toLocaleString()}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-6 py-4 border-t border-slate-100 shrink-0">
                    <button
                      onClick={() => setImportStep(2)}
                      disabled={importSelected.length === 0}
                      className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-indigo-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {importSelected.length === 0 ? 'Select services above' : `Next: Set Prices → (${importSelected.length} selected)`}
                    </button>
                  </div>
                </>
              );
            })()}

            {/* Step 2 — Set prices */}
            {importStep === 2 && (
              <>
                <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 shrink-0">
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest">
                    Set a custom price for each service in <span className="text-indigo-900">{importTo}</span>. Leave blank to keep the original price.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                  {importSelected.map(tid => {
                    const tmpl = templates.find(t => t.id === tid);
                    if (!tmpl) return null;
                    return (
                      <div key={tid} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{tmpl.name}</p>
                          <p className="text-xs text-slate-400 font-semibold mt-0.5">Original: ₱{tmpl.default_price.toLocaleString()}</p>
                        </div>
                        <div className="shrink-0 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₱</span>
                          <input
                            type="number"
                            min="0"
                            placeholder={String(tmpl.default_price)}
                            value={importPrices[tid] ?? ''}
                            onChange={e => setImportPrices(prev => ({ ...prev, [tid]: e.target.value }))}
                            className="w-28 pl-7 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-2">
                  <button
                    onClick={() => setImportStep(1)}
                    className="px-5 py-3.5 rounded-2xl bg-slate-100 text-slate-600 text-xs font-semibold uppercase tracking-wide hover:bg-slate-200 transition-all shrink-0"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={isImportSaving}
                    className="flex-1 py-3.5 rounded-2xl bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-indigo-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {isImportSaving && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                    {isImportSaving ? 'Importing...' : `Import ${importSelected.length} service${importSelected.length !== 1 ? 's' : ''} into ${importTo}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Bulk Assign Modal ── */}
      {bulkAssign && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between shrink-0">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-0.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Bulk Assign
                  </h3>
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  {bulkAssign.catalogName} · {bulkAssign.templateIds.length} service{bulkAssign.templateIds.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => { setBulkAssign(null); setBulkSelectedBranches([]); setBulkMode('assign'); }} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0 flex items-center gap-2">
              <button
                onClick={() => { setBulkMode('assign'); setBulkSelectedBranches([]); }}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${bulkMode === 'assign' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-400 hover:text-white'}`}
              >
                Assign
              </button>
              <button
                onClick={() => { setBulkMode('unassign'); setBulkSelectedBranches([]); }}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${bulkMode === 'unassign' ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-400 hover:text-white'}`}
              >
                Unassign
              </button>
            </div>

            {/* PRIO warning banner */}
            {bulkMode === 'assign' && prioCatalogs.includes(bulkAssign.catalogName) && (
              <div className="px-6 py-3 bg-amber-400 shrink-0 flex items-start gap-2">
                <span className="text-white text-xs leading-none shrink-0 mt-0.5">★</span>
                <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                  PRIO catalog — assigning will replace ALL existing services on selected branches with only this catalog's services.
                </p>
              </div>
            )}

            {/* Info banner */}
            <div className={`px-6 py-3 border-b shrink-0 ${
              bulkMode === 'assign' ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'
            }`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${
                bulkMode === 'assign' ? 'text-amber-700' : 'text-rose-700'
              }`}>
                {bulkMode === 'assign'
                  ? `Select branches to assign all ${bulkAssign.templateIds.length} service${bulkAssign.templateIds.length !== 1 ? 's' : ''} in this catalog.`
                  : `Select branches to remove all ${bulkAssign.templateIds.length} service${bulkAssign.templateIds.length !== 1 ? 's' : ''} from.`
                }
              </p>
            </div>

            {/* Branch picker */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              <button
                onClick={() => {
                  if (bulkSelectedBranches.length === branches.length) {
                    setBulkSelectedBranches([]);
                  } else {
                    setBulkSelectedBranches(branches.map(b => b.id));
                  }
                }}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${bulkSelectedBranches.length === branches.length ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                  {bulkSelectedBranches.length === branches.length && <Check className="w-3 h-3 text-white" />}
                  {bulkSelectedBranches.length > 0 && bulkSelectedBranches.length < branches.length && (
                    <div className="w-2 h-2 bg-slate-400 rounded-sm" />
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {bulkSelectedBranches.length === branches.length ? 'Deselect All' : 'Select All Branches'}
                </p>
              </button>

              {branches.map(b => {
                const isSelected = bulkSelectedBranches.includes(b.id);
                const assignedCount = bulkAssign.templateIds.filter(tid =>
                  branchServices.some(bs => bs.branch_id === b.id && bs.template_id === tid)
                ).length;
                const allAssigned = assignedCount === bulkAssign.templateIds.length;
                const noneAssigned = assignedCount === 0;
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBulkSelectedBranches(prev =>
                        prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                      );
                    }}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left ${
                      isSelected
                        ? bulkMode === 'assign' ? 'bg-emerald-50' : 'bg-rose-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                      isSelected
                        ? bulkMode === 'assign' ? 'bg-emerald-500 border-emerald-500' : 'bg-rose-500 border-rose-500'
                        : 'border-slate-300'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <p className="flex-1 text-xs font-bold text-slate-700 min-w-0 truncate">{b.name}</p>
                    {bulkMode === 'assign' ? (
                      allAssigned ? (
                        <span className="text-xs font-black text-emerald-500 uppercase tracking-widest shrink-0">All assigned</span>
                      ) : assignedCount > 0 ? (
                        <span className="text-xs font-black text-amber-500 uppercase tracking-widest shrink-0">{assignedCount} assigned</span>
                      ) : null
                    ) : (
                      noneAssigned ? (
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide shrink-0">None assigned</span>
                      ) : (
                        <span className="text-xs font-black text-rose-400 uppercase tracking-widest shrink-0">{assignedCount} will remove</span>
                      )
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-2">
              <button
                onClick={handleBulkAssign}
                disabled={bulkSelectedBranches.length === 0 || isBulkSaving}
                className={`flex-1 py-3.5 rounded-2xl text-white text-xs font-semibold uppercase tracking-wide transition-all disabled:opacity-40 flex items-center justify-center gap-2 ${
                  bulkMode === 'assign' ? 'bg-slate-900 hover:bg-emerald-600' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isBulkSaving && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                {isBulkSaving
                  ? bulkMode === 'assign' ? 'Assigning...' : 'Removing...'
                  : bulkSelectedBranches.length === 0
                    ? 'Select branches above'
                    : bulkMode === 'assign'
                      ? `Assign to ${bulkSelectedBranches.length} branch${bulkSelectedBranches.length !== 1 ? 'es' : ''}`
                      : `Remove from ${bulkSelectedBranches.length} branch${bulkSelectedBranches.length !== 1 ? 'es' : ''}`
                }
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Branch Manage Modal (all services for a branch) ── */}
      {branchManage && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between shrink-0">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-0.5">
                  <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-900 truncate">{branchManage.name}</h3>
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Service Assignments</p>
              </div>
              <button onClick={() => setBranchManage(null)} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {(Object.entries(catalogGroups) as [string, ServiceTemplate[]][]).map(([group, items]) => {
                const assignedInGroup = items.filter(t =>
                  branchServices.some(bs => bs.template_id === t.id && bs.branch_id === branchManage.id)
                );
                const allAssigned = assignedInGroup.length === items.length;
                const palette = getCatalogPalette(group);
                return (
                  <div key={group}>
                    {/* Catalog group header with assign-all toggle */}
                    <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100 border-t">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{group}</p>
                        <span className="text-xs font-bold text-slate-400">{assignedInGroup.length}/{items.length}</span>
                      </div>
                      <button
                        onClick={() => {
                          setBulkAssign({ catalogName: group, templateIds: items.map(t => t.id) });
                          setBulkSelectedBranches([branchManage.id]);
                          setBulkMode('assign');
                          setBranchManage(null);
                          playSound('click');
                        }}
                        disabled={allAssigned}
                        className={`text-xs font-semibold uppercase tracking-wide transition-colors ${allAssigned ? 'text-emerald-400 cursor-default' : 'text-slate-400 hover:text-emerald-600'}`}
                      >
                        {allAssigned ? '✓ All assigned' : 'Assign all →'}
                      </button>
                    </div>
                    {/* Individual service rows */}
                    {items.map(t => {
                      const assignment = branchServices.find(bs => bs.branch_id === branchManage.id && bs.template_id === t.id);
                      const assigned = !!assignment;
                      return (
                        <div key={t.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50">
                          <button
                            onClick={() => handleToggleBranch(branchManage.id, t.id, assigned)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${assigned ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}
                          >
                            {assigned && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <p className="flex-1 text-xs font-bold text-slate-700 min-w-0 truncate uppercase" title={t.name}>{t.name}</p>
                          <span className="text-xs font-bold text-slate-400 shrink-0">₱{t.default_price.toLocaleString()}</span>
                          {assigned && assignment.price !== null && (
                            <span className="text-xs font-black text-amber-500 uppercase tracking-widest shrink-0">Override</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 shrink-0">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-center">
                {branchServices.filter(bs => bs.branch_id === branchManage.id).length} of {templates.length} services assigned to this branch
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-2xl p-8 text-center shadow-xl animate-in zoom-in-95 duration-300">
            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Trash2 className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Delete Service?</h3>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-2 mb-6 leading-relaxed">
              This removes <span className="text-slate-700 font-black">{deleteConfirm.name}</span> and all {branchCount(deleteConfirm.id)} branch assignments permanently.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleDelete} disabled={isSaving}
                className="w-full py-4 rounded-full bg-rose-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-rose-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {isSaving && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                {isSaving ? 'Deleting...' : 'Delete Service'}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="w-full py-3 text-slate-400 text-xs font-medium uppercase tracking-wide">
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
