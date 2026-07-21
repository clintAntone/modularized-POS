import { useState, useEffect } from 'react';
import { Branch, SalesReport } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { playSound } from '../../../lib/audio';
import { getTrueDate, getTrueManilaISOString } from '../../../lib/time';

interface UseBranchStatusParams {
  branch: Branch;
  salesReports: SalesReport[];
  todayStr: string;
  currentTime: Date;
  hasDismissedWarning: boolean;
  onRefresh?: (quiet?: boolean) => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
}

export function useBranchStatus({
  branch,
  salesReports,
  todayStr,
  currentTime,
  hasDismissedWarning,
  onRefresh,
  onSyncStatusChange,
}: UseBranchStatusParams) {
  const todayForEnforcer = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(getTrueDate());
  const hasTodayReportOnMount = !branch.isOpen && salesReports.some(
    r => r.branchId === branch.id && r.reportDate === todayForEnforcer
  );

  const [showStatusEnforcer, setShowStatusEnforcer] = useState(!branch.isOpen && !hasTodayReportOnMount);
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [showClosingWarning, setShowClosingWarning] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  // Synchronize enforcer visibility with data
  useEffect(() => {
    if (branch.isOpen) {
      setShowStatusEnforcer(false);
      return;
    }
    const todayManilaStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(getTrueDate());
    const hasTodayReport = salesReports.some(
      r => r.branchId === branch.id && r.reportDate === todayManilaStr
    );
    if (hasTodayReport) {
      setShowStatusEnforcer(false);
    } else {
      setShowStatusEnforcer(true);
    }
  }, [branch.isOpen, salesReports, branch.id]);

  // Maintenance sentinel — auto-refresh when branch date is stale
  useEffect(() => {
    const checkMaintenanceWindow = () => {
      if (!branch.isOpen) return;
      const now = getTrueDate();
      const manilaToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(now);
      const manilaHHMM = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(now);
      const [currH, currM] = manilaHHMM.split(':').map(Number);
      const [refH, refM] = (branch.closingTime || '23:59').split(':').map(Number);
      const isPastThreshold = currH > refH || (currH === refH && currM >= refM);
      const isStaleNode = branch.isOpenDate && branch.isOpenDate < manilaToday;
      if (isPastThreshold && isStaleNode) onRefresh?.(true);
    };
    const interval = setInterval(checkMaintenanceWindow, 60000);
    return () => clearInterval(interval);
  }, [branch.isOpen, branch.isOpenDate, branch.closingTime, onRefresh]);

  // Closing time warning
  useEffect(() => {
    const checkClosingTime = () => {
      if (!branch.isOpen || hasDismissedWarning) return;
      // Use shift 2 closing time if it exists, otherwise shift 1
      const effectiveClosingTime = branch.shift2ClosingTime || branch.closingTime;
      if (!effectiveClosingTime) return;
      const now = getTrueDate();
      const [closeH, closeM] = effectiveClosingTime.split(':').map(Number);
      const closingDate = getTrueDate();
      closingDate.setHours(closeH, closeM, 0, 0);
      const diffMins = (closingDate.getTime() - now.getTime()) / (1000 * 60);
      if (diffMins > 0 && diffMins <= 15) {
        setShowClosingWarning(true);
        playSound('warning');
      }
    };
    checkClosingTime();
  }, [currentTime, branch.isOpen, branch.closingTime, branch.shift2ClosingTime, hasDismissedWarning]);

  const handleToggleBranchStatus = async () => {
    setIsOpening(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    playSound('click');
    const nextStatus = !branch.isOpen;
    try {
      const trueNow = getTrueDate();
      const manilaToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(trueNow);

      const updateData: any = {
        is_open: nextStatus,
        is_open_date: nextStatus ? manilaToday : branch.isOpenDate,
      };
      const { error } = await supabase.from(DB_TABLES.BRANCHES).update(updateData).eq('id', branch.id);
      if (error) throw error;

      // When opening for a new day, close out any orphaned sessions from a previous day
      if (nextStatus && branch.isOpenDate && branch.isOpenDate < manilaToday) {
        await supabase
          .from(DB_TABLES.ATTENDANCE)
          .update({
            [DB_COLUMNS.CLOCK_OUT]: getTrueManilaISOString(),
            [DB_COLUMNS.STATUS]: 'AUTO-LOGOUT',
          })
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .is(DB_COLUMNS.CLOCK_OUT, null)
          .lt(DB_COLUMNS.DATE, manilaToday);
      }

      playSound('success');
      setShowToggleConfirm(false);
      setShowStatusEnforcer(false);
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setIsOpening(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  return {
    showStatusEnforcer,
    setShowStatusEnforcer,
    showToggleConfirm,
    setShowToggleConfirm,
    showClosingWarning,
    setShowClosingWarning,
    isOpening,
    handleToggleBranchStatus,
  };
}
