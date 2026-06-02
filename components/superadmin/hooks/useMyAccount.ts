import { useState, useEffect } from 'react';
import { AuthState } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { hashPin, generateSalt } from '../../../lib/crypto';
import { playSound } from '../../../lib/audio';

type User = Exclude<AuthState['user'], null>;

export function useMyAccount(user: User, isPortalUser: boolean) {
  const [showMyAccount, setShowMyAccount] = useState(false);
  const [myAccountForm, setMyAccountForm] = useState({
    username: '',
    confirmUsername: '',
    pin: '',
    confirmPin: '',
  });
  const [myAccountSaving, setMyAccountSaving] = useState(false);
  const [myAccountError, setMyAccountError] = useState('');
  const [myAccountSuccess, setMyAccountSuccess] = useState(false);

  useEffect(() => {
    if (!showMyAccount || !isPortalUser || !user.employeeId) return;
    supabase
      .from(DB_TABLES.PORTAL_USERS)
      .select('username')
      .eq('id', user.employeeId)
      .single()
      .then(({ data }) => {
        if (data) setMyAccountForm({ username: data.username, confirmUsername: data.username, pin: '', confirmPin: '' });
      });
  }, [showMyAccount]);

  const openMyAccount = () => {
    setShowMyAccount(true);
    setMyAccountError('');
    setMyAccountSuccess(false);
  };

  const handleUpdateMyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyAccountError('');
    setMyAccountSuccess(false);

    const newUsername = myAccountForm.username.trim().toLowerCase();
    if (!newUsername) { setMyAccountError('Username cannot be empty.'); return; }
    if (newUsername !== myAccountForm.confirmUsername.trim().toLowerCase()) {
      setMyAccountError('Usernames do not match.'); return;
    }

    if (myAccountForm.pin) {
      if (!/^\d{6,}$/.test(myAccountForm.pin)) { setMyAccountError('PIN must be at least 6 digits.'); return; }
      if (myAccountForm.pin !== myAccountForm.confirmPin) { setMyAccountError('PINs do not match.'); return; }
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    const { data: conflict } = await supabase
      .from(DB_TABLES.PORTAL_USERS)
      .select('id')
      .eq(DB_COLUMNS.USERNAME, newUsername)
      .neq('id', user.employeeId!)
      .maybeSingle();
    if (conflict) { setMyAccountError('That username is already in use.'); return; }
    updates[DB_COLUMNS.USERNAME] = newUsername;

    if (myAccountForm.pin) {
      const salt = generateSalt();
      const hash = await hashPin(myAccountForm.pin, salt);
      updates[DB_COLUMNS.LOGIN_PIN] = hash;
      updates[DB_COLUMNS.PIN_SALT] = salt;
    }

    setMyAccountSaving(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.PORTAL_USERS)
        .update(updates)
        .eq('id', user.employeeId!);
      if (error) throw error;
      playSound('success');
      setMyAccountSuccess(true);
      setMyAccountForm(f => ({ ...f, confirmUsername: f.username, pin: '', confirmPin: '' }));
    } catch {
      setMyAccountError('Failed to save. Please try again.');
    } finally {
      setMyAccountSaving(false);
    }
  };

  return {
    showMyAccount,
    setShowMyAccount,
    openMyAccount,
    myAccountForm,
    setMyAccountForm,
    myAccountSaving,
    myAccountError,
    myAccountSuccess,
    handleUpdateMyAccount,
  };
}
