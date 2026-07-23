import React, { useState, useEffect, useMemo } from 'react';
import { UserRole, Branch, Employee, PortalPermissions } from '../types';
import { supabase } from '../lib/supabase';
import { playSound } from '../lib/audio';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { hashPin, generateSalt, verifyPin } from '../lib/crypto';
import { saveAuthCredential, getAuthCredential, MAX_OFFLINE_CREDENTIAL_AGE_MS } from '../lib/offlineDb';

// Modular Imports
import { NodeSelector } from './login/NodeSelector';
import { AuthForm } from './login/AuthForm';
import { RecoveryForm } from './login/RecoveryForm';
import { UpdatePopup } from './UpdatePopup';

interface LoginProps {
    onLogin: (role: UserRole, branchId?: string, pin?: string, employeeId?: string, username?: string, permissions?: PortalPermissions) => void;
    branches: Branch[];
    employees: Employee[];
    onlineUsers: Record<string, boolean>;
    logo?: string | null;
    version?: string | null;
    appName?: string;
    connectionError?: any;
    systemLatest?: boolean;
    apkUrl?: string | null;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 30000;

const Login: React.FC<LoginProps> = ({ onLogin, branches, employees, logo, version, appName, connectionError, systemLatest = true, apkUrl }) => {
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [shake, setShake] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

    const [selectedBranchFull, setSelectedBranchFull] = useState<Branch | null>(null);

    // Fetch the full branch record for the selected branch on demand.
    // Login.tsx no longer relies on useGlobalData's branches array (which only
    // loads post-login). NodeSelector has its own lightweight fetch for display.
    useEffect(() => {
        if (!selectedBranchId || selectedBranchId === 'portal') {
            setSelectedBranchFull(null);
            return;
        }
        const existing = branches.find(b => b.id === selectedBranchId);
        if (existing) { setSelectedBranchFull(existing); return; }
        supabase
            .from(DB_TABLES.BRANCHES)
            .select('id,name,is_enabled,is_pin_changed,pin,manager,temp_manager')
            .eq(DB_COLUMNS.ID, selectedBranchId)
            .single()
            .then(({ data }) => {
                if (data) setSelectedBranchFull({
                    id: data.id,
                    name: data.name,
                    isEnabled: Boolean(data.is_enabled),
                    isPinChanged: Boolean(data.is_pin_changed),
                    pin: data.pin ?? '',
                    manager: data.manager ?? '',
                    tempManager: data.temp_manager ?? '',
                } as Branch);
            });
    }, [selectedBranchId, branches]);

    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [isReliefMode, setIsReliefMode] = useState(false);
    const [reliefStep, setReliefStep] = useState<'pin' | 'setup'>('pin');
    const [reliefEmployee, setReliefEmployee] = useState<Employee | null>(null);
    const [isSetupAccountMode, setIsSetupAccountMode] = useState(false);
    const [recoveryUsername, setRecoveryUsername] = useState('');

    const filteredBranches = useMemo(() => {
        const sanitizedSearch = searchTerm.replace(/[<>]/g, '').toLowerCase();
        if (!sanitizedSearch) return branches;
        return branches.filter(b => b.name.toLowerCase().includes(sanitizedSearch));
    }, [branches, searchTerm]);

    useEffect(() => {
        setUsername('');
        setPin('');
        setError('');
    }, [selectedBranchId]);

    useEffect(() => {
        if (error) {
            setShake(true);
            const timer = setTimeout(() => setShake(false), 500);
            return () => clearTimeout(timer);
        }
    }, [error]);

    useEffect(() => {
        if (lockoutUntil) {
            const now = Date.now();
            if (now >= lockoutUntil) {
                setLockoutUntil(null);
                setAttempts(0);
            } else {
                const timer = setTimeout(() => {
                    setLockoutUntil(null);
                    setAttempts(0);
                }, lockoutUntil - now);
                return () => clearTimeout(timer);
            }
        }
    }, [lockoutUntil]);

    const selectedBranch = useMemo(() =>
            selectedBranchId === 'portal'
                ? { name: 'CENTRAL MAINFRAME', id: 'portal', isPinChanged: true } as any
                : selectedBranchFull
        , [selectedBranchId, selectedBranchFull]);

    const [tempManagerIdentity, setTempManagerIdentity] = useState<Employee | null>(null);

    // Fetch temp manager identity when branch changes.
    // Can't use the global employees cache here — it's empty pre-login.
    useEffect(() => {
        setTempManagerIdentity(null);
        if (!selectedBranch?.tempManager) return;
        const cleanTempName = selectedBranch.tempManager.toUpperCase().trim();
        // Check cache first (post-login the employees array is populated)
        const cached = employees.find(e => e.name?.toUpperCase().trim() === cleanTempName);
        if (cached) { setTempManagerIdentity(cached); return; }
        // Pre-login fallback: targeted query
        supabase
            .from(DB_TABLES.EMPLOYEES)
            .select('id, name, role, branch_id, branch_allowances, is_active')
            .eq(DB_COLUMNS.NAME, selectedBranch.tempManager.trim().toUpperCase())
            .maybeSingle()
            .then(({ data }) => { if (data) setTempManagerIdentity(data as unknown as Employee); });
    }, [selectedBranch, employees]);

    const handleRemoteResetSignal = async () => {
        if (isAuthenticating || !recoveryUsername.trim() || !selectedBranchId) return;
        setIsAuthenticating(true);
        setError('');
        setSuccess('');
        try {
            const { data, error: fetchError } = await supabase
                .from(DB_TABLES.EMPLOYEES)
                .select(`id, name, ${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.BRANCH_ALLOWANCES}`)
                .eq(DB_COLUMNS.USERNAME, recoveryUsername.trim().toLowerCase())
                .single();

            const isAuthorized = data && (
                data[DB_COLUMNS.BRANCH_ID] === selectedBranchId || 
                (data[DB_COLUMNS.BRANCH_ALLOWANCES] && typeof data[DB_COLUMNS.BRANCH_ALLOWANCES] === 'object' && selectedBranchId in data[DB_COLUMNS.BRANCH_ALLOWANCES])
            );

            if (fetchError || !data || !isAuthorized) {
                handleFailure('Identity Not Found');
            } else {
                // 1. Set request_reset on employee
                const { error: updateError } = await supabase
                    .from(DB_TABLES.EMPLOYEES)
                    .update({ [DB_COLUMNS.REQUEST_RESET]: true })
                    .eq(DB_COLUMNS.ID, data.id);
                if (updateError) {
                    console.error('[ResetSignal] employee update failed:', JSON.stringify(updateError));
                    throw updateError;
                }

                setSuccess('Reset Request Sent to Admin');
                playSound('success');
                setTimeout(() => { setIsRecoveryMode(false); setSuccess(''); setRecoveryUsername(''); }, 3000);
            }
        } catch (err) {
            setError('Signal Broadcast Failed');
            playSound('warning');
        } finally {
            setIsAuthenticating(false);
        }
    };

    const checkAndLogin = async (e?: React.MouseEvent | React.FormEvent, providedUsername?: string) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const finalUsername = (providedUsername || username).trim().toLowerCase();

        if (isAuthenticating || !selectedBranchId || pin.length < 6) return;

        // RELIEF MANAGER SETUP FLOW
        if (isReliefMode && reliefStep === 'pin') {
            setIsAuthenticating(true);
            setError('');
            const branch = selectedBranchFull;
            if (!branch) {
                handleFailure('Branch Lost');
                setIsAuthenticating(false);
                return;
            }

            if (pin !== branch.pin) {
                handleFailure('Invalid Branch PIN');
                setIsAuthenticating(false);
                return;
            }

            // PIN Correct, find relief manager assigned to this branch
            const tempName = (branch.tempManager || '').toUpperCase().trim();
            if (!tempName) {
                handleFailure('No Relief Manager assigned to this branch');
                setIsAuthenticating(false);
                return;
            }

            const emp = tempManagerIdentity;
            if (!emp) {
                handleFailure('Relief Manager not found in Registry');
                setIsAuthenticating(false);
                return;
            }

            setReliefEmployee(emp);
            setReliefStep('setup');
            setPin('');
            setUsername('');
            setConfirmPin('');
            setIsAuthenticating(false);
            playSound('success');
            return;
        }

        if (isReliefMode && reliefStep === 'setup') {
            if (!username.trim()) {
                setError('Username Required');
                return;
            }
            if (pin !== confirmPin) {
                setError('PINs do not match');
                setShake(true);
                return;
            }

            setIsAuthenticating(true);
            try {
                const salt = generateSalt();
                const hash = await hashPin(pin, salt);
                
                const { error: updateError } = await supabase
                    .from(DB_TABLES.EMPLOYEES)
                    .update({
                        [DB_COLUMNS.USERNAME]: username.trim().toLowerCase(),
                        [DB_COLUMNS.LOGIN_PIN]: hash,
                        [DB_COLUMNS.PIN_SALT]: salt
                    })
                    .eq(DB_COLUMNS.ID, reliefEmployee?.id);
                
                if (updateError) throw updateError;
                
                onLogin(UserRole.BRANCH_MANAGER, selectedBranchId!, pin, reliefEmployee?.id, username.trim());
                return;
            } catch (err) {
                setError('Account Initialization Failed');
                setIsAuthenticating(false);
                return;
            }
        }

        if (selectedBranch?.isPinChanged && !finalUsername && !isSetupAccountMode) {
            setError('Username Required');
            return;
        }

        if (isSetupAccountMode && !username.trim()) {
            setError('Full Name Required');
            return;
        }

        if (lockoutUntil && Date.now() < lockoutUntil) {
            const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
            setError(`Lockout: ${remaining}s`);
            playSound('warning');
            return;
        }

        setError('');
        setIsAuthenticating(true);
        const startTime = Date.now();

        // ── Offline login path ────────────────────────────────────────────────
        if (!navigator.onLine) {
            try {
                const cred = await getAuthCredential(finalUsername);
                if (!cred) {
                    setError('No offline credentials cached. Connect to the internet first.');
                    playSound('warning');
                    setIsAuthenticating(false);
                    return;
                }
                if (Date.now() - cred.cachedAt > MAX_OFFLINE_CREDENTIAL_AGE_MS) {
                    setError('Offline credentials expired. Connect to the internet to refresh.');
                    playSound('warning');
                    setIsAuthenticating(false);
                    return;
                }
                const valid = await verifyPin(pin, cred.salt, cred.hashedPin);
                if (!valid) {
                    handleFailure('Invalid Security PIN');
                    return;
                }
                onLogin(cred.role, cred.branchId, pin, cred.employeeId, cred.username ?? finalUsername, cred.permissions);
                return;
            } catch {
                setError('Offline login failed. Please try again.');
                setIsAuthenticating(false);
                return;
            } finally {
                const duration = Date.now() - startTime;
                setTimeout(() => setIsAuthenticating(false), Math.max(0, 800 - duration));
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        try {
            if (selectedBranchId === 'portal') {
                const portalController = new AbortController();
                const portalAbortTimer = setTimeout(() => portalController.abort(), 8000);
                let portalUser = null, portalError = null;
                try {
                    const res = await supabase
                        .from(DB_TABLES.PORTAL_USERS)
                        .select('id, login_pin, pin_salt, is_superadmin, display_name, permissions')
                        .eq(DB_COLUMNS.USERNAME, finalUsername)
                        .eq(DB_COLUMNS.IS_ACTIVE, true)
                        .abortSignal(portalController.signal)
                        .single();
                    portalUser = res.data;
                    portalError = res.error;
                } finally {
                    clearTimeout(portalAbortTimer);
                }

                if (portalError || !portalUser) {
                    handleFailure('Identity Not Found');
                } else {
                    const dbPin = portalUser.login_pin;
                    const dbSalt = portalUser.pin_salt;
                    let isValid = false;
                    if (dbSalt) {
                        const computedHash = await hashPin(pin, dbSalt);
                        isValid = computedHash === dbPin;
                    } else {
                        isValid = pin === dbPin;
                    }
                    if (!isValid) {
                        handleFailure('Invalid Security PIN');
                    } else if (portalUser.is_superadmin) {
                        // Full admin — no tab restrictions
                        const computedHashForCache = dbSalt ? await hashPin(pin, dbSalt) : pin;
                        saveAuthCredential({ username: finalUsername, hashedPin: computedHashForCache, salt: dbSalt ?? '', role: UserRole.SUPERADMIN, employeeId: portalUser.id, displayName: portalUser.display_name, cachedAt: Date.now() }).catch(console.warn);
                        onLogin(UserRole.SUPERADMIN, undefined, pin, portalUser.id, portalUser.display_name);
                    } else {
                        const perms: PortalPermissions = typeof portalUser.permissions === 'string'
                            ? JSON.parse(portalUser.permissions)
                            : (portalUser.permissions || { tabs: {} });
                        const computedHashForCache = dbSalt ? await hashPin(pin, dbSalt) : pin;
                        saveAuthCredential({ username: finalUsername, hashedPin: computedHashForCache, salt: dbSalt ?? '', role: UserRole.PORTAL_USER, employeeId: portalUser.id, displayName: portalUser.display_name, permissions: perms, cachedAt: Date.now() }).catch(console.warn);
                        onLogin(UserRole.PORTAL_USER, undefined, pin, portalUser.id, portalUser.display_name, perms);
                    }
                }
            } else {
                const branch = selectedBranchFull;
                if (!branch) {
                    handleFailure('Branch Lost');
                } else if (!branch.isEnabled) {
                    handleFailure('Access Revoked');
                    setSelectedBranchId(null);
                } else {
                    if (!branch.isPinChanged) {
                        if (branch.pin === pin) {
                            onLogin(UserRole.BRANCH_MANAGER, branch.id, pin, undefined, branch.manager || 'MANAGER');
                        } else {
                            handleFailure('Invalid Setup Key');
                        }
                    } else {
                        let empData = null;
                        const controller = new AbortController();
                        const abortTimer = setTimeout(() => controller.abort(), 8000);
                        try {
                            const query = supabase
                                .from(DB_TABLES.EMPLOYEES)
                                .select('id, name, username, is_active, role, branch_id, branch_allowances, login_pin, pin_salt')
                                .abortSignal(controller.signal);

                            if (isSetupAccountMode) {
                                query.eq(DB_COLUMNS.NAME, username.trim().toUpperCase())
                                     .eq(DB_COLUMNS.BRANCH_ID, branch.id);
                            } else {
                                query.eq(DB_COLUMNS.USERNAME, finalUsername);
                            }

                            const { data, error: empError } = await query.maybeSingle();
                            if (!empError) empData = data;
                        } finally {
                            clearTimeout(abortTimer);
                        }

                        if (!empData) {
                            handleFailure(isSetupAccountMode ? 'Name not in Branch Registry' : 'Identity Not Found');
                        } else {
                            const isActive = empData.isActive !== undefined ? empData.isActive : empData.is_active;
                            if (!isActive) {
                                handleFailure('Account Suspended');
                                return;
                            }

                            // ── Authorization check BEFORE PIN ──────────────────────────
                            // Allow login if:
                            //   (A) Name matches branch.manager — the classic head-manager check
                            //   (B) Name matches branch.tempManager AND employee belongs to branch
                            //   (C) Employee has MANAGER role for this branch in branchAllowances
                            //       (robust fallback for cases where branch.manager string doesn't
                            //       exactly match the employee name due to data entry differences)
                            const dbName = (empData.name || '').toUpperCase().trim();
                            const branchManagerName = (branch.manager || '').toUpperCase().trim();
                            const branchTempManagerName = (branch.tempManager || '').toUpperCase().trim();

                            const empBranchId = empData[DB_COLUMNS.BRANCH_ID] ?? empData.branchId ?? empData.branch_id;
                            const branchAllowances = empData[DB_COLUMNS.BRANCH_ALLOWANCES] ?? empData.branchAllowances ?? {};
                            const belongsToBranch = empBranchId === branch.id ||
                                (typeof branchAllowances === 'object' && branchAllowances !== null && branch.id in branchAllowances);

                            const isAuthorizedHead = dbName !== '' && dbName === branchManagerName;
                            const isAuthorizedRelief = branchTempManagerName !== '' && dbName === branchTempManagerName && belongsToBranch;

                            // Role-based fallback: employee's HOME branch is this branch
                            // and their base role is MANAGER. Intentionally does NOT check
                            // branchAllowances — a reliever/therapist at another branch
                            // should never inherit manager access here.
                            const isAuthorizedByRole = empBranchId === branch.id &&
                                (empData.role || '').toUpperCase().includes('MANAGER');

                            if (!isSetupAccountMode && !(isAuthorizedHead || isAuthorizedRelief || isAuthorizedByRole)) {
                                handleFailure('Unauthorized Terminal Access');
                                return;
                            }
                            // ────────────────────────────────────────────────────────────

                            let isValid = false;
                            const dbLoginPin = empData.loginPin !== undefined ? empData.loginPin : empData.login_pin;
                            const dbPinSalt = empData.pinSalt !== undefined ? empData.pinSalt : empData.pin_salt;

                            if (isSetupAccountMode) {
                                // In setup mode, they MUST use the branch PIN
                                isValid = pin === branch.pin;
                                if (isValid && dbLoginPin) {
                                    // If they already have a PIN, they shouldn't use setup mode
                                    handleFailure('Account already initialized. Use Username/PIN.');
                                    return;
                                }
                            } else if (dbLoginPin) {
                                if (dbPinSalt) {
                                    const computedHash = await hashPin(pin, dbPinSalt);
                                    isValid = computedHash === dbLoginPin;
                                } else {
                                    isValid = pin === dbLoginPin;
                                }
                            }

                            if (!isValid) {
                                handleFailure(isSetupAccountMode ? 'Invalid Branch Setup PIN' : 'Invalid Security PIN');
                                return;
                            }

                            if (isAuthorizedHead || isAuthorizedRelief || isAuthorizedByRole) {
                                const empUsername = (empData.username || empData.name || finalUsername).toLowerCase();
                                const hashForCache = dbPinSalt ? await hashPin(pin, dbPinSalt) : pin;
                                saveAuthCredential({ username: empUsername, hashedPin: hashForCache, salt: dbPinSalt ?? '', role: UserRole.BRANCH_MANAGER, branchId: branch.id, employeeId: empData.id, displayName: empData.username || empData.name, cachedAt: Date.now() }).catch(console.warn);
                                onLogin(UserRole.BRANCH_MANAGER, branch.id, pin, empData.id, empData.username || empData.name);
                            } else {
                                handleFailure('Unauthorized Terminal Access');
                            }
                        }
                    }
                }
            }
        } catch (err) {
            // Network error while technically "online" — try IDB cached credentials
            try {
                const cred = await getAuthCredential(finalUsername);
                if (cred) {
                    if (Date.now() - cred.cachedAt > MAX_OFFLINE_CREDENTIAL_AGE_MS) {
                        setError('Offline credentials expired. Connect to the internet to refresh.');
                        setIsAuthenticating(false);
                        return;
                    }
                    const valid = await verifyPin(pin, cred.salt, cred.hashedPin);
                    if (valid) {
                        onLogin(cred.role, cred.branchId, pin, cred.employeeId, cred.username ?? finalUsername, cred.permissions);
                        return;
                    } else {
                        handleFailure('Invalid Security PIN');
                        return;
                    }
                }
            } catch {
                // IDB also failed — fall through to generic error
            }
            setError('Network error. Connect to the internet or log in while online first to enable offline access.');
        } finally {
            const duration = Date.now() - startTime;
            const wait = Math.max(0, 800 - duration);
            setTimeout(() => setIsAuthenticating(false), wait);
        }
    };

    const handleFailure = (msg: string) => {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');
        setError(msg);
        playSound('warning');

        if (newAttempts >= MAX_ATTEMPTS) {
            setLockoutUntil(Date.now() + LOCKOUT_TIME);
            setError(`Lockout: ${LOCKOUT_TIME / 1000}s`);
        }
    };

    if (!selectedBranchId) {
        return (
            <NodeSelector
                branches={filteredBranches}
                searchTerm={searchTerm}
                onSearch={setSearchTerm}
                onSelect={(id) => {
                    setSelectedBranchId(id);
                }}
                logo={logo || null}
                version={version || null}
                appName={appName}
                connectionError={connectionError}
                isAuthenticating={isAuthenticating}
            />
        );
    }

    const isSetupMode = selectedBranchId !== 'portal' && !selectedBranch?.isPinChanged;
    const isSetupFlow = isSetupAccountMode || (isReliefMode && reliefStep === 'setup');

    const headerSubtitle = isSetupAccountMode
        ? 'Account Initialization'
        : isReliefMode
        ? reliefStep === 'pin' ? 'Relief Manager — Verify PIN' : 'Relief Manager — Create Account'
        : 'Identity Verification';

    const ctaLabel = isSetupFlow
        ? 'Initialize Account'
        : isReliefMode && reliefStep === 'pin'
        ? 'Verify Branch PIN'
        : 'Sign In';

    return (
        <div className="min-h-screen w-full bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6">
            {!systemLatest && <UpdatePopup apkUrl={apkUrl || null} />}

            <div className={`w-full max-w-sm transition-all duration-200 ${shake ? 'animate-shake' : ''} ${isAuthenticating ? 'opacity-75' : 'opacity-100'}`}>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

                    {/* ── HEADER ── */}
                    <div className="px-6 pt-7 pb-6 border-b border-gray-100">

                        {/* Back button */}
                        <button
                            onClick={() => { setSelectedBranchId(null); setPin(''); setConfirmPin(''); setError(''); setIsReliefMode(false); setIsRecoveryMode(false); playSound('click'); }}
                            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                            All Branches
                        </button>

                        {/* Logo + Branch identity */}
                        <div className="flex items-center gap-4">
                            <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden ${
                                logo && selectedBranchId !== 'portal'
                                    ? 'bg-gray-50 border border-gray-100'
                                    : selectedBranchId === 'portal'
                                    ? 'bg-slate-800'
                                    : isSetupFlow
                                    ? 'bg-indigo-50 border border-indigo-100'
                                    : 'bg-emerald-50 border border-emerald-100'
                            }`}>
                                {logo && selectedBranchId !== 'portal' ? (
                                    <img src={logo} alt="Logo" className="w-full h-full object-contain" />
                                ) : (
                                    <span className="text-2xl leading-none">
                                        {selectedBranchId === 'portal' ? '🔐' : isSetupFlow ? '👤' : '🏢'}
                                    </span>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <h1 className="text-base font-bold text-gray-900 truncate leading-snug">
                                    {selectedBranch?.name}
                                </h1>
                                <p className="text-xs font-medium text-gray-400 mt-0.5 uppercase tracking-wider">
                                    {headerSubtitle}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ── BODY ── */}
                    <div className="px-6 py-6">
                        {isRecoveryMode ? (
                            <RecoveryForm
                                onCancel={() => setIsRecoveryMode(false)}
                            />
                        ) : (
                            <form onSubmit={checkAndLogin} className="space-y-5">
                                <AuthForm
                                    username={username}
                                    setUsername={setUsername}
                                    pin={pin}
                                    setPin={setPin}
                                    confirmPin={confirmPin}
                                    setConfirmPin={setConfirmPin}
                                    isReliefMode={isReliefMode}
                                    reliefStep={reliefStep}
                                    isSetupMode={isSetupMode}
                                    isSetupAccountMode={isSetupAccountMode}
                                    isAdmin={false}
                                    tempManagerIdentity={tempManagerIdentity}
                                    reliefEmployee={reliefEmployee}
                                    isAuthenticating={isAuthenticating}
                                    lockoutUntil={lockoutUntil}
                                />

                                {/* Error banner */}
                                {error && (
                                    <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                                        <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        </svg>
                                        <p className="text-sm font-medium text-red-600 leading-snug">{error}</p>
                                    </div>
                                )}

                                {/* Primary CTA */}
                                <button
                                    onClick={(e) => checkAndLogin(e)}
                                    disabled={isAuthenticating || pin.length < 6 || !!lockoutUntil}
                                    className={`w-full py-4 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm ${
                                        isSetupFlow
                                            ? 'bg-indigo-600 hover:bg-indigo-700'
                                            : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                >
                                    {isAuthenticating ? (
                                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                        </svg>
                                    ) : ctaLabel}
                                </button>

                                {/* Secondary actions */}
                                {!isSetupMode && selectedBranchId !== 'portal' && (
                                    <div className="flex flex-col items-center gap-0.5 pt-1">
                                        {!isSetupAccountMode && !isReliefMode && selectedBranch?.tempManager && (
                                            <button
                                                type="button"
                                                onClick={() => { setIsReliefMode(true); setReliefStep('pin'); setReliefEmployee(null); setError(''); setPin(''); setConfirmPin(''); setUsername(''); playSound('click'); }}
                                                className="text-sm font-medium text-gray-500 hover:text-emerald-600 transition-colors py-2"
                                            >
                                                Relief Manager? Create Account
                                            </button>
                                        )}
                                        {!isSetupAccountMode && !isReliefMode && (
                                            <button
                                                type="button"
                                                onClick={() => { setIsRecoveryMode(true); setError(''); setPin(''); playSound('click'); }}
                                                className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors py-2"
                                            >
                                                Forgot credentials?
                                            </button>
                                        )}
                                        {(isSetupAccountMode || isReliefMode) && (
                                            <button
                                                type="button"
                                                onClick={() => { setIsSetupAccountMode(false); setIsReliefMode(false); setReliefStep('pin'); setReliefEmployee(null); setError(''); setPin(''); setConfirmPin(''); setUsername(''); playSound('click'); }}
                                                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors py-2"
                                            >
                                                Back to Sign In
                                            </button>
                                        )}
                                    </div>
                                )}
                            </form>
                        )}
                    </div>
                </div>

                {/* Version footer */}
                {version && (
                    <p className="text-center text-xs text-gray-400 mt-4 font-medium">
                        {appName || 'App'} v{version}
                    </p>
                )}
            </div>
        </div>
    );
};

export default Login;