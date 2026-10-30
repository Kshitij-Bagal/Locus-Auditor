# 👓 Lenskart Home Try-On (HTO) Quality Audit & Compliance Command Center

[![Production Status](https://img.shields.io/badge/status-production--ready-brightgreen.svg)](https://github.com/Kshitij-Bagal/Locus-Auditor)
[![Deployment](https://img.shields.io/badge/deployed--on-Vercel-black?logo=vercel)](https://locus-auditor.vercel.app)
[![Database](https://img.shields.io/badge/database-Supabase--PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/license-Enterprise-blue.svg)](#)

A high-performance, enterprise-grade Quality Auditing, Governance, and SLA Escalation platform built for **Lenskart DLC & Home Try-On (HTO) Operations**. Systematically audits Field Executive (FE / Optometrist / Refractionist) at-home customer appointments exported from Locus across pan-India regional hubs.

---

## 🌟 Executive Feature Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│             LENSKART QUALITY AUDIT & GOVERNANCE COMMAND CENTER                  │
└─────────────────────────────────────────────────────────────────────────────────┘
      │
      ├── 📋 Image Audit Console        ── Dual-mode photo inspection & SOP checklist
      ├── 📥 Daily Task Ingestion       ── Locus spreadsheet parser with image detection
      ├── ⚖️ Auto-Allocation & Roster    ── Shift roster & capacity-balanced auto-allocator
      ├── 🚨 D+1 SLA Escalation Engine   ── Real-time 24h SLA tracker escalated to BH & GM
      ├── 🏢 Cluster Oversight (AM & RM)── Scoped manager oversight, scorecards & fatals
      ├── 📬 Daily Digest & Escalation  ── 20:00 IST automated cron & 7-day repeat offenders
      ├── 📧 Real Tri-Party Email Engine── Live email dispatch to FE, AM (CC), and RM (CC)
      ├── 🛠️ Tool Replacement Orders    ── City Admin POS asset requisition & status tracking
      ├── 📜 Central SOP Rules Studio   ── Two-tier GM draft & BH publishing governance
      ├── 🔐 Granular Access Control    ── Custom page permission overrides per user/role
      └── 📱 FE Self-Service Portal     ── Executive compliance scorecard & visit records
```

---

## 🚀 Key Modules & Architecture

### 1. 🏢 Cluster Oversight & Management Portal (`ClusterManagerPortal.jsx`)
A specialized executive portal designed for **Area Managers (AMs)**, **Regional Managers (RMs)**, and Senior Leadership:
- **Automatic Hierarchy Scoping**:
  - **Area Manager (AM)**: Automatically filters and displays Field Executives reporting directly to them (`reporting_manager_email` / `id` / `name`).
  - **Regional Manager (RM)**: Scopes to all AM clusters, territories, and hubs under regional governance.
  - **Executive Mode (SuperAdmin, GM, BH, Central Ops)**: Global cluster picker to inspect any AM or RM territory across India.
- **FE Compliance Scorecard**: Tracks completed visits, pass rates, fatal strikes, and tool replacement requisitions with a 1-click **Excel Export** (`.xlsx`).
- **Direct Audit Filter**: 1-click `Visits ({count})` button to jump straight into the Audits Console pre-filtered by that specific executive.
- **Fatal Incidents Feed**: Live feed of all fatal violations with failure reasons, auditor remarks, and notice dispatch triggers.
- **AM Hub Benchmarking**: Comparative analysis of fatal incident counts and strike rates across all regional hubs.

---

### 2. 📬 Daily Quality Audit Digest & Escalation System (`DailyDigestManagerView.jsx`)
Aggregates daily audit performance without spamming inboxes with individual alerts:
- **Automated Vercel Cron (`/api/cron/daily-digest`)**: Scheduled to run every evening at **20:00 IST** (`0 20 * * *`).
- **Rolling 7-Day Repeat Offender Detection**: Automatically flags FEs accumulating **&ge; 2 Fatal marks** in the past 7 days.
- **Idempotency Guard**: Checks `daily_digest_logs` by `(digest_date, recipient_email)` to prevent duplicate dispatches.
- **Enterprise Responsive HTML Email Template**:
  - Color-coded KPI summary cards (Audited, Fatals `#D93025`, Compliance Rate `#1E8E3E`).
  - Urgent Repeat Offenders alert block.
  - Summary table of today's fatal visits with direct `Inspect →` deep-links.
  - Common root-cause failure breakdown.
- **Manager Accountability Ledger**: AMs and RMs can view historical digests in-app and click **"Acknowledge & Sign-Off"** to record audit accountability in Supabase.

---

### 3. 📧 Real Tri-Party Email Dispatch Engine (`api/send-email.js`)
Delivers real emails directly to inboxes:
- **Hierarchical Recipient Resolution**:
  - **To**: Field Executive (FE)
  - **CC**: Area Manager (AM)
  - **CC**: Regional Manager (RM)
- **Universal Provider Support**:
  - **Option 1: Resend API**: Instant cloud delivery via `RESEND_API_KEY`.
  - **Option 2: SMTP Relay**: Supports Google Workspace / Gmail App Passwords, Microsoft 365, Amazon SES, and corporate SMTP.
- **In-App Gateway Settings Drawer**: Enter credentials directly in the UI and click **"Test Mail"** to verify live inbox delivery!
- **Persistent Dispatch Logging**: Every email is logged into Supabase `audit_email_logs`.

---

### 4. 🚨 D+1 SLA Escalation Engine (`DPlusOneEscalationDashboard.jsx`)
Prevents un-audited appointments from slipping past compliance windows:
- **Accurate SLA Countdown**: SLA is strictly calculated from the **upload/allocation timestamp** (not the historical lead date).
- **24-Hour D+1 Threshold**: Dispatches exceeding 24 hours without audit are escalated to **Sunil Kumar (Business Head)** and **Rajesh Sharma (General Manager)**.
- **Direct Auditor Reassignment**: Reallocate overdue audits to active auditors on shift with 1 click.
- **Escalation Notices**: Dispatches formal SLA breach notices to auditors.

---

### 5. ⚖️ Smart Auto-Allocation & Workload Balancing (`AutoAllocationRoster.jsx`)
- **Shift Roster Management**: Set daily auditor availability (`AVAILABLE`, `ON_LEAVE`, `HALF_DAY`, `TRAINING`).
- **Equal Photo-Audit Distribution**: Allocates tasks with photos evenly across available auditors, filtering out un-auditable text-only dispatches.
- **Instant Allocation & Manual Override**: Review workload distributions and batch-allocate with full audit trails.

---

### 6. 🛠️ Defective Tools & POS Replacement Requisitions (`AssetRequisitionDashboard.jsx`)
- Auditors can flag damaged, missing, or inoperative equipment during photo review (torches, trial frame, JCC, near vision card, standees, sanitizer).
- **City Admin POS Pipeline**: Tracks status through `FLAGGED_BY_AUDITOR` &rarr; `ORDERED_ON_POS` &rarr; `DISBURSED_TO_FE`.
- **Procurement SKU Aggregation**: Bulk quantities by hub for central logistics replenishment.

---

### 7. 📜 Central SOP Rules Studio (`CentralRuleStudio.jsx`)
Two-tier corporate governance:
- **General Manager (GM)**: Drafts new checklist criteria, failure triggers, and coaching guidelines.
- **Business Head (BH)**: Reviews, approves, or directly publishes binding audit rules.

---

### 8. 🔐 Granular RBAC & Access Control Studio (`AccessControlPanel.jsx`)
- Built-in multi-role parsing and normalization.
- Granular per-user page permission overrides saved persistently in Supabase and `localStorage`.
- Preset buttons for fast role assignment (`SuperAdmin`, `City Admin`, `Central Ops`, `Auditor`).

---

### 9. 🎨 Sleek Compact Navigation Bar (`Navbar.jsx`)
- **Compact Icon Navigation**: Tabs collapse to compact icons (`~34px`), reducing header width from 1,200px to **~430px**.
- **Smooth Expand-on-Hover**: Moving your cursor over any tab smoothly animates and reveals its full label (`300ms` transition).
- **Active Tab Highlight**: Current active page remains permanently expanded with solid blue branding.
- **Anchored User Profile & Logout**: Firmly fixed on the right edge with zero text overflow or squishing.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS v4, Lucide Icons |
| **Backend / Serverless** | Node.js, Vercel Serverless Functions (`/api`), Vercel Cron |
| **Database & Auth** | Supabase PostgreSQL, Row-Level Security (RLS), Supabase Auth |
| **Email Delivery** | Resend API, Nodemailer (SMTP Relay for Google Workspace / Outlook) |
| **Data Processing** | SheetJS (XLSX parsing and report generation) |

---

## ⚙️ Environment Variables Reference (`.env`)

```ini
# Supabase Database Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Daily Digest Scheduled Cron Security
CRON_SECRET=your_secure_cron_secret_token_here

# Outgoing Email Gateway (Option A: Resend API)
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM=Lenskart Quality Audit <onboarding@resend.dev>

# Outgoing Email Gateway (Option B: SMTP Relay / Google Workspace)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=audits@lenskart.in
SMTP_PASS=your_app_specific_password

# Application Base URL for Deep-Links in Digest Emails
APP_URL=https://locus-auditor.vercel.app
NEXT_PUBLIC_APP_URL=https://locus-auditor.vercel.app
```

---

## 🏃 Getting Started Locally

### 1. Prerequisites
- **Node.js** 18+ installed
- **Git** installed

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Kshitij-Bagal/Locus-Auditor.git
cd Locus-Auditor

# Install dependencies
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### 4. Production Build
```bash
npm run build
```

---

## 🗄️ Database Setup (Supabase)

1. Open your [Supabase Dashboard](https://supabase.com).
2. Navigate to the **SQL Editor**.
3. Open [`supabase_schema.sql`](./supabase_schema.sql) from this repository, paste the contents, and click **Run**.
4. This script installs:
   - Tables: `profiles`, `tasks`, `replacement_orders`, `audit_criteria_rules`, `auditor_capacity`, `auditor_roster`, `audit_email_logs`, `daily_digest_logs`.
   - Views: `fe_hierarchy_view`.
   - Row-Level Security (RLS) policies and performance indexes.
   - Initial seed accounts with multi-role support.

---

## 🚢 Production Deployment to Vercel

1. Push your changes to GitHub on branch `main`:
   ```bash
   git push origin main
   ```
2. Link your repository in [Vercel](https://vercel.com/new).
3. Add the environment variables listed in `.env` into the Vercel Project Settings.
4. Vercel automatically detects [`vercel.json`](./vercel.json) and configures the build and the daily **20:00 IST cron job**.
5. Your live app will be deployed at `https://locus-auditor.vercel.app`.

---

## 👥 Default Corporate Roles & Access

| Role | Default Access Scope | Key Capabilities |
|---|---|---|
| **SuperAdmin** | All Pages | Complete system configuration, user accounts, and RBAC studio |
| **Central Ops** | Upload, Allocation, Audits, Escalations, Replacements, Cluster Oversight | Task ingestion, roster balancing, and auto-allocation |
| **City Admin (Admin)** | Audits, Replacements, Escalations, Cluster Oversight | Hub-level compliance, POS tool ordering, and FE oversight |
| **Area Manager (AM)** | Cluster Oversight, Audits, Replacements | Scoped oversight of assigned FEs, daily digests, and sign-offs |
| **Regional Manager (RM)**| Cluster Oversight, Audits, Replacements | Regional performance benchmarking and cluster accountability |
| **General Manager (GM)** | Quality Rules, Escalations, Allocation, Replacements, Cluster Oversight | SOP criteria drafting and D+1 breach monitoring |
| **Business Head (BH)** | Quality Rules, Escalations, Allocation, Replacements, Cluster Oversight | Binding rule publishing and senior executive governance |
| **Auditor** | Audits | Photo checklist inspection, PASS / FATAL marking, tool flagging |
| **Field Executive (FE)** | My Visits (`fePortal`) | Self-service ledger of audits, fatal reasons, and tool replacements |

---

## 📄 License
Internal proprietary software developed for **Lenskart Solutions Pvt. Ltd.** All rights reserved.
