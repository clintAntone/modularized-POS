# Vault Deposit Refactor

**Date:** 2026-04-28  
**Scope:** Remove `VAULT_DEPOSIT` expense-record pattern; consolidate all vault deposits into `sales_reports.vault_data` + `sales_reports.total_vault_provision`.

---

## What Changed & Why

### Before (confusing)
Manager vault deposits created an **expense record** in the `expenses` table with `category: 'VAULT_DEPOSIT'`. This forced every layer of the app to filter, exclude, or special-case `VAULT_DEPOSIT` records constantly.

Problems caused:
- `total_expenses` in reports was inflated by vault deposits → had to filter them out when displaying "Operational Expenses"
- Net ROI formula needed an `isLegacyBranch` conditional to avoid double-counting PROVISION and VAULT_DEPOSIT
- `MassBackfillHub` had to split vault items into `expenseData` for modern vs `vaultData` for legacy
- `VaultExpenses.tsx` derived vault deposit display by filtering `category === 'VAULT_DEPOSIT'` from expense records
- `MonthlyBillsSection.tsx` queried the `expenses` table for deposit history

### After (clean)
Manager vault deposits write directly to the `sales_reports` row (upsert):
- `total_vault_provision` incremented by deposit amount
- `vault_data` array gets a new entry: `{ id, name, amount, category: 'VAULT_DEPOSIT', timestamp }`

**Unified Net ROI formula (all branch types):**
```
Net ROI = Gross − Total Expenses (OPERATIONAL only) + Vault Withdrawal − Provision (legacy) − Vault Provision − Staff Pay
```

No more `isLegacyBranch` conditional in the formula.

---

## Data Model

### `sales_reports` table

| Column | Role after refactor |
|---|---|
| `total_expenses` | OPERATIONAL expenses only |
| `total_vault_provision` | Sum of all vault deposits for the day (manager + admin) |
| `vault_data` | JSONB array of deposit entries `{ id, name, amount, category, timestamp }` |
| `expense_data` | JSONB array of OPERATIONAL + VAULT_WITHDRAWAL expenses |
| `net_roi` | `gross - total_expenses - total_vault_provision + vault_withdrawal - total_staff_pay` |

### `vault_data` entry shape
```json
{
  "id": "abc123",
  "name": "VAULT DEPOSIT",
  "amount": 1500,
  "category": "VAULT_DEPOSIT",
  "timestamp": "2026-04-28T14:30:00.000+08:00"
}
```

Categories used in `vault_data`:
- `VAULT_DEPOSIT` — manager deposit from SALES tab
- `VAULT_FUND_DEPOSIT` — admin deposit from VaultFundHub
- `PROVISION` — legacy R&B provision (legacy branches only)

### `expenses` table
No longer receives `VAULT_DEPOSIT` or `VAULT_FUND_DEPOSIT` records. Only stores:
- `OPERATIONAL` expenses
- `VAULT_WITHDRAWAL` expenses
- `PROVISION` expenses (legacy branches)
- `RELIEVER PAYOUT` expenses

---

## Files Changed

### `components/dashboard/sections/SalesTodaySection.tsx`
- **Added:** `todayVaultData` state — fetches `vault_data` from today's `sales_reports` row on mount
- **Changed:** `handleVaultDeposit` — no longer creates an expense record; instead upserts `sales_reports` (increments `total_vault_provision`, appends to `vault_data`), then updates `branch_vaults.balance`
- **Changed:** Net ROI formula — removed `isLegacyBranch` conditional; uses `todayVaultData` sum as `totalVaultProvision`
- **Changed:** `metrics.vaultDeposit` renamed to `metrics.vaultProvision`
- **Changed:** `handleFinalDeleteExpense` — removed `VAULT_DEPOSIT` balance adjustment (deposits no longer in expenses table)
- **Changed:** `VaultExpenses` call — passes `vaultDepositLogs={todayVaultData}` as a new prop; removed `VAULT_DEPOSIT` from `operationalLogs` filter

### `components/dashboard/sections/sales-today/VaultExpenses.tsx`
- **Added:** `vaultDepositLogs?: any[]` prop — vault deposits sourced from `sales_reports.vault_data`, not from `operationalLogs`
- **Changed:** `useMemo` split — `vaultDepositLogs` now comes from the prop instead of filtering `operationalLogs`
- **Unchanged:** All rendering logic (item display, delete, sort) — vault deposit items have the same shape

