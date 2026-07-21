# Branch Manager Guide — AI Knowledge Base

This document is the knowledge base for the AI assistant available to branch managers.
Answer questions based strictly on the information here. If something is not covered, say so honestly rather than guessing.

---

## What This System Is

This is a branch management system used by massage/wellness branches. It handles daily sales recording (POS), staff payroll, expenses, vault fund, and weekly remittances to the network owner. Every branch operates independently but reports to a superadmin who oversees the whole network.

---

## Navigating the Dashboard

The dashboard has tabs across the top. Here is what each one does:

- **POS** — Record customer transactions in real time. This is where you log each service session.
- **Sales Today** — View today's running totals: gross sales, expenses, staff pay, vault deposit, and net ROI. The report here auto-saves every 60 seconds.
- **Staff** — Directory of your branch employees. View attendance, tag late/half-day, and time in staff.
- **Client History** — View past client visits and transactions.
- **Expenses Hub** — Log and manage operational expenses.
- **Monthly Bills** — Manage your vault fund: deposits, withdrawals, and balance tracking.
- **Expense Reports** — View expense history filtered by month, with category breakdowns.
- **Salaries** — View weekly payroll summaries and payslips per staff.
- **Sales Reports** — View historical daily sales reports. Tap a report to see full details.
- **Remittance** — View your weekly period summaries and track remittance status.
- **Backfill** — Submit a request for a past date that was not recorded. Requires admin approval.
- **Settings** — Branch configuration: operating hours, PIN, access settings.
- **Complaints** — File or view staff complaints. PIN-gated for privacy.
- **How To** — In-app help documentation.

---

## Opening and Closing the Branch

**To open the branch:**
1. Tap your branch name or the status badge at the top of the dashboard.
2. A confirmation dialog will appear — confirm to set the branch to OPEN.
3. Once open, you can record transactions in POS.

**To close the branch:**
1. Tap the OPEN status badge.
2. A closing warning will appear if there is unsaved data.
3. Confirm to set the branch to CLOSED.

**Note:** The branch toggle may be time-gated to operating hours. Contact your admin if you cannot open or close outside the configured schedule.

---

## Recording a Transaction (POS Tab)

1. Go to the **POS** tab.
2. Select the service from the catalog.
3. Assign a therapist (and bonesetter if applicable).
4. Enter the client name if known.
5. Select payment method: **Cash** or **GCash**.
6. Tap **Save** to record the transaction.

The transaction appears immediately in today's session log and updates the Gross Sales total in Sales Today.

**To correct a transaction:** Find it in the session list, tap to open, and use the edit or void option.

---

## Understanding Sales Today (KPIs)

The Sales Today tab shows live totals for the current day:

- **Gross Sales** — Total revenue from all recorded transactions today. Broken down into Cash and GCash.
- **Expenses** — Total operational expenses logged today (not including vault deposit).
- **Staff Pay** — Total payroll for today's working staff. Tap to expand and see individual breakdowns (allowance, OT, late deductions, cash advance).
- **Vault Deposit** — The amount set aside into the vault fund today.
- **Net ROI** — What remains after deducting staff pay, expenses, and vault deposit from gross sales.
  - Shows **Growth** badge (green) if positive.
  - Shows **Deficit** badge (red) if negative.
  - Shows **Balanced** if zero.

The report auto-saves every 60 seconds while this tab is open. You do not need to manually save.

---

## Adding Expenses (Expenses Hub)

1. Go to **Expenses Hub**.
2. Tap **Add Expense**.
3. Enter the expense name, amount, and category.
4. Tap Save.

Expenses reduce your Net ROI for the day. Operational expenses appear under the Expenses KPI.

---

## Tagging Staff (Late, Half-Day, OT)

Go to the **Staff** tab to manage daily attendance:

- **Late** — Tap a staff card and enter the late deduction amount. This is subtracted from their pay for the day.
- **Half-Day** — Toggle the half-day switch on a staff card. This reduces their allowance by 50% for the day.
- **OT (Overtime)** — Enter the OT pay amount on the staff card. This is added to their total pay.
- **Cash Advance** — Enter any cash advance given. This is tracked but handled separately from payroll.

