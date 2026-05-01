
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Branch, BranchVault, SalesReport } from '../../types';
import { ReportsMasterSection } from '../dashboard/sections/ReportsMasterSection';
import { playSound } from '../../lib/audio';
import { toDateStr } from '@/src/utils/reportUtils';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';

interface ArchiveHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  employees?: any[];
  isReadOnly?: boolean;
  onRefresh?: () => void;
}

export const ArchiveHub: React.FC<ArchiveHubProps> = ({ branches, salesReports, employees = [], isReadOnly, onRefresh }) => {
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('archive_filter_branches') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('archive_filter_branches', JSON.stringify(selectedBranchIds));
  }, [selectedBranchIds]);

  const { data: branchVaults = [] } = useQuery<BranchVault[]>({
    queryKey: ['all_branch_vaults'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_TARGET}, ${DB_COLUMNS.VAULT_BALANCE}, ${DB_COLUMNS.VAULT_START_DATE}`);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        branchId: r[DB_COLUMNS.BRANCH_ID],
        target: Number(r[DB_COLUMNS.VAULT_TARGET] ?? 0),
        balance: Number(r[DB_COLUMNS.VAULT_BALANCE] ?? 0),
        lastDepositedDate: null,
        startDate: r[DB_COLUMNS.VAULT_START_DATE] ?? null,
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const consolidatedBranch = useMemo(() => ({
    id: 'all',
    name: 'NETWORK CONSOLIDATED',
    pin: '000000',
    isPinChanged: true,
    isEnabled: true,
    services: [],
    weeklyCutoff: 0,
    cycleStartDate: branches.length > 0 ? branches[0].cycleStartDate : toDateStr(new Date())
  } as Branch), [branches]);

  // When exactly 1 branch is selected, show that branch's view; otherwise show consolidated
  const activeBranch = useMemo(() => {
    if (selectedBranchIds.length === 1) {
      return branches.find(b => b.id === selectedBranchIds[0]) || consolidatedBranch;
    }
    return consolidatedBranch;
  }, [selectedBranchIds, branches, consolidatedBranch]);

  // Filter reports to only selected branches (empty = all)
  const filteredReports = useMemo(() => {
    if (selectedBranchIds.length === 0) return salesReports;
    return salesReports.filter(r => selectedBranchIds.includes(r.branchId));
  }, [salesReports, selectedBranchIds]);

  return (
      <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
        <div className="bg-white p-4 rounded-[24px] border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xl shadow-lg">📂</div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter">Reports Archive</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Historical Data Explorer</p>
            </div>
          </div>

          <BranchCheckboxDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={ids => { setSelectedBranchIds(ids); playSound('click'); }}
            placeholder="Network (All Branches)"
            className="w-full sm:w-64"
          />
        </div>

        <ReportsMasterSection
            branch={activeBranch}
            salesReports={filteredReports}
            branches={branches}
            branchVaults={branchVaults}
            employees={employees}
            canEdit={!isReadOnly}
            canValidate={!isReadOnly}
            canDelete={!isReadOnly}
            onDeleted={onRefresh}
        />
      </div>
  );
};
