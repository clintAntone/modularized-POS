
import React, { useState } from 'react';
import { Branch, Employee } from '../../../types';
import { ManagerSelector } from './ManagerSelector';
import { playSound } from '../../../lib/audio';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';

interface OperationsRegistryProps {
  branchId: string;
  isOpen: boolean;
  manager: string;
  tempManager?: string;
  potentialManagers: Employee[];
  isSaving: boolean;
  onUpdate: (updates: Partial<Branch>) => void;
}

export const OperationsRegistry: React.FC<OperationsRegistryProps> = ({
  branchId, isOpen, manager, tempManager, potentialManagers, isSaving, onUpdate
}) => {
  const isManagerUnassigned = (!manager || manager.trim() === '') && (!tempManager || tempManager.trim() === '');
  
  const assignedManagerRecord = potentialManagers.find(m => m.name === manager);
  const tempManagerRecord = potentialManagers.find(m => m.name === tempManager);
  const isHomeBranchMismatched = assignedManagerRecord && assignedManagerRecord.branchId !== branchId;

  const handleSyncHomeBranch = async () => {
    if (!assignedManagerRecord || isSaving) return;
    playSound('click');
    try {
        const { error } = await supabase
            .from(DB_TABLES.EMPLOYEES)
            .update({ [DB_COLUMNS.BRANCH_ID]: branchId })
            .eq(DB_COLUMNS.ID, assignedManagerRecord.id);
        
        if (error) throw error;
        playSound('success');
    } catch (e) {
        console.error('Home Branch Sync Fault', e);
    }
  };

  return (
    <section className="space-y-5 animate-in slide-in-from-bottom-2 duration-500">
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.25em] ml-1">Operations & Authentication Registry</h4>
      <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-6 shadow-inner">
        
        {/* PRIMARY MANAGER */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
             <label className="block text-xs font-semibold uppercase text-slate-500 tracking-widest">Designated Manager</label>
             {isHomeBranchMismatched && (
                <button 
                  onClick={handleSyncHomeBranch}
                  className="text-xs font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-200 animate-pulse hover:bg-amber-600 hover:text-white transition-all"
                  title="Correct Home Branch Assignment in Registry"
                >
                  Sync Home Branch
                </button>
             )}
          </div>
          {potentialManagers.length > 0 ? (
            <ManagerSelector 
              value={manager || ''} 
              employees={potentialManagers}
              disabled={isSaving}
              branchId={branchId}
              onSelect={(name) => {
                const updates: Partial<Branch> = { manager: name };
                if (!name || name.trim() === '') {
                  updates.isOpen = false;
                }
                onUpdate(updates);
              }}
            />
          ) : (
            <div className="p-6 bg-amber-50 border-2 border-dashed border-amber-200 rounded-2xl flex flex-col items-center text-center gap-3 animate-pulse">
              <span className="text-2xl opacity-60">⚠️</span>
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest leading-relaxed max-w-[200px]">
                No active personnel registered. Branch cannot open without an assigned manager or relief delegate.
              </p>
            </div>
          )}
        </div>

        {/* RELIEF MANAGER */}
        <div className="space-y-2">
           <label className="block text-xs font-semibold uppercase text-slate-500 tracking-widest ml-1">Authorized Relief Delegate</label>
           <ManagerSelector 
              value={tempManager || ''} 
              employees={potentialManagers.filter(p => p.name !== manager)}
              disabled={isSaving}
              branchId={branchId}
              onSelect={(name) => onUpdate({ tempManager: name || '' })}
            />
        </div>
        
        <div className={`flex items-center justify-between p-5 bg-white rounded-2xl shadow-sm border transition-all duration-300 ${isManagerUnassigned ? 'border-slate-100 opacity-60 grayscale' : 'border-slate-100'}`}>
          <div className="space-y-0.5 overflow-hidden pr-4">
             <p className="text-xs font-bold uppercase text-slate-900 tracking-widest">Daily Shop Status</p>
             <p className="text-xs font-semibold text-slate-400 uppercase">
               {isManagerUnassigned ? 'Manager Assignment Required' : 'Current Operational Window'}
             </p>
          </div>
          <button
            disabled={isSaving || isManagerUnassigned}
            onClick={() => {
              playSound('click');
              onUpdate({ isOpen: !isOpen });
            }}
            className={`px-6 sm:px-8 py-2.5 rounded-xl text-xs font-medium uppercase tracking-wide border-2 transition-all active:scale-95 shrink-0 ${isOpen ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'} ${isManagerUnassigned ? 'cursor-not-allowed border-dashed opacity-50' : ''}`}
          >
            {isOpen ? 'OPEN' : 'CLOSED'}
          </button>
        </div>

      </div>
    </section>
  );
};