---

## Submitting a Backfill Request (Backfill Tab)

A backfill is a request to record data for a past date that was missed. It requires admin approval before it is saved.

**Steps:**
1. Go to the **Backfill** tab.
2. Select the **Target Date** (must be yesterday or earlier — cannot backfill future dates).
3. Enter **Gross Sales** for that day.
4. Add **Operational Expenses** if any (name + amount per item).
5. Add **Vault Deposit** if applicable (the amount set aside for the vault that day).
6. Fill in **Staff Payroll** for each staff who worked that day:
   - Commission, Allowance, OT Pay, Late Deduction, Cash Advance
   - Toggle **Half-Day** if applicable
   - To add a reliever (staff from another branch), use the reliever search field — their pay is automatically added to expenses
7. Write a **justification note** explaining why the backfill is needed (required).
8. Review the projected ROI summary shown at the bottom.
9. Tap **Submit Request**.

**What happens next:**
- The request is sent to the admin with status **Pending**.
- The admin reviews and either approves or rejects it.
- If approved, the report is saved for that date.
- If rejected, a review note will explain why.

You can view your submission history (last 10 requests) at the bottom of the Backfill tab with their current status.

---

## Weekly Remittance (Remittance Tab)

Remittance is the weekly process of reporting your net ROI to the admin. Your branch has a specific cutoff day set by the admin — this is the last day of each weekly period.

**How to read the Remittance tab:**
1. Select the period from the dropdown (e.g., "Current" or "1w ago").
2. The summary shows Gross Sales, Staff Pay, Expenses, Vault Deposit, and **Net ROI** for that period.
3. If there are multiple owners, the **Owner Distribution** section shows how the ROI is split.

**How remittance works:**
- After the period ends, review your Net ROI summary on the Remittance tab.
- Send the corresponding amount to the admin via your agreed payment method (GCash, Maya, deposit slip, etc.).
- Send proof of the transfer (screenshot or reference number) to your admin.
- The admin will verify and mark the period as **Remitted** on their end.
- You do not tap a "Submit" button — the admin is the one who confirms it.

**Adjustments (before the period is remitted):**
- **Add** — Add an amount to ROI (e.g., a correction)
- **Deduct** — Remove an amount from ROI (e.g., an expense that was not recorded)
- **Deposit to Vault** — Move funds from ROI into your vault balance
- **Owner Reimbursement** — Transfer between owners (net-neutral, for branches with multiple owners)
- Adjustments are locked 3 days after the period ends.
- Once the admin marks the period as Remitted, no further changes can be made.

**Status badges:**
- **Pending** (amber) — Period ended, not yet remitted
- **Awaiting** (blue) — Admin has seen it but not yet confirmed
- **Remitted** (green) — Confirmed by admin
- **Nothing to Remit** (gray) — Net ROI is zero or negative

**Reminder:** A reminder alert will appear if a past period has not been remitted yet. Once your admin confirms, the alert will go away automatically.

---

## Viewing Sales Reports (Sales Reports Tab)

1. Go to **Sales Reports**.
2. Reports are listed by date, newest first.
3. Tap a report row to open the full daily breakdown.
4. The detail view shows Gross Sales (with Cash/GCash split), Staff Payroll, Expenses, Vault Deposit, and Net ROI.
5. Older reports load automatically as you scroll down.

**Backfilled reports** are marked with an amber indicator on the report row, meaning the numbers were entered via a backfill request and approved by the admin.

---

## Vault Fund (Monthly Bills Tab)

The vault fund is a savings pool that accumulates from daily deposits. All branches use the vault fund system.

- **Balance** — Current amount saved in the vault.
- **Target** — The savings goal set by the admin.
- **Deposit** — Add funds to the vault. Enter the amount and confirm.
- **Withdrawal** — Remove funds from the vault. Requires a reason and amount.
- Transaction history is shown below the balance, with infinite scroll for older entries.

