# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # Production build → dist/
npm run lint         # Type-check only (tsc --noEmit) — no separate test runner
npm run cap:sync     # Build + sync to Capacitor Android project
npm run cap:open     # Open Android Studio
```

## Architecture Overview

Multi-tenant branch management system (POS + payroll + vault) with three user roles:

- **SuperAdmin** — master 6-digit PIN, network-wide visibility, manages all branches
- **Branch Manager** — per-branch 6-digit PIN, operates a single branch
- **Portal User** — restricted read/write access within one branch

**Data flow:**
```
useAuth() → useGlobalData(auth) → Supabase (PostgreSQL + Realtime)
```

`useGlobalData` (`hooks/useGlobalData.ts`) is the single source of truth — it loads all entities (branches, transactions, employees, expenses, attendance, sales reports, vault data, system config) and exposes them to the entire app. Components receive data as props from the top-level dashboard components, not by calling Supabase directly.

## Key Conventions

**Database access** — Always use `DB_TABLES` and `DB_COLUMNS` from `constants/db_schema.ts` rather than raw string literals. All columns are mapped there.

**Employee allowances & roles** — Per-branch overrides live in `emp.branchAllowances[branchId]`. Use `getEmployeeRole(emp, branchId)` and `getEmployeeAllowance(emp, branchId)` from `lib/payroll.ts` — never read the base `allowance` column directly.

**Time & timezone** — All date comparisons must use Manila time. Use `toManilaDateStr()` from `lib/time.ts`. Never use `new Date().toISOString().slice(0,10)` for date keys.

**Audit logging** — Every DB write (insert/update/delete) should call `logAudit()` from `lib/audit.ts`.

**Offline queue** — Writes that fail while offline are queued in localStorage (`hilot_core_pending_sync_v1`) and flushed on reconnect via `flushOfflineQueue()`. Upsert with `onConflict` is the safe write pattern.

**system_config** — A key-value table (`key TEXT PRIMARY KEY, value TEXT`). Read via `useGlobalData` which exposes decoded values (e.g. `displayChanges`, `isPaymongoEnabled`). Write via upsert with `onConflict: 'key'`. Managed in `SystemConfigHub.tsx`.

**PIN security** — PINs are hashed with SHA-256 + random salt via `hashPin(pin, salt)` from `lib/crypto.ts`. Never store or compare raw PIN strings.

**AI analysis** — `lib/ai.ts` wraps the Gemini API (`@google/genai`) for on-demand data analysis. `generateAnalysis(systemInstruction, userPrompt, dataContext)` is the main entry point. Requires `API_KEY` in the environment.

## Role-Based Rendering

`App.tsx` renders one of three top-level dashboards based on `auth.user.role`:
- `UserRole.SUPER_ADMIN` → `SuperAdminDashboard`
- `UserRole.BRANCH_MANAGER` → `BranchManagerDashboard`
- `UserRole.PORTAL_USER` → `BranchManagerDashboard` (read-only subset)

## Important Domain Logic

**POS / Transactions** — Services can have a primary provider (therapist) and secondary provider (bonesetter), each with their own commission. Commission can be fixed or percentage-based. A transaction records both `therapistId/Name` and `bonesetterId/Name`.

**Vault** — Branches optionally have a vault (`branch_vaults` table). When `vaultEnabled = true` on a branch, daily reports deduct a provision into the vault. Vault transactions are typed: `DEPOSIT`, `ADMIN_DEPOSIT`, `WITHDRAWAL`, `VAULT_WITHDRAWAL`. The `net_roi` on a `sales_report` is reduced when a superadmin deposits from that report's ROI.

**Payroll** — Weekly cycle (7 days). Allowances adjust for half-days and late deductions. Relievers (employees working at a non-home branch) are tracked separately from regular staff.

**Weekly Remittances** — Grouped by `weeklyCutoff` on the branch. The cutoff day-of-week determines which reports fall in which period. When viewing a specific branch's detail, the cutoff filter is bypassed to show all periods.

## File Locations

| Concern | Path |
|---|---|
| DB constants | `constants/db_schema.ts` |
| All types | `types/index.ts` |
| Auth hook | `hooks/useAuth.ts` |
| Global data | `hooks/useGlobalData.ts` |
| Optimized data (egress-cached) | `hooks/useOptimizedData.ts` |
| React Query data layer | `hooks/useNetworkData.ts` |
| Payroll utils | `lib/payroll.ts` |
| Time utils | `lib/time.ts` |
| PIN hashing (SubtleCrypto) | `lib/crypto.ts` |
| Supabase Storage helpers | `lib/storage.ts` |
| Gemini AI analysis | `lib/ai.ts` |
| Superadmin tabs | `components/superadmin/` |
| Branch manager tabs | `components/dashboard/sections/` |
| Shared/reusable UI | `components/shared/` |
| What's New modal | `components/branch-manager/modals/WhatsNewModal.tsx` |

## Mobile Build

Capacitor wraps the Vite build as an Android app. APK CI/CD runs on GitHub Actions (`.github/workflows/build-android.yml`). The APK URL is stored in `system_config` under the `apk_filename` key and served from Supabase Storage bucket `apk`.
