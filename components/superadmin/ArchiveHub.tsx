
import React, { useState, useMemo } from 'react';
import { Branch, SalesReport } from '../../types';
import { ReportsMasterSection } from '../dashboard/sections/ReportsMasterSection';
import { playSound } from '../../lib/audio';
import { toDateStr } from '@/src/utils/reportUtils';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface ArchiveHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  employees?: any[];
}

export const ArchiveHub: React.FC<ArchiveHubProps> = ({ branches, salesReports, employees = [] }) => {
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);

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
            employees={employees}
            canEdit={true}
            canValidate={true}
        />
      </div>
  );
};
