import { useState, useRef, useEffect } from 'react';
import { playSound } from '../../../lib/audio';

interface UseBranchSwitchParams {
  loginPin?: string;
  onSwitchBranch?: (branchId: string) => void;
}

export function useBranchSwitch({ loginPin, onSwitchBranch }: UseBranchSwitchParams) {
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingSwitchBranchId, setPendingSwitchBranchId] = useState<string | null>(null);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [isSwitchingOpen, setIsSwitchingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isSwitchingOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsSwitchingOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isSwitchingOpen]);

  const handleUnlock = () => {
    playSound('click');
    if (unlockPin === loginPin) {
      if (pendingSwitchBranchId && onSwitchBranch) {
        onSwitchBranch(pendingSwitchBranchId);
      }
      setShowUnlockModal(false);
      setPendingSwitchBranchId(null);
      setUnlockPin('');
      setUnlockError('');
      playSound('success');
    } else {
      setUnlockError('INVALID PIN');
      playSound('warning');
    }
  };

  return {
    showUnlockModal,
    setShowUnlockModal,
    pendingSwitchBranchId,
    setPendingSwitchBranchId,
    unlockPin,
    setUnlockPin,
    unlockError,
    setUnlockError,
    isSwitchingOpen,
    setIsSwitchingOpen,
    dropdownRef,
    handleUnlock,
  };
}
