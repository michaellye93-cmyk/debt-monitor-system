# Debt Collection Management Web-App: Architecture & Workflow Specification

## 1. Core Objectives
To eradicate human error in tracking payment schedules, automate follow-ups, and transition from manual whiteboard tracking to a proactive, digital task management system.

## 2. Solving the Scenario: The New Workflow
Here is how the system handles the exact scenario with Creditor ABC, Staff A, and Ali, eliminating the chance of a forgotten follow-up.

### Phase 1: Case Intake & Agreement Setup
1. **Creditor Onboarding:** Admin inputs Creditor ABC and the total target of RM9,000.
2. **Debtor Allocation:** The system creates three separate ledgers under this case: Ali (RM3,000), Ahmad (RM3,000), and Jason (RM3,000).
3. **Automated Schedule Generation:** Staff A enters the negotiated terms.
   - **For Ahmad:** Selects "Weekly", Amount: RM100. The system automatically maps out all future payment nodes until the RM3,000 is depleted.
   - **For Ali:** Selects "Monthly", Amount: RM500, Start Date: 15 MAY 2026.

### Phase 2: The Daily Staff Dashboard (Smart Queue)
Staff A no longer relies on memory or a physical board. Upon logging in, the dashboard presents a **Daily Action List** automatically sorted by urgency.
- **Due Today:** Alerts for payments due on the current day.
- **Overdue (High Priority):** Payments missed from previous days that have not been addressed.
- **Scheduled Follow-ups:** Debtors who promised to pay today after a previous delay.

### Phase 3: Handling Delays (The "Postpone & Track" Protocol)
When Ali is called on 15 MAY 2026 and asks for 2 more days, the workflow adapts:
1. Staff A clicks **[Log Interaction]** on Ali's profile.
2. Staff A selects **[Postpone Payment]** and sets the new follow-up date to **17 MAY 2026**.
3. *Crucial Step:* The original due date remains recorded for reporting, but the system creates a hard task for Staff A on 17 MAY.
4. On 17 MAY, if Staff A is busy and forgets, the system will immediately flag Ali's account in red as **Overdue**, keeping it locked at the top of the dashboard until Staff A logs an outcome. The system will not clear the task until payment is recorded or a new interaction is logged.

### Phase 4: Payment Collection & Cycle Reset
When Ali finally pays on 30 MAY 2026:
1. Staff A logs the RM500 payment.
2. The system calculates the remaining balance (RM2,500) and automatically sets the next scheduled billing date (e.g., 30 JUN 2026) based on the monthly cycle.

---

## 3. Recommended Technical Stack
* **Database & Backend:** Supabase (PostgreSQL). Its relational database structure is perfect for handling complex creditor-debtor-payment relationships, and Edge Functions can be utilized to trigger daily automated checks.
* **Frontend:** A responsive web framework (e.g., Next.js or React) to provide a clean, fast interface for the staff.
* **Automation:** Integration with the WhatsApp Business API to handle basic communications.

## 4. Key Features for Efficiency
### A. Automated WhatsApp Nudges (AI Agent Integration)
Reduce Staff A's workload by having the system send automated WhatsApp messages 24 to 48 hours before a due date. 
*Example:* "Hello Ali, a friendly reminder that your scheduled payment of RM500 is due tomorrow. Please reply 'PAID' with your receipt, or speak with our agent if you need assistance."
If the debtor replies to request a delay, a webhook can instantly update the staff dashboard with the request.

### B. KPI & Merit Tracking
Tie the collection system into a structured staff merit framework to encourage diligence.
* **Bounty Points:** Staff earn points for closing scheduled payments on time or successfully recovering delayed payments. 
* **Escalation Alerts:** If an account sits in the "Overdue" queue for more than 48 hours without a newly logged interaction, the system automatically flags the manager.

## 5. Database Schema Blueprint 
To support this automated logic, the core database tables should be structured as follows:

* `creditors` (id, name, contact_info, agreement_date)
* `debt_cases` (id, creditor_id, total_debt, commission_rate, status)
* `debtors` (id, case_id, name, phone, total_owed, current_balance)
* `payment_schedules` (id, debtor_id, assigned_staff_id, expected_amount, due_date, status: 'pending' | 'paid' | 'delayed')
* `interaction_logs` (id, debtor_id, staff_id, notes, promised_date, created_at)
