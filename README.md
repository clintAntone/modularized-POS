# 💆 HilotCenter Core Management System
### Enterprise Multi-Branch POS, Payroll, and ROI Intelligence Terminal
### Created by: Clint Antone Raro

HilotCenter Core is a professional-grade, distributed management ecosystem designed for high-volume wellness networks. It centralizes financial oversight while decentralizing daily operations across branch nodes.

---

## 🏗️ System Architecture

The application operates as a **Distributed Node Network**. 
*   **Central Mainframe:** Hosted on Supabase (PostgreSQL), managing the global registry of transactions, employees, and services.
*   **Branch Nodes:** Individual browser terminals functioning as physical branch portals with real-time state synchronization.
*   **Neural Layer:** Integrated Google Gemini AI providing coaching, performance analysis, and security auditing.

---

## 🔐 User Roles & Access

### 1. SuperAdmin (Network Architect)
*   **Scope:** Full Network Visibility.
*   **Access:** Master 6-digit PIN.
*   **Duties:** Node deployment, global pricing control, system-wide data migration, and AI-driven intelligence gathering.

### 2. Branch Manager (Node Operator)
*   **Scope:** Single Branch Operations.
*   **Access:** Unique Branch PIN (Mandatory 6-digit setup on first login).
*   **Duties:** Transaction recording, staff performance tracking, petty cash management, and daily ledger closure.

---

## 📱 Branch Manager Dashboard (The Terminal)

### 💳 POS Terminal Tab
*   **Usage:** The primary interface for recording customer sessions.
*   **Features:** Multi-service selection, automated dual-provider logic (Therapist + Specialist), and Senior/PWD discount toggles.
*   **Validation Rules:**
    *   **Manager Lock:** Transactions cannot be recorded if a Branch Manager is not unassigned.
    *   **Inactive Filter:** Only staff marked as `is_active = true` appear in selection dropdowns.
    *   **Role Constraint:** Primary roles (Bonesetter/Therapist) are enforced based on the service definition.

### 📈 Today's Ledger Tab
*   **Usage:** Live monitor of the current day's performance.
*   **Features:** Real-time Gross vs Net calculation, session history with "Scrub" (Delete) capability, and staff-specific earnings breakdown.
*   **Validation Rules:**
    *   **Finalization:** Data is auto-synced to the cloud registry every 1.5 seconds.
    *   **Provision Check:** Highlights if the daily Rent & Bills (R&B) deposit has been fulfilled.

### 👥 Staff Directory Tab
*   **Usage:** Managing the branch personnel roster.
*   **Features:** Role assignment (Manager, Therapist, Bonesetter, Trainee), and base daily allowance setting.
*   **Validation Rules (Anti-Purge Logic):**
    *   **Hard Delete Block:** A manager **cannot delete** an employee who has recorded a transaction or attendance in the current 7-day weekly cycle.
    *   **Soft Deactivation:** Staff can be marked `Inactive`. This preserves their historical data for payroll but removes them from the POS selection.
    *   **Self-Protection:** Managers cannot deactivate their own profiles.

### 💸 Daily Exp Tab
*   **Usage:** Recording local petty cash outflows (Laundry, Supplies, Repairs).
*   **Features:** Camera integration for receipt capturing and categorized logging.
*   **Validation Rules:** All operational expenses require a name and amount to sync.

### 🧾 Monthly Exp (Vault) Tab
*   **Usage:** Managing the "Rent & Bills" (R&B) reserve pool.
*   **Features:** Track daily contributions (Deposits) and monthly settlements (Withdrawals for utility bills).
*   **Validation Rules:** 
    *   **Balance Protection:** Settlements cannot be authorized if the amount exceeds the current vault balance.
    *   **Evidence Requirement:** All vault withdrawals require a mandatory receipt photo capture.

### 💵 Payroll Tab
*   **Usage:** Audit of staff earnings across 7-day Weekly Cycles.
*   **Features:** Detailed breakdown of Commissions + Allowances + OT - Lateness - Advances.
*   **AI Coach:** Powered by Gemini AI to provide a 3-bullet briefing on top achievers and efficiency tips.

