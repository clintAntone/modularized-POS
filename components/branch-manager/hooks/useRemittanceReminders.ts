import { useState, useEffect } from 'react';
import { Branch } from '../../../types';

export function useRemittanceReminders(currentTime: Date, branch: Branch) {
  const [showRemittanceCloseReminder, setShowRemittanceCloseReminder] = useState(false);
  const [showRemittanceFollowUpReminder, setShowRemittanceFollowUpReminder] = useState(false);
  const [showVaultUnconfiguredNotif, setShowVaultUnconfiguredNotif] = useState(false);

  useEffect(() => {
    if (!branch.isOpen) {
      setShowRemittanceCloseReminder(false);
      setShowRemittanceFollowUpReminder(false);
      return;
    }

    const now = currentTime;
    const manilaDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const manilaDOW = new Date(manilaDateStr + 'T12:00:00').getDay();
    const cutoff = Number(branch.weeklyCutoff);
    const isCutoffDay = manilaDOW === cutoff;
    const isFollowUpDay = manilaDOW === (cutoff + 1) % 7;

    if (isCutoffDay) {
      setShowRemittanceFollowUpReminder(false);
      if (branch.closingTime) {
        const [closeH, closeM] = branch.closingTime.split(':').map(Number);
        const closingDate = new Date(now);
        closingDate.setHours(closeH, closeM, 0, 0);
        const diffMins = (closingDate.getTime() - now.getTime()) / 60000;
        const closeKey = `remittance_close_reminded_${manilaDateStr}`;
        if (diffMins > 0 && diffMins <= 60 && !localStorage.getItem(closeKey)) {
          setShowRemittanceCloseReminder(true);
        }
      }
      return;
    }

    if (isFollowUpDay) {
      setShowRemittanceCloseReminder(false);
      const submittedLabel = localStorage.getItem(`remittance_submitted_${branch.id}`);
      const followUpKey = `remittance_followup_reminded_${manilaDateStr}`;
      if (!submittedLabel && !localStorage.getItem(followUpKey)) {
        setShowRemittanceFollowUpReminder(true);
      }
      return;
    }

    setShowRemittanceCloseReminder(false);
    setShowRemittanceFollowUpReminder(false);
  }, [currentTime, branch.isOpen, branch.weeklyCutoff, branch.closingTime, branch.id]);

  return {
    showRemittanceCloseReminder,
    setShowRemittanceCloseReminder,
    showRemittanceFollowUpReminder,
    setShowRemittanceFollowUpReminder,
    showVaultUnconfiguredNotif,
    setShowVaultUnconfiguredNotif,
  };
}