### `components/BranchManagerDashboard.tsx`
- **Changed:** `nonRelieverOperationalExp` — removed `VAULT_DEPOSIT` from the filter (only `OPERATIONAL` now)
- **Removed:** `vaultDeposit` from `totals` return value
- **Changed:** Auto-save `useEffect` — for vault-enabled branches, fetches current `vault_data` and `total_vault_provision` from the report before building the payload, so the upsert does not overwrite vault deposit data
- **Changed:** `EXPENSE_DATA` payload — removed `VAULT_DEPOSIT` from the filter
- **Changed:** `VAULT_DATA` payload — for vault-enabled branches, uses the fetched report vault data; for legacy, uses PROVISION expenses from `todayExps`
- **Changed:** Vault reminder banner — replaced `totals.vaultDeposit > 0` check with `branchVault.balance > 0`

### `components/dashboard/sections/MonthlyBillsSection.tsx`
- **Changed:** `vault_transactions` query — no longer queries `expenses` table for deposits; instead reads `vault_data` from `sales_reports` for the branch (last 90 reports ≈ 3 months), extracts `VAULT_DEPOSIT` and `VAULT_FUND_DEPOSIT` entries; still queries `expenses` for `VAULT_WITHDRAWAL` entries separately

### `components/superadmin/VaultFundHub.tsx`
- **Changed:** `handleAdminDeposit` — removed expense record creation; now upserts `sales_reports` (increments `total_vault_provision`, appends `VAULT_FUND_DEPOSIT` entry to `vault_data`)
- **Changed:** `historicalTotals` — reads `totalVaultProvision` instead of `vaultDeposit`
- **Changed:** `branchDepositHistory` — reads `totalVaultProvision` instead of `vaultDeposit`

### `components/dashboard/sections/BackfillRequestSection.tsx`
- **Removed:** Legacy/modern split in request payload
- **Changed:** Request always sends `totalExpenses = ops only`, `totalVaultProvision = bills total`, `expenseData = operationalItems`, `vaultData = provisionItems` (which may contain PROVISION or VAULT_DEPOSIT entries)

### `components/superadmin/RequestsHub.tsx`
- **Changed:** Backfill approval — destructures `expenseData` and `vaultData` from `request.data`; writes them to the report instead of falling back to `existingReport.expenseData`/`existingReport.vaultData`

### `components/superadmin/MassBackfillHub.tsx`
- **Removed:** Legacy/modern split when loading existing reports — vault items always come from `vault_data`, expenses from `expense_data`
- **Removed:** Legacy/modern split when saving — `expense_data = expenseData`, `vault_data = vaultData` always; no merging of VAULT_DEPOSIT into expense_data

### `components/dashboard/sections/reports-master/ReportDashboardModal.tsx`
- **Added:** `vaultDepositEntries` derived from `report.vaultData` filtered by `VAULT_DEPOSIT`/`VAULT_FUND_DEPOSIT`
- **Changed:** `operationalExpenses` — now strictly `OPERATIONAL` only (no more `VAULT_DEPOSIT` in the allowed list)
- **Changed:** Expense display — merges `vaultDepositEntries` with `operationalExpenses` for rendering
- **Changed:** `vaultDeposit` KPI prop — reads from `report.totalVaultProvision` instead of `report.vaultDeposit`

### `components/superadmin/SalesReportHub.tsx`
- **No changes needed** — already uses `vaultData` for vault totals and `expenseData` for expense totals; the refactor simply moved VAULT_DEPOSIT from `expenseData` to `vaultData`, giving the same net result

---

## Old Records (`VAULT_DEPOSIT` expense records)

Any `VAULT_DEPOSIT` expense records created before this refactor can be deleted from the `expenses` table directly — they are orphaned. The corresponding `sales_reports` rows should be updated manually or via a migration if historical accuracy is needed.

---

## Net ROI Formula Reference

```
Net ROI = Gross Sales
        − Total Expenses     (OPERATIONAL expenses only)
        + Vault Withdrawal   (vault paying an expense — cancels out)
        − Provision          (legacy R&B deposits, only for non-vault branches)
        − Vault Provision    (vault deposits = total_vault_provision)
        − Total Staff Pay
```