### 🗄️ Archive (Reports Master) Tab
*   **Usage:** Deep-dive into historical daily reports.
*   **Features:** High-fidelity image export of past daily ledgers for sharing via social messaging.

---

## 🛠️ SuperAdmin Console (The Hub)

### 🏬 Branches Tab
*   **Usage:** Deploying and configuring terminal nodes.
*   **Validation Rules:** 
    *   **Access Control:** Terminals can be "Suspended" to block all local branch login attempts.
    *   **Temporal Calibration:** Set unique "Weekly Cutoff Days" and "Daily Provision Targets" per branch.

### 🗂️ Catalogs Tab
*   **Usage:** Centralized library of services.
*   **Features:** Link specific catalogs to specific branches. 
*   **Logic:** Branches cannot create services; they "subscribe" to catalogs managed by the SuperAdmin to ensure pricing integrity.

### 📋 Services (Matrix) Tab
*   **Usage:** A birds-eye view of every service price and commission across the entire network.

### 📡 Live Feed (Sales Hub) Tab
*   **Usage:** Real-time revenue tracking across all active nodes simultaneously.

### 🧠 Intel Tab
*   **Usage:** AI Analytics Hub.
*   **Features:** Ask the HilotCore Intelligence natural language questions about network growth, branch rankings, and ROI trends.

### ⚙️ Settings (Global) Tab
*   **Security:** Master PIN management.
*   **PayMongo Toggle:** Enable or disable PayMongo digital payment links globally.
*   **Export/Import:** Generate full SQL snapshots of the entire system. Allows for "Cloud Relay" (Emailing backups) and full system restoration from a file.

---

## 📏 Core Operational Governance

### 1. The 12:00 AM Manila Rule
To prevent data stale-states, the system automatically sets any node left "OPEN" to "CLOSED" at **12:00 AM Manila Time**. Managers must "Initialize Opening" daily to resume POS operations. Furthermore, branches without shift tracking enabled will have their staff deactivated automatically at this time to ensure fresh daily roster validation.

### 2. Dual-Provider Protocol
Services defined as "Dual Provider" require two staff members (a primary and a secondary support). The system automatically splits commissions based on the rules defined in the Master Catalog.

### 3. ROI Integrity
Net ROI is calculated using the formula:
`Gross Sales - (Operational Expenses + R&B Provision) - Total Staff Payroll`
This ensures that the Rent & Bills reserve is accounted for *before* profit is calculated.

---

## 🚀 Deployment (Static Hosting / Hostinger)

If you are using a standard PHP/HTML hosting plan (like Hostinger Shared Hosting), follow these steps to ensure the application works correctly:

### 1. Build the Application
Run the following command in your local terminal:
```bash
npm run build
```
This will generate a `dist` folder.

### 2. Upload to Hostinger
Upload the **contents** of the `dist` folder to your `public_html` directory via FTP or Hostinger File Manager.

### 3. Handle Client-Side Routing
The application includes a `.htaccess` file in the `public` directory. Ensure this file is uploaded to your `public_html`. It redirects all traffic to `index.html` so that the React router can handle the pages.

### 4. PayMongo Integration (Supabase Edge Functions)
Since static hosting cannot run Node.js, the PayMongo integration has been moved to **Supabase Edge Functions**.
1. Go to your **Supabase Dashboard > Edge Functions**.
2. Create a new function named `paymongo-handler`.
3. Copy the code from `SUPABASE_EDGE_FUNCTION.txt` (found in the root of this project) into your function.
4. Set your PayMongo Secret Key in Supabase:
   ```bash
   supabase secrets set PAYMONGO_SECRET_KEY=sk_test_your_key
   ```
5. The application will automatically detect and use the Supabase function for payments.

---
*Verified Security v3.0 • HilotCenter Core Intelligence Engine*