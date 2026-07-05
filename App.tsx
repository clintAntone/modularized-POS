import React, { Suspense, lazy, useState, useMemo, useEffect } from 'react';
import { UserRole } from './types';
import { UI_THEME } from './constants/ui_designs';
import Login from './components/Login';
import ProfileSetup from './components/PinChange';
import { useAuth } from './hooks/useAuth';
import { useGlobalData } from './hooks/useGlobalData';
import { GlobalLoadingOverlay } from './components/GlobalLoadingOverlay';
import { UpdatePopup } from './components/UpdatePopup';
import { supabase } from './lib/supabase';
import { NetworkDiagnostic } from './components/NetworkDiagnostic';
import { syncWithServerTime } from './lib/time';
import SplashScreen from './components/SplashScreen';
import { GmailPromptModal } from './components/shared/GmailPromptModal';

import { Power } from 'lucide-react';

// Dynamic Imports
const SuperAdminDashboard = lazy(() => import('./components/superadmin/SuperAdminDashboard'));
const BranchManagerDashboard = lazy(() => import('./components/BranchManagerDashboard'));


const App: React.FC = () => {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [isTimeSynced, setIsTimeSynced] = useState(false);

  const isSupabaseConfigured = !!supabase;

  // TIME SYNC: Synchronize with server time on startup and periodically
  useEffect(() => {
    let mounted = true;
    const performSync = async () => {
      const success = await syncWithServerTime();
      if (mounted) {
        setIsTimeSynced(true);
        if (!success) {
          console.error("⚠️ Time synchronization failed. System will use local device time.");
        }
      }
    };
    
    performSync();
    
    // Periodic re-sync every 15 minutes to account for any drift
    const interval = setInterval(performSync, 15 * 60 * 1000);
    
    return () => { 
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Modular Auth Hub First
  const {
    auth, previousBranchId,
    handleLogin, handleLogout, handleSwitchBranch
  } = useAuth();

  // Pass actual auth state to Data Hub
  const {
    branches, transactions, expenses,
    attendance, employees, salesReports, salesReportsLoading, auditLogs, requests, branchVault, vaultTransactions, employeeComplaints,
    systemLogo, systemVersion, systemLatest, apkUrl, dynamicAppName, autoRefreshTime, fontFamily, isPaymongoEnabled, loading, error, globalSync, setGlobalSync, forceLogoutRegistry, refreshDatabase, fetchSystemConfig
  } = useGlobalData(auth);

const [gmailPromptDismissed, setGmailPromptDismissed] = useState(false);

  // Derive identity from synchronized data
  const currentEmployee = useMemo(() =>
          auth.user?.employeeId ? employees.find(e => e.id === auth.user?.employeeId) : null
      , [auth.user?.employeeId, employees]);

  const currentBranch = useMemo(() =>
          auth.user?.branchId ? branches.find(b => b.id === auth.user?.branchId) : null
      , [auth.user?.branchId, branches]);

  const identifiedEmployee = useMemo(() => {
    if (auth.user?.employeeId) {
      return employees.find(e => e.id === auth.user.employeeId) || null;
    }
    if (currentBranch?.manager) {
      return employees.find(e => e.name.toUpperCase() === currentBranch.manager.toUpperCase()) || null;
    }
    return null;
  }, [auth.user?.employeeId, currentBranch?.manager, employees]);

  // FORCE LOGOUT WATCHER — primary path: refresh_signal on branches (realtime-backed)
  // Branches table has Realtime enabled, so this fires within seconds of the admin triggering it.
  useEffect(() => {
    if (!auth.user || !branches.length) return;
    const sessionStart = auth.user.sessionStart;
    const hit = branches.find(b => b.refreshSignal && b.refreshSignal > sessionStart);
    if (hit) {
      handleLogout();
    }
  }, [branches, auth.user, handleLogout]);

  // FORCE LOGOUT WATCHER — fallback path: system_config registry (polled every 15 s)
  // Covers portal/superadmin users whose branch scope may be empty or restricted.
  useEffect(() => {
    if (auth.user) {
      const globalForceTime = forceLogoutRegistry['GLOBAL'] || 0;
      const branchForceTime = auth.user.branchId ? (forceLogoutRegistry[auth.user.branchId] || 0) : 0;
      const latestForceTime = Math.max(globalForceTime, branchForceTime);
      if (latestForceTime > auth.user.sessionStart) {
        handleLogout();
      }
    }
  }, [auth.user, forceLogoutRegistry, handleLogout]);

  // BRANDING SYNC: Update browser tab title and favicon from system configuration
  useEffect(() => {
    if (dynamicAppName) {
      document.title = dynamicAppName;
    }
  }, [dynamicAppName]);

  // MOBILE BACK BUTTON BOOTSTRAP: Ensure we have a root state to return to
  useEffect(() => {
    if (window.history.state === null) {
      window.history.replaceState({ root: true }, '');
    }
  }, []);

  // HANDLE LOGOUT MODAL BACK BUTTON: Sync modal state with browser history
  useEffect(() => {
    if (showLogoutConfirm) {
      window.history.pushState({ modal: 'logout' }, '');
      const handlePopState = () => setShowLogoutConfirm(false);
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [showLogoutConfirm]);

  useEffect(() => {
    if (systemLogo) {
      const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (favicon) {
        favicon.href = systemLogo;
      } else {
        // Fallback create if not exists
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = systemLogo;
        document.head.appendChild(link);
      }
    }
  }, [systemLogo]);

  // FONT SYNC: Apply global font family from system configuration
  useEffect(() => {
    if (fontFamily) {
      document.body.style.fontFamily = `'${fontFamily}', sans-serif`;
      
      // Also update tailwind config dynamically if possible, but body style is usually enough for inheritance
      // If we want to be thorough, we can inject a style tag
      const styleId = 'dynamic-font-style';
      let styleTag = document.getElementById(styleId) as HTMLStyleElement;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = `
        *, *::before, *::after, body, button, input, select, textarea {
          font-family: '${fontFamily}', sans-serif !important;
        }
      `;
    }
  }, [fontFamily]);

  // SECURITY FIX: Explicitly reset UI state on identity change
  useEffect(() => {
    if (auth.user) {
      setShowLogoutConfirm(false);
    }
  }, [auth.user?.branchId, auth.user?.employeeId, auth.user?.role]);


  // GLOBAL FETCH ERROR HANDLER
  useEffect(() => {
    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = (event as any).message || (event as any).reason?.message || '';
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        console.error('🌐 Global Network Error Detected:', message);
        setIsNetworkError(true);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  // WEBTONATIVE BACK BUTTON SYNC: Handle hardware back button behavior
  useEffect(() => {
    const handleBack = () => {
      // 1. If logout confirmation is visible, we let the popstate listener handle it
      // by calling history.back(), or we can handle it directly.
      // Since we added a popstate listener for showLogoutConfirm, calling back() is enough.
      
      // 2. If user is NOT logged in (Login Page), close the app
      if (!auth.user) {
        if ((window as any).webToNative?.closeApp) {
          (window as any).webToNative.closeApp();
        } else {
          console.warn("WebToNative bridge not found. App closure simulated.");
        }
        return;
      }

      // 3. If logged in, navigate back in history
      // This will trigger popstate listeners in sub-components (like BranchManagerDashboard tabs)
      // or the logout modal listener we just added.
      window.history.back();
    };

    // Register the hook for WebToNative
    (window as any).onBackPressed = handleBack;

    return () => {
      (window as any).onBackPressed = null;
    };
  }, [auth.user, showLogoutConfirm]);

  const handleCancelPinChange = () => {
    if (previousBranchId) {
      handleSwitchBranch(previousBranchId);
    } else {
      handleLogout();
    }
  };

  // Safe Logout Trigger: Prevents ghost clicks from 'Authorize' button tap-through
  const triggerLogoutConfirm = (e: React.MouseEvent) => {
    setShowLogoutConfirm(true);
  };

  const isRelief = useMemo(() => {
    if (!auth.user || auth.user.role === UserRole.SUPERADMIN || auth.user.role === UserRole.PORTAL_USER || !currentBranch) return false;
    const sessionEmpName = currentEmployee?.name || '';
    if (!sessionEmpName) return false;

    const isPrimaryManager = currentBranch.manager?.toUpperCase() === sessionEmpName.toUpperCase();
    const isTempManager = currentBranch.tempManager?.toUpperCase() === sessionEmpName.toUpperCase();

    // A user is only a relief manager if they are NOT the primary manager but ARE the temp manager
    return !isPrimaryManager && isTempManager;
  }, [auth.user, currentBranch, currentEmployee]);

  const identityDisplay = useMemo(() => {
    if (!auth.user) return 'SYSTEM ADMIN';
    if (auth.user.role === UserRole.SUPERADMIN) return `${(auth.user.username || 'ADMIN').toUpperCase()} — ADMIN`;
    if (auth.user.role === UserRole.PORTAL_USER) return `${(auth.user.username || 'PORTAL USER').toUpperCase()} — PORTAL`;
    if (!currentBranch) return 'NODE OPERATOR';
    
    const username = auth.user.username || 'NODE OPERATOR';
    const branchName = currentBranch?.name?.replace(/BRANCH - /i, '') || 'ACTIVE';
    const roleLabel = isRelief ? 'DELEGATE' : 'MANAGER';
    
    return `${username.toUpperCase()} (${roleLabel}) @ ${branchName.toUpperCase()}`;
  }, [auth.user, currentBranch, isRelief]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-rose-100 p-8 flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Configuration Error</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Supabase credentials are missing or invalid. Please check your environment variables in the settings.
            </p>
          </div>
          <div className="w-full p-4 bg-slate-50 rounded-xl border border-slate-100 text-left space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Required Variables:</p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-[11px] font-mono text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                VITE_SUPABASE_URL
              </li>
              <li className="flex items-center gap-2 text-[11px] font-mono text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                VITE_SUPABASE_ANON_KEY
              </li>
            </ul>
          </div>
          <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest leading-relaxed">
            The application cannot initialize core systems without these credentials.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <SplashScreen />;
  }

  if (!auth.user) {
    return <Login onLogin={handleLogin} branches={branches} employees={employees} onlineUsers={{}} logo={systemLogo} version={systemVersion} appName={dynamicAppName} connectionError={error} systemLatest={systemLatest} apkUrl={apkUrl} />;
  }

  if (auth.user.role === UserRole.BRANCH_MANAGER) {
    if (!currentBranch || (auth.user.employeeId && !currentEmployee)) {
      const isReliefManager = auth.user.role === UserRole.BRANCH_MANAGER && employees.length > 0 && !currentEmployee;
      
      return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 z-[9999] overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#1e293b,transparent)] animate-pulse"></div>
          </div>
          
          <div className="w-full max-w-md space-y-10 relative z-10 text-center">
            <div className="relative inline-block group">
              <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-2xl group-hover:bg-emerald-500/30 transition-all duration-1000 animate-pulse"></div>
              <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center text-4xl shadow-2xl border border-white/10 relative transform hover:rotate-12 transition-transform duration-500">
                {loading ? '🔐' : error ? '⚠️' : '👤'}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">
                {loading ? 'SYNCING SECURE IDENTITY...' : error ? 'COMMUNICATION FAILURE' : 'IDENTITY VERIFICATION'}
              </h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] leading-relaxed">
                {loading ? 'Establishing encrypted link with global registry' : error ? 'The secure channel was interrupted' : 'Validating credentials against branch node'}
              </p>
            </div>

            {/* Progress / Status */}
            <div className="bg-white/5 border border-white/10 rounded-[32px] p-6 space-y-6 backdrop-blur-md">
              <div className="space-y-4">
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Registry Status</span>
                  <span className={loading ? "text-emerald-400 animate-pulse" : error ? "text-rose-400" : "text-emerald-400"}>
                    {loading ? "SYNCHRONIZING..." : error ? "OFFLINE" : "PAID"}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${error ? 'bg-rose-500 w-full' : loading ? 'bg-emerald-500 w-2/3 animate-pulse' : 'bg-emerald-500 w-full'}`}></div>
                </div>
              </div>

              <div className="space-y-2 text-left">
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <div className={`w-1.5 h-1.5 rounded-full ${branches.length > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
                  Branch Registry: {branches.length > 0 ? 'LOADED' : 'WAITING...'}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <div className={`w-1.5 h-1.5 rounded-full ${employees.length > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
                  Personnel Data: {employees.length > 0 ? 'LOADED' : 'WAITING...'}
                </div>
                {isReliefManager && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest leading-relaxed">
                      RELIEF MANAGER DETECTED: Your home branch profile is being mapped to this terminal.
                    </p>
                  </div>
                )}
                {error && (
                  <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest leading-relaxed">
                      ERROR: {error instanceof Error ? error.message : 'Unknown connection error'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => refreshDatabase?.(true)}
                disabled={loading}
                className="w-full h-16 bg-white text-slate-950 font-black text-[11px] uppercase tracking-widest rounded-[24px] shadow-2xl hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
              >
                {loading ? 'SYNCING...' : 'RETRY SECURE SYNC'}
              </button>
              
              <button
                onClick={handleLogout}
                className="w-full py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                ABORT & LOGOUT
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (!currentBranch.isPinChanged || (currentEmployee && (!currentEmployee.hasPinSet || (currentEmployee.requestReset && currentEmployee.resetApproved)))) {
      return <ProfileSetup branch={currentBranch} employee={identifiedEmployee || undefined} providedPin={auth.user.loginPin} onSetupComplete={refreshDatabase as any} onRefresh={refreshDatabase} onCancel={handleCancelPinChange} />;
    }

    if (currentEmployee?.requestReset && !currentEmployee?.resetApproved) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[48px] p-10 text-center space-y-6">
            <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center text-3xl mx-auto">⏳</div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Reset Pending</h2>
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
              Your password reset request has been transmitted to the Superadmin. Please wait for approval before continuing.
            </p>
            <button onClick={handleLogout} className="w-full py-4 bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">
              Logout
            </button>
          </div>
        </div>
      );
    }
  }

  return (
      <div className="min-h-screen w-full flex flex-col bg-slate-50 overflow-x-hidden">
        <GlobalLoadingOverlay isVisible={globalSync} />


        {/* Gmail Prompt — non-portal, non-superadmin users without a registered email */}
        {!gmailPromptDismissed && currentEmployee && !currentEmployee.details?.gmail &&
          auth.user?.role !== UserRole.PORTAL_USER && auth.user?.role !== UserRole.SUPERADMIN && (
          <GmailPromptModal
            employee={currentEmployee}
            required={auth.user?.role === UserRole.BRANCH_MANAGER && !isRelief}
            onSaved={() => { setGmailPromptDismissed(true); refreshDatabase(); }}
            onSkip={() => setGmailPromptDismissed(true)}
          />
        )}

        {isNetworkError && (
          <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="max-w-2xl w-full animate-in zoom-in-95 duration-300">
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="bg-rose-600 p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-black uppercase tracking-tight">Connection Interrupted</h2>
                      <p className="text-[10px] font-bold text-rose-100 uppercase tracking-widest">Network request failed</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsNetworkError(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6">
                  <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                    The application encountered a network error while communicating with the server. This usually happens due to an unstable internet connection or a firewall blocking the service.
                  </p>
                  <NetworkDiagnostic />
                  <div className="mt-8 flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => window.location.reload()}
                      className="flex-1 bg-slate-900 text-white font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                    >
                      Reload Application
                    </button>
                    <button 
                      onClick={() => setIsNetworkError(false)}
                      className="flex-1 bg-slate-100 text-slate-600 font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Force-update gate for already-logged-in users */}
        {!systemLatest && <UpdatePopup apkUrl={apkUrl} />}

        {showLogoutConfirm && (
          <div className={UI_THEME.layout.modalWrapper}>
            <div className={`w-full max-w-xs bg-white shadow-2xl animate-in zoom-in-95 duration-200 ${UI_THEME.radius.modal} overflow-hidden`}>

              {/* Dark header */}
              <div className="relative bg-slate-900 px-8 pt-8 pb-12 overflow-hidden text-center">
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-rose-500/10 pointer-events-none" />
                <div className="absolute -bottom-8 -left-6 w-24 h-24 rounded-full bg-slate-800 pointer-events-none" />
                <div className="relative z-10">
                  <div className="w-14 h-14 mx-auto mb-4 bg-rose-500/15 border border-rose-500/25 rounded-2xl flex items-center justify-center">
                    <svg className="w-7 h-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  </div>
                  <h4 className="text-xl font-black text-white uppercase tracking-tighter">Exit Terminal?</h4>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">{identityDisplay}</p>
                </div>
              </div>

              {/* Action area */}
              <div className="bg-white px-6 py-5 flex gap-3">
                <button
                  onClick={() => window.history.back()}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all active:scale-95 shadow-md"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="sticky top-0 left-0 right-0 z-[1000] no-print w-full bg-white border-b border-slate-100 shadow-sm">
          <div className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} h-14 sm:h-16 flex items-center justify-between gap-3`}>
            {/* Left: logo + name */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <img src={systemLogo || '/icon.png'} alt="Logo" className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl shrink-0" decoding="async" loading="eager" />
              <div className="min-w-0 flex-1">
                <h1 className="font-black text-sm sm:text-base tracking-tight text-slate-900 truncate leading-none">{dynamicAppName}</h1>
                <p className="text-xs font-medium text-slate-400 truncate mt-0.5 leading-none">{identityDisplay}</p>
              </div>
            </div>

            {/* Right: logout */}
            <button
              onClick={triggerLogoutConfirm}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition-all shrink-0"
              title="Logout"
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 w-full flex flex-col relative">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center min-h-screen"><div className="w-10 h-10 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin"></div></div>}>
            {(auth.user?.role === UserRole.SUPERADMIN || auth.user?.role === UserRole.PORTAL_USER) ? (
                <SuperAdminDashboard user={auth.user!} branches={branches} transactions={transactions} expenses={expenses} employees={employees} attendance={attendance} auditLogs={auditLogs} requests={requests} complaints={employeeComplaints} onlineUsers={{}} salesReports={salesReports} salesReportsLoading={salesReportsLoading} vaultTransactions={vaultTransactions} onRefresh={refreshDatabase} onSyncStatusChange={setGlobalSync} fetchSystemConfig={fetchSystemConfig} permissions={auth.user.role === UserRole.PORTAL_USER ? (auth.user.permissions ?? { tabs: {} }) : undefined} />
            ) : (
                auth.user && currentBranch && <BranchManagerDashboard user={auth.user} branch={currentBranch} isRelief={isRelief} branches={branches} transactions={transactions} expenses={expenses} attendance={attendance} employees={employees} salesReports={salesReports} salesReportsLoading={salesReportsLoading} vaultTransactions={vaultTransactions} auditLogs={auditLogs} autoRefreshTime={autoRefreshTime} isPaymongoEnabled={isPaymongoEnabled} branchVault={branchVault} requests={requests} complaints={employeeComplaints} onRefresh={refreshDatabase} onSwitchBranch={handleSwitchBranch} onSyncStatusChange={setGlobalSync} loading={loading} />
            )}
          </Suspense>
        </main>
      </div>
  );
};

export default App;