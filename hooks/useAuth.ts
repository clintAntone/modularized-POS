
import { useState, useEffect, useCallback } from 'react';
import { AuthState, UserRole, PortalPermissions } from '../types';
import { SESSION_TIMEOUT_MS } from '../constants';
import { playSound } from '../lib/audio';
import { logAudit } from '../lib/audit';

const AUTH_STORAGE_KEY = 'hilot_core_session_v4';

export const useAuth = () => {
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!saved) return { user: null };
      const parsed = JSON.parse(saved);
      if (!parsed.user || !parsed.user.lastActive) return { user: null };
      const now = Date.now();
      if (now - parsed.user.lastActive > SESSION_TIMEOUT_MS) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return { user: null };
      }
      // Ensure sessionStart exists for migrated sessions
      if (!parsed.user.sessionStart) {
        parsed.user.sessionStart = parsed.user.lastActive;
      }
      return parsed;
    } catch (err) {
      return { user: null };
    }
  });

  const [previousBranchId, setPreviousBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (auth.user) {
      const { loginPin, ...userWithoutPin } = auth.user;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: userWithoutPin }));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [auth]);

  const refreshSession = useCallback(() => {
    if (!auth.user) return;
    const now = Date.now();
    if (now - auth.user.lastActive > 60000) {
      setAuth(prev => {
        if (!prev.user) return prev;
        return { user: { ...prev.user, lastActive: now } };
      });
    }
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => refreshSession();
    activityEvents.forEach(event => window.addEventListener(event, handleActivity));
    const interval = setInterval(() => {
      const now = Date.now();
      if (auth.user && now - auth.user.lastActive > SESSION_TIMEOUT_MS) {
        setAuth({ user: null });
        playSound('warning');
      }
    }, 60000);
    return () => {
      activityEvents.forEach(event => window.removeEventListener(event, handleActivity));
      clearInterval(interval);
    };
  }, [auth.user, refreshSession]);

  const handleLogin = (role: UserRole, branchId?: string, pin?: string, employeeId?: string, username?: string, permissions?: PortalPermissions) => {
    setPreviousBranchId(null);
    const now = Date.now();

    const newUser = { role, branchId, employeeId, username, lastActive: now, sessionStart: now, loginPin: pin, permissions };
    setAuth({ user: newUser });

    // Log Login
    logAudit({
      branchId: branchId || null,
      activityType: 'LOGIN',
      entityType: 'USER',
      entityId: employeeId || 'ADMIN',
      description: `${username || 'User'} logged in to ${branchId || 'System'}`,
      performerName: username || 'SYSTEM'
    });
  };

  const handleLogout = useCallback(() => {
    if (auth.user) {
      logAudit({
        branchId: auth.user.branchId || null,
        activityType: 'LOGOUT',
        entityType: 'USER',
        entityId: auth.user.employeeId || 'ADMIN',
        description: `${auth.user.username || 'User'} logged out`,
        performerName: auth.user.username || 'SYSTEM'
      });
    }

    playSound('success');
    setAuth({ user: null });
    setPreviousBranchId(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.history.replaceState({ root: true }, '');
  }, [auth.user]);

  const handleSwitchBranch = (branchId: string, employees?: any[]) => {
    if (auth.user?.branchId) {
      setPreviousBranchId(auth.user.branchId);
    }
    setAuth(prev => {
        if (!prev.user) return prev;
        const now = Date.now();
        
        let effectiveRole = prev.user.role;
        if (prev.user.employeeId && employees) {
          const emp = employees.find(e => e.id === prev.user?.employeeId);
          if (emp && emp.branchAllowances && emp.branchAllowances[branchId]) {
            const config = emp.branchAllowances[branchId];
            if (typeof config === 'object' && config.role) {
              effectiveRole = config.role === 'MANAGER' ? UserRole.BRANCH_MANAGER : prev.user.role;
            }
          }
        }

        const newUser = { ...prev.user, role: effectiveRole, branchId, lastActive: now, sessionStart: now, loginPin: prev.user.loginPin };
        
        // Log Branch Switch as a type of login/activity
        logAudit({
          branchId: branchId,
          activityType: 'BRANCH_SWITCH',
          entityType: 'USER',
          entityId: prev.user.employeeId || 'ADMIN',
          description: `${prev.user.username || 'User'} switched to branch ${branchId}`,
          performerName: prev.user.username || 'SYSTEM'
        });

        return { user: newUser };
    });
    window.scrollTo(0,0);
  };

  return {
    auth,
    setAuth,
    previousBranchId,
    setPreviousBranchId,
    handleLogin,
    handleLogout,
    handleSwitchBranch
  };
};