---

## Payroll / Salaries Tab

The Salaries tab shows weekly payroll summaries:

- Select a week from the period selector.
- Each staff member's payroll is shown with a breakdown of commission, allowance, OT, late deductions, and cash advance.
- Tap a staff card to view or print their payslip.
- Relievers (staff working from another branch) are listed separately.

---

## Viewing Expense Reports

1. Go to **Expense Reports**.
2. Select a month using the month selector.
3. Expenses are grouped by category.
4. Month-over-month comparison badges show whether spending increased or decreased.

---

## Filing a Complaint (Complaints Tab)

The Complaints tab is PIN-gated to protect privacy — only someone who knows the branch PIN can access it.

1. Go to **Complaints**.
2. Enter your branch PIN when prompted.
3. Select the staff member the complaint is about.
4. Describe the issue and submit.
5. The admin will review it and update the status.

---

## Settings Tab

The Settings tab has three sub-sections:

- **Operations** — Set or update operating hours and service catalog visibility.
- **Access** — Manage who can log in to this branch.
- **Security** — Change your branch PIN.

**To change your PIN:**
1. Go to Settings → Security.
2. Enter your current PIN and your new PIN twice.
3. Confirm. The new PIN takes effect immediately.

---

## Common Questions

**Q: Why is my Net ROI negative?**
A: Net ROI = Gross Sales − Staff Pay − Expenses − Vault Deposit. If the total deductions exceed gross sales, ROI goes negative (Deficit). Check if all expenses and staff pay were entered correctly.

**Q: Why can't I record transactions?**
A: The branch must be set to OPEN before you can use POS. Tap the status badge at the top to open the branch.

**Q: My sales report is missing a day. What do I do?**
A: Submit a backfill request from the Backfill tab. The admin will review and approve it.

**Q: How do I know when to remit?**
A: Your cutoff day is set by the admin. After that day, check your Net ROI on the Remittance tab and send the amount to your admin via GCash, Maya, or deposit — then send proof. The admin will mark it as Remitted once confirmed. You will also see a reminder alert on the Remittance tab if a period is overdue.

**Q: Do I tap a Submit button for remittance?**
A: No. You send the actual money and proof of transfer to your admin directly (GCash screenshot, Maya reference number, deposit slip photo, etc.). The admin is the one who marks it as Remitted in the system.

**Q: What is the difference between Expenses and Vault Deposit?**
A: Expenses are day-to-day operational costs (supplies, repairs, etc.) that reduce your Net ROI. The Vault Deposit is a portion of ROI set aside into your branch's savings fund — it also reduces your daily Net ROI but accumulates as a separate balance that can be withdrawn later for bigger expenses.

**Q: Can I edit a submitted backfill request?**
A: No. Once submitted, you cannot edit a pending request. If it is rejected, you can submit a new one with corrections using the admin's review note as guidance.

**Q: What does "Backfilled" mean on a report?**
A: It means the report was created through a backfill request (not recorded in real time on that day). The numbers were entered manually and approved by the admin.

**Q: Can I add adjustments to a period that is already remitted?**
A: No. Once the admin marks a period as Remitted, adjustments are locked. If there is a correction needed, contact your admin directly.

**Q: I made a mistake in today's report. What should I do?**
A: If the day is still ongoing, go to Sales Today — it is still editable. If the day has already closed, submit a backfill request to correct it.

**Q: How does the reliever system work in backfill?**
A: If a staff from another branch covered your branch on a past date, add them as a reliever in the backfill form using the reliever search. Their pay is automatically calculated and added to expenses (not to regular staff payroll) since they are not your branch's regular staff.

**Q: Why does the Complaints tab ask for my PIN?**
A: The PIN requirement is intentional — it ensures that complaints are not accidentally seen by staff members who may be using the device. Only someone who knows the branch PIN can view or file complaints.

**Q: What is the vault target?**
A: The vault target is the savings goal set by your admin. It shows how much your branch aims to save in the vault fund. Your current balance vs. the target is shown on the Monthly Bills tab.
