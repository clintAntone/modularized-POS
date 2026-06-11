import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { Search, Plus, X, Edit2, Trash2, BookOpen, LayoutGrid, List } from 'lucide-react';

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
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [branchServices, setBranchServices] = useState<BranchService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCatalog, setFilterCatalog] = useState('ALL');
  const [viewMode, setViewMode] = useState<'services' | 'branches'>('services');
  const [editingTemplate, setEditingTemplate] = useState<ServiceTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [managingTemplate, setManagingTemplate] = useState<ServiceTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ServiceTemplate | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: tData }, { data: bsData }] = await Promise.all([
      supabase.from(DB_TABLES.SERVICE_TEMPLATES).select('*').order('catalog_name').order('name'),
      supabase.from(DB_TABLES.BRANCH_SERVICES).select('*'),
    ]);
    setTemplates(tData || []);
    setBranchServices(bsData || []);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const catalogGroups = useMemo(() => {
    const groups: Record<string, ServiceTemplate[]> = {};
    templates.forEach(t => {
      const key = t.catalog_name || 'Uncategorized';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [templates]);

  const catalogNames = useMemo(() => ['ALL', ...Object.keys(catalogGroups)], [catalogGroups]);

  const filteredGroups = useMemo(() => {
    const result: Record<string, ServiceTemplate[]> = {};
    (Object.entries(catalogGroups) as [string, ServiceTemplate[]][]).forEach(([group, items]) => {
      if (filterCatalog !== 'ALL' && filterCatalog !== group) return;
      const filtered = items.filter(t =>
        !search ||
        t.name.includes(search) ||
        t.default_price.toString().includes(search)
      );
      if (filtered.length > 0) result[group] = filtered;
    });
    return result;
  }, [catalogGroups, filterCatalog, search]);

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

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="bg-slate-900 rounded-[24px] p-5 sm:p-6 text-white">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-lg shrink-0">🗂️</div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-black uppercase tracking-tighter leading-none text-white truncate">Service Templates</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">Normalized Service Registry</p>
            </div>
          </div>
          {!isReadOnly && (
            <button
              onClick={() => { setEditingTemplate({ id: '', ...BLANK }); setIsNew(true); playSound('click'); }}
              className="h-9 w-9 sm:w-auto sm:px-4 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />
              <span className="hidden sm:inline">New Service</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Templates', value: templates.length },
            { label: 'Assignments', value: branchServices.length },
            { label: 'Price Overrides', value: totalOverrides },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white/5 rounded-2xl p-3 text-center">
              <p className="text-lg font-black tabular-nums text-white leading-none">{kpi.value}</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {/* Row 1: search (full width on mobile) + catalog pills (beside on desktop) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value.toUpperCase())}
                placeholder="SEARCH SERVICES..."
                className="w-full pl-9 pr-4 py-2.5 bg-white/10 border border-white/10 rounded-xl text-[11px] font-black text-white placeholder:text-slate-500 outline-none focus:border-white/30 transition-all uppercase tracking-wider"
              />
            </div>
            <div className="flex bg-white/10 rounded-2xl p-1 gap-0.5 overflow-x-auto no-scrollbar shrink-0">
              {catalogNames.map(c => (
                <button key={c} onClick={() => setFilterCatalog(c)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${
                    filterCatalog === c ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
                  }`}>
                  {c === 'ALL' ? 'All' : c}
                </button>
              ))}
            </div>
          </div>
          {/* Row 2: view mode toggle */}
          <div className="flex bg-white/10 rounded-2xl p-1 gap-0.5 self-start w-fit">
            <button onClick={() => setViewMode('services')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'services' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}>
              <LayoutGrid className="w-3.5 h-3.5" strokeWidth={2.5} />
              Catalogs
            </button>
            <button onClick={() => setViewMode('branches')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'branches' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}>
              <List className="w-3.5 h-3.5" strokeWidth={2.5} />
              By Branch
            </button>
          </div>
        </div>
      </div>

      {/* ── Branches view ── */}
      {viewMode === 'branches' && (
        <div className="space-y-3">
          {branches.filter(branch =>
            !search || branch.name.toUpperCase().includes(search)
          ).map(branch => {
            const assignedTemplates = templates.filter(t =>
              branchServices.some(bs => bs.template_id === t.id && bs.branch_id === branch.id)
            ).filter(t =>
              filterCatalog === 'ALL' || t.catalog_name === filterCatalog
            );
            return (
              <div key={branch.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-tight text-slate-900">{branch.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{assignedTemplates.length} service{assignedTemplates.length !== 1 ? 's' : ''} assigned</p>
                  </div>
                  <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-sm">🏢</div>
                </div>
                {assignedTemplates.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {assignedTemplates.map(t => {
                      const palette = getCatalogPalette(t.catalog_name);
                      const bs = branchServices.find(b => b.branch_id === branch.id && b.template_id === t.id);
                      const price = bs?.price != null ? bs.price : t.default_price;
                      return (
                        <div key={t.id} className={`flex items-center gap-1.5 ${palette.light} ${palette.icon} px-2.5 py-1.5 rounded-xl border border-white/50`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${palette.dot} shrink-0`} />
                          <span className="text-[10px] font-black uppercase tracking-tight">{t.name}</span>
                          <span className="text-[9px] font-bold opacity-70">₱{price.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">No services match current filters</p>
                )}
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
          <p className="text-[11px] font-bold uppercase tracking-widest">No services found</p>
        </div>
      ) : viewMode === 'services' ? (
        (Object.entries(filteredGroups) as [string, ServiceTemplate[]][]).map(([group, items]) => (
          <div key={group} className="space-y-3">
            {/* Group header */}
            <div className="flex items-center gap-3 px-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{group}</p>
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{items.length} service{items.length !== 1 ? 's' : ''}</span>
            </div>
            {/* Cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
              {items.map(t => {
                const tComm = t.is_dual_provider
                  ? (t.primary_role === 'THERAPIST' ? t.commission_value : (t.secondary_commission_value ?? 0))
                  : (t.primary_role === 'THERAPIST' ? t.commission_value : null);
                const bComm = t.is_dual_provider
                  ? (t.primary_role === 'BONESETTER' ? t.commission_value : (t.secondary_commission_value ?? 0))
                  : (t.primary_role === 'BONESETTER' ? t.commission_value : null);
                const bc = branchCount(t.id);
                const oc = overrideCount(t.id);
                const palette = getCatalogPalette(t.catalog_name);
                const assignedBranches = branches.filter(b =>
                  branchServices.some(bs => bs.template_id === t.id && bs.branch_id === b.id)
                );
                const typeLabel = t.can_be_loyalty ? 'Loyalty' : t.is_dual_provider ? 'Dual Provider' : 'Standard';
                const typeDot = t.can_be_loyalty ? 'bg-emerald-500' : t.is_dual_provider ? 'bg-violet-500' : 'bg-slate-400';
                const typeText = t.can_be_loyalty ? 'text-emerald-600' : t.is_dual_provider ? 'text-violet-600' : 'text-slate-400';
                return (
                  <div key={t.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-200 transition-all overflow-hidden flex flex-col">
                    {/* Colored accent bar */}
                    <div className={`h-1 ${palette.dot}`} />

                    <div className="p-4 flex flex-col flex-1 gap-3">
                      {/* Icon + actions */}
                      <div className="flex justify-between items-start">
                        <div className={`w-9 h-9 ${palette.light} ${palette.icon} rounded-xl flex items-center justify-center shrink-0`}>
                          <BookOpen className="w-4 h-4" />
                        </div>
                        {!isReadOnly && (
                          <div className="flex gap-1.5">
                            <button onClick={() => { setEditingTemplate(t); setIsNew(false); playSound('click'); }} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-slate-100 shadow-sm">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setDeleteConfirm(t); playSound('warning'); }} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all border border-slate-100 shadow-sm">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Name + price */}
                      <div>
                        <h4 className="font-black text-slate-900 text-[13px] uppercase tracking-tight leading-tight">{t.name}</h4>
                        <p className={`text-[15px] font-black mt-0.5 ${palette.icon}`}>₱{t.default_price.toLocaleString()}</p>
                      </div>

                      {/* Details */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Duration</span>
                          <span className="text-[12px] font-bold text-slate-700">{t.duration} min</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Therapist Commission</span>
                          <span className="text-[12px] font-bold text-slate-700">{tComm !== null ? `₱${tComm}` : '₱0'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bonesetter Commission</span>
                          <span className="text-[12px] font-bold text-slate-700">{bComm !== null ? `₱${bComm}` : '₱0'}</span>
                        </div>
                      </div>

                      {/* Branch chips + footer */}
                      <div className="mt-auto pt-3 border-t border-slate-50 space-y-2">
                        {assignedBranches.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedBranches.slice(0, 3).map(b => (
                              <span key={b.id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[8px] font-black uppercase tracking-widest truncate max-w-[90px]">{b.name}</span>
                            ))}
                            {assignedBranches.length > 3 && (
                              <button onClick={() => { setManagingTemplate(t); playSound('click'); }} className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-md text-[8px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors">
                                +{assignedBranches.length - 3}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">No branches assigned</span>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${typeDot}`} />
                            <span className={`text-[9px] font-bold uppercase tracking-tight ${typeText}`}>{typeLabel}</span>
                          </div>
                          <button onClick={() => { setManagingTemplate(t); playSound('click'); }} className="text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">
                            {bc} branches{oc > 0 ? ` · ${oc} custom` : ''}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : null}

      {/* ── Create / Edit Modal ── */}
      {editingTemplate && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-[28px] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="bg-slate-900 rounded-t-[28px] px-6 py-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[13px] font-black text-white uppercase tracking-tight">{isNew ? 'New Service' : 'Edit Service'}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Template Definition</p>
              </div>
              <button onClick={() => { setEditingTemplate(null); setSaveConfirm(false); }} className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Service Name</label>
                <input
                  value={editingTemplate.name}
                  onChange={e => setEditingTemplate(t => t && ({ ...t, name: e.target.value.toUpperCase() }))}
                  maxLength={80}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all uppercase"
                  placeholder="SERVICE NAME"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Catalog Group</label>
                <input
                  value={editingTemplate.catalog_name || ''}
                  onChange={e => setEditingTemplate(t => t && ({ ...t, catalog_name: e.target.value.toUpperCase() }))}
                  list="catalog-suggestions"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all uppercase"
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
                          className="px-2.5 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Default Price (₱)</label>
                  <input type="number" min="0"
                    value={editingTemplate.default_price}
                    onChange={e => setEditingTemplate(t => t && ({ ...t, default_price: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Duration (min)</label>
                  <input type="number" min="0"
                    value={editingTemplate.duration}
                    onChange={e => setEditingTemplate(t => t && ({ ...t, duration: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Primary Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {['THERAPIST', 'BONESETTER'].map(role => (
                    <button key={role}
                      onClick={() => setEditingTemplate(t => t && ({ ...t, primary_role: role }))}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
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
                  <p className="text-[11px] font-bold text-slate-700">Dual Provider</p>
                  <p className="text-[9px] text-slate-400">Requires both therapist &amp; bonesetter</p>
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
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Commission (₱)</label>
                  <input type="number" min="0"
                    value={editingTemplate.commission_value}
                    onChange={e => setEditingTemplate(t => t && ({ ...t, commission_value: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                  />
                </div>
                {editingTemplate.is_dual_provider && (
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">2nd Commission (₱)</label>
                    <input type="number" min="0"
                      value={editingTemplate.secondary_commission_value ?? 0}
                      onChange={e => setEditingTemplate(t => t && ({ ...t, secondary_commission_value: Number(e.target.value) }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-[11px] font-bold text-slate-700">Loyalty Eligible</p>
                  <p className="text-[9px] text-slate-400">Can be redeemed as a loyalty reward</p>
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
                  <p className="text-[10px] font-bold text-slate-500 text-center uppercase tracking-widest">
                    {isNew ? 'Create this service template?' : 'Save changes to this service?'}
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setSaveConfirm(false)}
                      className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                      Go Back
                    </button>
                    <button onClick={() => { setSaveConfirm(false); handleSaveTemplate(); }} disabled={isSaving}
                      className="flex-[2] py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                      {isSaving && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                      {isSaving ? 'Saving...' : 'Yes, Confirm'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => { setSaveConfirm(false); setEditingTemplate(null); }}
                    className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                    Cancel
                  </button>
                  <button onClick={() => setSaveConfirm(true)} disabled={!editingTemplate.name.trim()}
                    className="flex-[2] py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-40">
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
          <div className="w-full max-w-lg bg-white rounded-[28px] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="bg-slate-900 rounded-t-[28px] px-6 py-5 flex items-center justify-between shrink-0">
              <div className="min-w-0 pr-4">
                <h3 className="text-[13px] font-black text-white uppercase tracking-tight truncate">{managingTemplate.name}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Branch Assignments — Default ₱{managingTemplate.default_price.toLocaleString()}
                </p>
              </div>
              <button onClick={() => setManagingTemplate(null)} className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {branches.map(b => {
                const assignment = branchServices.find(bs => bs.branch_id === b.id && bs.template_id === managingTemplate.id);
                const assigned = !!assignment;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-5 py-3.5">
                    <button
                      disabled={isReadOnly}
                      onClick={() => handleToggleBranch(b.id, managingTemplate.id, assigned)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${assigned ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}
                    >
                      {assigned && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <p className="flex-1 text-[11px] font-bold text-slate-700 min-w-0 truncate">{b.name}</p>
                    {assigned && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-bold text-slate-400">₱</span>
                        <input
                          type="number"
                          min="0"
                          disabled={isReadOnly}
                          value={assignment.price ?? ''}
                          onChange={e => handleUpdatePrice(b.id, managingTemplate.id, e.target.value)}
                          placeholder={String(managingTemplate.default_price)}
                          className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-900 outline-none focus:border-emerald-500 tabular-nums transition-all"
                        />
                        {assignment.price !== null && (
                          <span className="text-[7px] font-black text-amber-500 uppercase tracking-widest">Override</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 shrink-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">
                Leave price blank to use default (₱{managingTemplate.default_price.toLocaleString()})
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/90 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-[32px] p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Trash2 className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tight">Delete Service?</h3>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-2 mb-6 leading-relaxed">
              This removes <span className="text-slate-700 font-black">{deleteConfirm.name}</span> and all {branchCount(deleteConfirm.id)} branch assignments permanently.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleDelete} disabled={isSaving}
                className="w-full py-4 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {isSaving && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                {isSaving ? 'Deleting...' : 'Delete Service'}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="w-full py-3 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
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
