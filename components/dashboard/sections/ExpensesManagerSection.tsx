import React from 'react';
import { Branch, Expense, SalesReport } from '../../../types';
import { ExpensesSection } from './ExpensesSection';
import { UI_THEME } from '../../../constants/ui_designs';

interface ExpensesManagerSectionProps {
  user?: any;
  branch: Branch;
  expenses: Expense[];
  salesReports: SalesReport[];
  isClosedMode?: boolean;
  onRefresh?: () => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
}

export const ExpensesManagerSection: React.FC<ExpensesManagerSectionProps> = (props) => {
  return (
    <div className={`space-y-6 sm:space-y-8 pb-12 w-full`}>
      <ExpensesSection
        user={props.user}
        branch={props.branch}
        expenses={props.expenses}
        isClosedMode={props.isClosedMode}
        onRefresh={props.onRefresh}
        onSyncStatusChange={props.onSyncStatusChange}
        fixedCategory="OPERATIONAL"
      />
    </div>
  );
};
