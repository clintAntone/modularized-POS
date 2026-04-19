# 🧪 HilotCenter Core - Critical Test Suite

This document maintains the list of critical features and business logic requirements that must be verified during system updates.

---

## 🔐 1. Authentication & Identity
| Feature | Expected Behavior | Criticality |
|:---|:---|:---:|
| **Initial Node Setup** | New branches require 6-digit random PIN. First login triggers mandatory PIN change + Username creation. | High |
| **Relief Access** | Designated "Relief Managers" can log in to a branch using their personal PIN/Username. | High |
| **Identity Verification** | System prevents "Ghost Logins" (employees assigned to Branch A cannot login to Branch B unless designated as a relief manager). | High |
| **Credential Reset** | Staff "Forgot PIN" triggers a flag in SuperAdmin dashboard. Admin reset reverts account to setup mode. | Med |

---

## 🕒 2. Operational Lifecycle
| Feature | Expected Behavior | Criticality |
|:---|:---|:---:|
| **Daily Opening** | "Initialize Daily Opening" purges stale transaction data from the local registry (moving it to archive) and marks node as OPEN. | High |
| **Attendance Loop** | Employees must "Time In" to appear in the POS provider selection list. | High |
| **12:00 AM Manila Rule** | Any node left "OPEN" at midnight is automatically marked "OFFLINE" and flagged for maintenance. | High |
| **Shift Integrity** | Staff cannot "Time Out" if they are currently assigned to an ongoing (unpaid) session. | Med |

---

## 💳 3. POS Terminal (Critical Transactions)
| Feature | Expected Behavior | Criticality |
|:---|:---|:---:|
| **Commission Split** | For "Dual Provider" services, Lead and Support staff commissions are calculated separately based on catalog rules. | Critical |
| **Discount Propagation** | Manual discounts or PWD/Senior toggles must reduce the Gross and proportionally reduce the commission (if percentage-based). | High |
| **Immutable Logs** | Finalized sessions cannot be edited without moving to "Corrections" mode, which creates an Audit Log entry. | High |
| **Multi-Service Logic** | Selecting multiple services sums the base price, duration, and individual commissions accurately. | Med |

---

## 💰 4. Financial Integrity (ROI)
| Feature | Expected Behavior | Criticality |
|:---|:---|:---:|
| **R&B Provisioning** | Daily "Rent & Bills" provision must be logged as an expense (Category: PROVISION) before Net ROI is calculated. | Critical |
| **Vault Settlements** | Withdrawals from the Monthly Vault (SETTLEMENT) require a mandatory receipt photo and are blocked if balance < amount. | High |
| **Net ROI Formula** | `Gross - (OpEx + Provision + Staff Salaries)`. Verified against manual ledger calculation. | Critical |
| **Payroll Variables** | Late Deductions, OT Pay, and Cash Advances must accurately reflect in the Weekly Cycle Report. | High |

---

## 🏢 5. SuperAdmin Mainframe
| Feature | Expected Behavior | Criticality |
|:---|:---|:---:|
| **Global Catalog Sync** | Updating a service price in a Master Catalog must update the prices across all subscribed Branch Nodes instantly. | High |
| **Network Live Feed** | Real-time monitoring of all active node gross/net sales simultaneously. | Med |
| **Registry Migration** | Exporting a SQL snapshot and importing it back must restore all 11 tables with RLS policies intact. | Med |
| **Neural Audit** | Gemini AI scan correctly identifies "High Risk" patterns (e.g., multiple deletes followed by low-value transactions). | Med |

---

## 📱 6. Mobile & UI/UX
| Feature | Expected Behavior | Criticality |
|:---|:---|:---:|
| **Responsive Grid** | All data tables collapse into "Bento Cards" on mobile viewports. | Med |
| **Camera Integration** | Receipt capture works on iOS/Android browsers using native camera intent. | Med |
| **Audio Feedback** | System provides distinct sounds for 'Success', 'Warning', and 'Navigation Click'. | Low |

---

## 🛡️ Edge Cases to Verify
- [ ] **Midnight Overlap:** Transaction recorded at 11:59 PM but saved at 12:01 AM.
- [ ] **Dual Role:** Manager acting as a Therapist (must earn commission + daily allowance).
- [ ] **Max Discount:** Applying a 100% discount (Yield should be ₱0, Commissions should be ₱0).
- [ ] **Vault Depletion:** Multiple simultaneous settlements exceeding current vault balance.
- [ ] **Profile Wipe:** Deactivating a manager while they are still assigned to a live branch node.