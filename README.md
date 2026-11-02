# 👓 Lenskart Home Try-On (HTO) Quality Audit & Compliance Command Center (`locus-auditor`)

[![Production Status](https://img.shields.io/badge/status-production--ready-brightgreen.svg)](https://github.com/Kshitij-Bagal/Locus-Auditor)
[![Deployment](https://img.shields.io/badge/deployed--on-Vercel-black?logo=vercel)](https://locus-auditor.vercel.app)
[![Database](https://img.shields.io/badge/database-Supabase--PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/Kshitij-Bagal/Locus-Auditor)
[![Git Author](https://img.shields.io/badge/git--author-kshitijbagal%40gmail.com-blue)](mailto:kshitijbagal@gmail.com)

> **Developer & AI System Context Guide**: This document provides an exhaustive, end-to-end architectural and logical overview of the `locus-auditor` platform. It is specifically designed to be referenced in **Google Gemini** or any remote AI chat when working without direct physical access to the repository, enabling rapid iteration, debugging, and feature additions.

---

## 📑 Table of Contents
1. [Core Mission & Business Domain](#1-core-mission--business-domain)
2. [End-to-End Operational Workflow](#2-end-to-end-operational-workflow)
3. [System Architecture & Technology Stack](#3-system-architecture--technology-stack)
4. [File & Directory Map](#4-file--directory-map)
5. [In-Depth Feature & Logic Specifications](#5-in-depth-feature--logic-specifications)
   - [A. Streamlined Photo Auditing Flow](#a-streamlined-photo-auditing-flow)
   - [B. Fatal-Only FE-Level Aggregated Warning Engine](#b-fatal-only-fe-level-aggregated-warning-engine)
   - [C. SuperAdmin Schedulable Cron Engine](#c-superadmin-schedulable-cron-engine)
   - [D. Daily Manager Quality Digest & Escalation System](#d-daily-manager-quality-digest--escalation-system)
   - [E. Cluster Oversight & Manager Portal](#e-cluster-oversight--manager-portal)
   - [F. D+1 SLA Breach Escalation Engine](#f-d1-sla-breach-escalation-engine)
   - [G. Smart Auto-Allocation & Roster Balancing](#g-smart-auto-allocation--roster-balancing)
   - [H. POS Defective Tool Requisition Pipeline](#h-pos-defective-tool-requisition-pipeline)
   - [I. Central SOP Rules Studio (Two-Tier Governance)](#i-central-sop-rules-studio-two-tier-governance)
   - [J. Granular RBAC & Direct Page Access Matrix](#j-granular-rbac--direct-page-access-matrix)
   - [K. Responsive Compact Navigation Architecture](#k-responsive-compact-navigation-architecture)
6. [Database Schema & Data Models (Supabase)](#6-database-schema--data-models-supabase)
7. [Scheduled Cron Jobs & Automation (`vercel.json`)](#7-scheduled-cron-jobs--automation-verceljson)
8. [Environment Variables & External Services](#8-environment-variables--external-services)
9. [How to Use This Document with Google Gemini](#9-how-to-use-this-document-with-google-gemini)
10. [Roadmap & Pending Items](#10-roadmap--pending-items)

---

## 1. Core Mission & Business Domain

Lenskart operates a nationwide **Home Try-On (HTO / DLC)** service where **Field Executives (FEs / Optometrists / Refractionists)** visit customer homes equipped with diagnostic trial kits, optical frames, refraction tools, and telescoping standees.

During every home visit, the FE uploads mandatory clinical & operational photos via the **Locus** field app (customer selfie, equipment tray, standee distance, near-vision chart, ophthalmic penlights, and uniform with ID).

**`locus-auditor`** is the central governance portal used by Central QA Auditors, Area Managers (AMs), Regional Managers (RMs), City Admins, and Executive Leadership (GM & BH) to:
1. Ingest daily Locus dispatch spreadsheets.
2. Distribute photo inspection tasks evenly among active auditors on shift.
3. Rapidly audit checklist standards and record non-compliance strikes without workflow interruptions.
4. Auto-escalate SLA breaches (>24h un-audited) directly to leadership.
5. Aggregate fatal strikes daily and dispatch corporate tri-party warning emails to FEs, CC'ing their direct AM and RM.
6. Provide executive scorecards, benchmarking, and tool replacement logistics.

---

## 2. End-to-End Operational Workflow

```
[1. Locus Dispatch Spreadsheets]
             │
             ▼
[2. Task Ingestion & Image Detection (`UploadPage.jsx`)]
   ├── Parses `.xlsx` / `.csv`
   └── Auto-flags auditable tasks (tasks containing image links)
             │
             ▼
[3. Smart Roster & Auto-Allocation (`AutoAllocationRoster.jsx`)]
   ├── Checks active auditor roster (AVAILABLE, ON_LEAVE, HALF_DAY)
   └── Distributes auditable tasks equally across auditors on shift
             │
             ▼
[4. Live Photo Auditing Console (`AuditModal.jsx` / `App.jsx`)]
   ├── Auditor reviews photos against SOP criteria
   ├── Case A: PASS ──> Task marked PASSED in Supabase
   └── Case B: FATAL ──> Instant save to Supabase:
         • audit_status = 'FATAL'
         • email_notified = false (Queued for nightly batch)
         • Faulty tools logged in `replacement_orders`
         • Zero popup interruptions during live auditing!
             │
             ├──────────────────────────────────────────────┐
             │                                              │
             ▼                                              ▼
[5. Real-Time D+1 SLA Tracker]          [6. Nightly Scheduled Cron Jobs]
   • 24h countdown from allocation         │
   • Overdue tasks escalated to:           ├─► 20:00 IST: Daily Manager Digest
     Business Head (BH) &                     `/api/cron/daily-digest`
     General Manager (GM)                     High-level KPI email for AM & RM
                                              Flags 7-day rolling repeat offenders
                                           │
                                           └─► 20:30 IST: Fatal-Only FE Batch Notice
                                              `/api/cron/daily-fe-fatal-digest`
                                              Consolidated Warning Email per FE:
                                              • TO: Field Executive
                                              • CC: Direct Area Manager
                                              • CC: Regional Manager
                                              • Excludes FEs with 0 fatals (saves quota)
```

---

## 3. System Architecture & Technology Stack

| Layer | Technologies & Libraries | Notes |
|---|---|---|
| **Frontend Framework** | React 19 (`react`, `react-dom`), Vite 8 (`@vitejs/plugin-react`) | Single Page Application (SPA) architecture |
| **Styling & Design** | Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React Icons | Dark enterprise theme (`#0F172A`, `#0B1120`, `#DC2626`) |
| **Backend & Serverless** | Node.js, Vercel Serverless Functions (`/api`), Vite Middleware | Dual runtime support (local Vite middleware + Vercel serverless) |
| **Database & Auth** | Supabase PostgreSQL, Supabase Auth (`@supabase/supabase-js`) | RLS policies, profiles, foreign keys, cascade triggers |
| **Email Transports** | Resend API (`resend`), Nodemailer (`nodemailer` for SMTP) | Configurable via environment variables or in-app UI drawer |
| **Data Ingestion/Export**| SheetJS (`xlsx`) | Multi-sheet parsing, column matching, custom `.xlsx` scorecard generation |
| **Hosting & Automation**| Vercel (`vercel.json` Cron Jobs) | Automated crons at 20:00 and 20:30 IST daily |

---

## 4. File & Directory Map

```
Locus_Auditor/
├── api/                                # Serverless & Cron Endpoints
│   ├── cron/
│   │   ├── daily-digest.js             # 20:00 IST Manager Digest Cron handler
│   │   └── daily-fe-fatal-digest.js    # 20:30 IST Fatal-Only FE Warning Email Cron handler
│   └── send-email.js                   # Universal email dispatch API (Resend / SMTP)
│
├── src/
│   ├── api/
│   │   └── client.js                   # REST client: auth, tasks, users, rules, replacements, crons
│   │
│   ├── components/
│   │   ├── AccessControlPanel.jsx      # SuperAdmin Access Control & Cron Engine Host
│   │   ├── SuperAdminCronEngine.jsx    # Dedicated FE Fatal Cron UI, trigger, preview & logs
│   │   ├── ClusterManagerPortal.jsx    # AM/RM Cluster Oversight, scorecards, benchmarking
│   │   ├── DailyDigestManagerView.jsx  # Manager in-app digest viewer & sign-off accountability
│   │   ├── DPlusOneEscalationDashboard.jsx # 24h SLA breach tracker (escalated to BH & GM)
│   │   ├── AutoAllocationRoster.jsx    # Auditor shift roster & equal photo-load auto-allocator
│   │   ├── AssetRequisitionDashboard.jsx # City Admin POS defective tool requisition pipeline
│   │   ├── CentralRuleStudio.jsx       # SOP criteria governance (GM draft -> BH approval)
│   │   ├── AuditModal.jsx              # Systematic photo inspection modal & checklist
│   │   ├── EmailGatewaySettingsModal.jsx # In-app Resend / SMTP credentials drawer
│   │   ├── Navbar.jsx                  # Sleek collapsible icon nav with hover expand
│   │   └── FilterBar.jsx               # Audits filters (hub, auditor, date, status, search)
│   │
│   ├── utils/
│   │   ├── dailyDigestHelper.js        # Aggregation algorithms, HTML/Text email builders
│   │   ├── accessHelper.js             # RBAC roles, page permissions resolution & normalization
│   │   └── excelParser.js              # Locus Excel parsing & XLSX report generation
│   │
│   ├── data/
│   │   └── centralRules.js             # Default SOP criteria & failure definitions
│   │
│   ├── App.jsx                         # Main application state, routing, and audit handlers
│   ├── index.css                       # Global styles & Tailwind v4 imports
│   └── main.jsx                        # React root entry point
│
├── vercel.json                         # Vercel deployment & scheduled cron declarations
├── vite.config.js                      # Vite plugins, Tailwind v4, dev server middleware
├── package.json                        # Dependencies & scripts
└── supabase_schema.sql                 # Complete PostgreSQL schema, tables, views & seed data
```

---

## 5. In-Depth Feature & Logic Specifications

### A. Streamlined Photo Auditing Flow
- **Problem Solved**: Previously, marking an audit as `FATAL` interrupted the auditor with an email modal, prompting them to manually review recipients and click send for every single task. This slowed audit velocity and spammed manager inboxes.
- **Implementation**:
  - In [`src/App.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/App.jsx) (`handleFatalAudit`), when the auditor rejects a task:
    1. Saves directly via `tasksApi.failAudit` with `immediateEmail = false`.
    2. Flags `audit_status = 'FATAL'`, `email_notified = false`, `email_sent = false`.
    3. Auto-registers broken equipment into `replacement_orders`.
    4. Shows a fast toast notification: `Task #... marked FATAL! Recorded in DB & queued for nightly FE email.`
    5. Advances directly to the next task in the queue.

---

### B. Fatal-Only FE-Level Aggregated Warning Engine
- **Logic File**: [`src/utils/dailyDigestHelper.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/utils/dailyDigestHelper.js) (`aggregateFeFatalDigests`)
- **Cron File**: [`api/cron/daily-fe-fatal-digest.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/api/cron/daily-fe-fatal-digest.js)
- **Core Principles**:
  1. **Strict Fatal-Only Filtering**:
     - FEs with 0 fatals today receive **NO EMAIL**. In a fleet of 350+ FEs, if only 12 commit violations, exactly 12 emails are dispatched for the entire company, conserving 95%+ of email quota.
  2. **Hierarchical Tri-Party Resolution**:
     - Resolves the FE's profile in Supabase `profiles`.
     - Maps direct Area Manager: checks `reporting_manager_email`, foreign key `reporting_manager_id`, or hub fallback (`amObj.facility_code === hub`).
     - Maps Regional Manager: checks `regional_manager_email`, foreign key `regional_manager_id`, or regional pool fallback.
  3. **Routing**:
     - `TO`: Field Executive (`feEmail`)
     - `CC`: Area Manager (`amEmail`)
     - `CC`: Regional Manager (`rmEmail`)
  4. **Email Template Structure** (`buildFeFatalWarningEmailHtml`):
     - Red warning header: `FORMAL AUDIT NON-COMPLIANCE STRIKE NOTICE`.
     - KPI cards: Total Audited, Total Passed, Fatal Strikes.
     - Incident detail cards: Checklist violations, auditor remarks, equipment flagged for replacement, and direct deep-links to inspect photos (`/?taskId=123`).
     - **Mandatory Supervisory Action Box**:
       - *Reply-All Requirement*: FE must reply-all with written explanations before their next shift.
       - *AM Kit Review*: Area Manager instructed to inspect diagnostic kit (torches, frame, standee, uniform).
       - *Regional Record*: Warns that accumulating $\ge 2$ strikes triggers regional escalation and shift suspension.
  5. **Post-Dispatch Database Sync**:
     - Updates `tasks`: sets `email_notified = true`, `email_sent = true`, `email_sent_at = NOW()`, `email_recipients = [...]`.
     - Inserts record into `daily_fe_fatal_dispatch_logs`.

---

### C. SuperAdmin Schedulable Cron Engine
- **Component File**: [`src/components/SuperAdminCronEngine.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/SuperAdminCronEngine.jsx)
- **Location**: Mounted inside **Access Control** (`activePage === 'accessControl'`) under the top tab **"Daily FE Fatal Dispatch Engine (Schedulable Cron)"**.
- **Capabilities**:
  - **Schedule Indicator**: Live pulse showing automated schedule at `Daily 20:30 IST (8:30 PM)`.
  - **Today's Pending Fatal Strikes Queue**: Real-time table of affected FEs, fatal strike counts, failure reasons, and resolved AM/RM.
  - **Live Email Preview Modal**: Renders the exact HTML email before sending.
  - **Dry-Run Simulation**: Validates aggregation, recipient resolution, and email generation without sending actual emails.
  - **Instant Dispatch**: Triggers live dispatch for all affected FEs or a single selected FE.
  - **Force Re-dispatch**: Bypasses idempotency checks to re-send if necessary.
  - **Historical Dispatch Ledger**: Displays past execution timestamps, status (`SENT`, `DRY_RUN`, `FAILED`), and response IDs.

---

### D. Daily Manager Quality Digest & Escalation System
- **Logic File**: [`src/utils/dailyDigestHelper.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/utils/dailyDigestHelper.js) (`aggregateDailyDigest`)
- **Cron File**: [`api/cron/daily-digest.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/api/cron/daily-digest.js)
- **Schedule**: Every evening at **20:00 IST (8:00 PM)** (`0 20 * * *`).
- **Core Principles**:
  - Segments metrics by **Cluster/Hub** (for Area Managers) and **Territory/Region** (for Regional Managers).
  - Computes Total Audited, Passed, Fatals, and Compliance Rate %.
  - **Rolling 7-Day Repeat Offenders**: Automatically flags any FE who accumulated $\ge 2$ fatal marks across the rolling 7-day window.
  - Common fatal failure reasons breakdown.
  - Dispatches high-level KPI digest to manager inboxes.
  - **In-App Accountability Ledger**: Managers can view historical digests in the web UI and click **"Acknowledge & Sign-Off"**, writing `acknowledged_at` and `acknowledged_by_name` to Supabase.

---

### E. Cluster Oversight & Manager Portal
- **Component File**: [`src/components/ClusterManagerPortal.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/ClusterManagerPortal.jsx)
- **Replaces**: The legacy Field Staff page (all capabilities unified into Cluster Oversight).
- **Features**:
  - **Automatic Scoping**: AMs see only their assigned FEs; RMs see their entire region; SuperAdmin/BH/GM can switch between all clusters.
  - **FE Performance Table**: Shows visits audited, pass rate %, fatal strikes, tool orders, and a 1-click **Visits Filter** to jump directly to the Audits Console filtered by that FE.
  - **One-Click Excel Scorecard Export**: Downloads a formatted `.xlsx` workbook containing FE rankings, fatal metrics, and tool requisitions.
  - **Fatal Incidents Feed**: Real-time list of all failed visits with violation tags and remarks.
  - **AM Hub Benchmarking**: Comparative chart of fatal incident rates across all hubs in the region.

---

### F. D+1 SLA Breach Escalation Engine
- **Component File**: [`src/components/DPlusOneEscalationDashboard.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/DPlusOneEscalationDashboard.jsx)
- **Accurate SLA Timing**:
  - Calculates 24-hour countdown strictly from the **upload/allocation timestamp** (`task.created_at` or `task.allocated_at`), NOT from the customer appointment date.
  - Eliminates false SLA alerts caused by historical spreadsheet uploads.
- **Escalation Hierarchy**:
  - When an un-audited task breaches the 24-hour SLA window, it is flagged as **OVERDUE SLA BREACH**.
  - Formally escalated to **Business Head (BH)** and **General Manager (GM)** (dynamically resolved from active users).
  - Allows 1-click bulk re-assignment to auditors currently on shift.

---

### G. Smart Auto-Allocation & Roster Balancing
- **Component File**: [`src/components/AutoAllocationRoster.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/AutoAllocationRoster.jsx)
- **Features**:
  - **City Admin Audit Pool (Operational Policy)**:
    - In accordance with current operations (no dedicated personnel for pure Auditor role), **City Admins who hold access to the Audits Console** handle all photo quality auditing.
    - Active staff holding `City Admin` / `Admin` roles with audit access are automatically recognized and displayed in the live roster, workload tracking, filter dropdowns, and equal auto-allocation algorithm.
    - Strictly excludes non-auditing management and field roles (`AM`, `RM`, `GM`, `BH`, `FE`, `SuperAdmin`).
  - **Daily Attendance & Shift Roster**: Marks shift status (`AVAILABLE`, `ON_LEAVE`, `HALF_DAY`, `TRAINING`) with real-time Supabase persistence.
  - **Auditable-Only Filtering**: Isolates tasks with uploaded photos (`hasImages === true` and `imageCount > 0`). Text-only or cancelled tasks without photos are never allocated.
  - **Equal Load Balancing Algorithm** ([`src/lib/supabase.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/lib/supabase.js)): Divides pending photo tasks evenly across active roster members with capacity weights (`1.0` for full day, `0.5` for half day).
  - **Dynamic Re-Distribution Engine (`Re-distribute Tasks`)**:
    - Placed directly beside the initial "Distribute All Tasks" button.
    - Resolves post-allocation rebalancing whenever auditor shifts change, staff go on emergency leave, or new City Admins join.
    - Resets assignments across all **pending** auditable tasks while **strictly preserving already completed audits (PASSED or FATAL)**, re-distributes them evenly across active shift members, and updates Supabase.
  - One-click batch assignment that syncs directly with Supabase `tasks` table.

---

### H. POS Defective Tool Requisition Pipeline
- **Component File**: [`src/components/AssetRequisitionDashboard.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/AssetRequisitionDashboard.jsx)
- **Workflow**:
  1. Auditor flags broken tool during inspection (Torch, Trial Frame, Standee, etc.).
  2. Requisition created with status `FLAGGED_BY_AUDITOR`.
  3. City Admin reviews and orders replacement via POS (`ORDERED_ON_POS`).
  4. Physical disbursement logged (`DISBURSED_TO_FE`).

---

### I. Central SOP Rules Studio (Two-Tier Governance)
- **Component File**: [`src/components/CentralRuleStudio.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/CentralRuleStudio.jsx)
- **Roles**:
  - **General Manager (GM)**: Proposes and drafts new audit checkpoints, criteria descriptions, and failure triggers.
  - **Business Head (BH)**: Reviews proposed rules, approves drafts, or directly publishes active SOPs.

---

### J. Granular RBAC & Direct Page Access Matrix
- **Helper File**: [`src/utils/accessHelper.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/utils/accessHelper.js)
- **Component File**: [`src/components/AccessControlPanel.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/AccessControlPanel.jsx)
- **Role Hierarchy**:
  `SuperAdmin` > `BH` > `GM` > `Central Ops` > `City Admin` > `RM` > `AM` > `Auditor` > `FE`
- **Direct Permission Override**:
  - Page-level permissions can be directly enabled or disabled per user, taking precedence over default role limits.
  - E.g., granting an Auditor access to `replacements` and `managerPortal` automatically promotes their multi-role set without losing their primary role.
  - Saved to `profiles.page_access` in Supabase and cached in `localStorage`.

---

### K. Responsive Compact Navigation Architecture
- **Component File**: [`src/components/Navbar.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/Navbar.jsx)
- **Problem Solved**: High number of navbar items caused text collisions, wrapping, and header overflow on 1080p and smaller screens.
- **Design Pattern**:
  - Inactive tabs display as sleek icon buttons (`w-9 h-9`).
  - Moving the cursor over any button smoothly expands its label (`transition-all duration-300`).
  - The currently active page remains permanently expanded with solid blue branding.
  - Overall navbar width reduced from ~1,200px to ~430px.

---

### L. Access Control & Permission Architecture (Role Presets vs Granted Access)
- **Files**: [`src/utils/accessHelper.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/utils/accessHelper.js), [`src/components/AccessControlPanel.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/AccessControlPanel.jsx), [`src/components/RolePresetsMatrix.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/RolePresetsMatrix.jsx)
- **Architecture**:
  - **Decoupled Roles from Hardcoded Menus**: Every user holds a base role with standard corporate presets, but can be granted additional pages individually by SuperAdmin without changing their job title.
  - **Exact Baseline Role Presets**:
    - `SuperAdmin`: `['Audits', 'Upload Task', 'Roster & Workload', 'D + 1 Escalations', 'Quality Rules', 'Tool Orders', 'Cluster Oversight', 'User Accounts', 'Access Control', 'Fatal objection']`
    - `City Admin`: `['Audits', 'Tool Orders']`
    - `Auditor`: `['Audits']`
    - `AM`: `['Tool Orders', 'Cluster Oversight']`
    - `RM`: `['Tool Orders', 'Cluster Oversight']`
    - `Central Ops`: `['Audits', 'Upload Task', 'Tool Orders', 'Cluster Oversight']`
    - `GM`: `['Audits', 'Upload Task', 'Roster & Workload', 'D + 1 Escalations', 'Quality Rules', 'Tool Orders', 'Cluster Oversight', 'Fatal objection']`
    - `BH`: `['Audits', 'Roster & Workload', 'D + 1 Escalations', 'Quality Rules', 'Cluster Oversight']`
    - `FE`: `['My Visits']`
  - **Live Editable Role-Wise Presets Matrix (`RolePresetsMatrix.jsx`)**:
    - An interactive 2D table grid (9 Roles × 11 Consoles) in the Access Control panel.
    - SuperAdmin can toggle checkboxes for any role in real time to adapt to corporate reorganization or glitchy presets without code deployments.
    - Includes Row shortcuts (`[Grant All]`, `[Clear All]`, `[Reset Default]`), global `[Save Live Presets]`, `[Reset All to Defaults]`, and amber modified indicators for altered permissions.
    - Persisted to Supabase (`system_settings` table, key: `'role_presets'`) and `localStorage` (`locus_custom_role_presets_v4`).
    - Dispatches `locus_presets_updated` custom DOM events so `Navbar.jsx` and all components adapt instantly without page reloads.
  - **Dynamic Permission Check**:
    ```javascript
    hasAccess(profile, pageName);
    // Evaluates dynamically against live role presets:
    // pageName in getLiveRolePresets()[profile.role] || (profile.granted_page_access || []).includes(pageName)
    ```
  - **Access Control Panel Tabs**:
    1. `Role-Wise Default Presets Matrix (Editable)`: Live 2D grid of roles and permissions.
    2. `User Individual Access & Overrides`: Granular overrides per user profile.
    3. `Daily FE Fatal Dispatch Engine (Schedulable Cron)`: Automated nightly warning email dispatcher.

---

### M. Speedrun Hotkeys & Blanket Fatal Modal (`AuditModal.jsx`)
- **Component File**: [`src/components/AuditModal.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/AuditModal.jsx)
- **Global Input Guard**:
  ```javascript
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  ```
- **Zone Switches**:
  - `[i]`: Focus Photo Inspection Zone
  - `[v]`: Focus SOP Checkpoints / Verdict Section
  - `[c]`: Focus Fatal Criteria Checklist
  - `[o]`: Focus POS Tool Orders Section
- **Image Controls**:
  - `[1]`, `[2]`, `[3]`, `[4]`, `[5]`: Instant jump to photo (1: Selfie, 2: Tray, 3: Standee, 4: Torches, 5: Badge)
  - `[ArrowLeft]` / `[ArrowRight]`: Cycle through carousel
- **Section Traversal & Toggles**:
  - `[ArrowUp]` / `[ArrowDown]` / `[j]` / `[k]`: Move highlighted selection up/down inside active zone
  - `[Space]` or `[Enter]`: Toggle highlighted checkpoint or criteria checkbox
- **Rapid Submissions**:
  - `[p]`: Instantly marks audit as **PASSED** and auto-advances to the next queued task
  - `[f]`: Opens the **Blanket Fatal Modal** overlay
- **Blanket Fatal Modal Overlay (Triggered by Hotkey `[f]`)**:
  - Rapid-fire modal with top 3 objective auditor reasons:
    1. *All images missing / blank / black*
    2. *All images heavily blurred / unreadable*
    3. *Duplicate / recycled images detected*
  - Press `[1]`, `[2]`, or `[3]` (or `[ArrowUp]` / `[ArrowDown]` + `[Enter]`): Immediately marks task `FATAL` with selected reason, records `email_notified = false`, closes modal, and advances to next pending task.
  - `[Escape]`: Cancels and returns to regular audit.
- **Dedicated Modal UI Fatal Button (`FATAL AUDIT`)**:
  - Dedicated bottom action button is strictly reserved for manual, verified non-compliance strikes.
  - **Prerequisites for Submission**:
    1. **At least 1 checkpoint must be explicitly marked as FAIL** (`criteriaStatus`). Without any failed items, the button cannot mark the task as fatal.
    2. **At least 1 fatal failure criteria reason must be selected** (from common failure checklist or auditor remarks).
  - Provides intuitive validation feedback with real-time badges (`Needs Fail`, `Pick Reason`, or `X Failed`) to prevent accidental or groundless fatal submissions.

---

### N. Fatal Objection & Google Meet Dispute System
- **Files**: [`src/components/FatalObjectionHub.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/FatalObjectionHub.jsx), [`src/components/DisputeObjectionModal.jsx`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/components/DisputeObjectionModal.jsx), [`src/utils/calendarHelper.js`](file:///c:/Users/kshitijbagal/Desktop/Locus_Auditor/src/utils/calendarHelper.js)
- **24-Hour Dispute Window**:
  - Fatal task cards on FE Self-Service and AM/RM Cluster Oversight show a dynamic countdown: `"X hours left to dispute"`.
  - Once 24 hours elapse after `audited_at`, the `[Raise Objection]` button permanently disables.
- **Role Authority Distinction**:
  - **Field Executives (FE)**: Submit written contestations with dispute categories ("Locus Sync Issue", "Camera Hardware Fault", "Customer Denied Photo", etc.), explanation remarks, and optional counter-proof URLs. Cannot schedule meetings.
  - **Managers (AM & RM)**: Exclusive authority to schedule official Google Meet dispute reviews. Uses `generateGoogleMeetLink(...)` with pre-filled Google Calendar event linking `fe_email`, `am_email`, `rm_email`, and `assigned_auditor_email`.
- **Fatal Objection Hub**:
  - Accessible only to users with `'Fatal objection'` in effective access (SuperAdmin, GM, Senior Auditors).
  - Displays contested tasks categorized by status (`PENDING_REVIEW`, `MEET_SCHEDULED`, `RESOLVED_OVERTURNED`, `RESOLVED_UPHELD`).
  - Actions:
    - `[Re-Audit Task]`: Opens `AuditModal` in Senior Re-Audit Mode with dispute grounds banner. Overturning marks `audit_status = 'PASSED'`, zeroes strike, and logs resolution.
    - `[Uphold Strike]`: Finalizes fatal strike with senior auditor remarks.
    - `[Join Meet]`: Direct link button to join the scheduled Google Meet.

---

## 6. Database Schema & Data Models (Supabase)

### Table: `tasks`
| Column | Type | Description |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Task / Appointment ID (e.g. `1355459969`) |
| `task_id` | `TEXT` | Secondary reference ID |
| `fe_id` | `TEXT` | Field Executive Employee ID |
| `fe_code` | `TEXT` | Employee Code (e.g. `FE_102609`) |
| `fe_name` | `TEXT` | Field Executive full name |
| `fe_email` | `TEXT` | FE corporate email address |
| `facility_code` | `TEXT` | Hub / City (e.g. `Ahmedabad`, `Delhi-North`) |
| `zone` | `TEXT` | Regional cluster / dispatch zone |
| `customer_name` | `TEXT` | Patient / Customer name |
| `customer_phone`| `TEXT` | Customer contact number |
| `customer_otp`  | `TEXT` | OTP pin for visit verification |
| `dispatch_date` | `DATE` | Scheduled dispatch date |
| `images` | `TEXT[]` | URLs of uploaded SOP photos |
| `has_images` | `BOOLEAN` | True if at least 1 photo attached |
| `assigned_auditor_id` | `TEXT` | Assigned auditor UUID or person_id |
| `assigned_auditor_name`| `TEXT` | Assigned auditor full name |
| `allocated_at` | `TIMESTAMP` | Timestamp of workload distribution |
| `audit_status` | `TEXT` | `'PENDING'` \| `'PASSED'` \| `'FATAL'` |
| `audited_at` | `TIMESTAMP` | Timestamp when audit was completed |
| `audited_by_name` | `TEXT` | Auditor who reviewed the photos |
| `auditor_remarks` | `TEXT` | Specific failure feedback or pass notes |
| `failed_reasons` | `TEXT[]` | Array of violated checklist SOP items |
| `criteria_status`| `JSONB` | Granular per-checkpoint PASS/FAIL map |
| `replacements` | `JSONB` | Flagged defective tool objects |
| `email_notified` | `BOOLEAN` | **True once included in nightly batch warning** |
| `email_sent` | `BOOLEAN` | Dispatch status flag |
| `email_sent_at` | `TIMESTAMP` | Timestamp of warning email dispatch |
| `email_recipients`| `TEXT[]` | `[feEmail, amEmail, rmEmail]` |
| `dispute_status` | `TEXT` | `'NONE'`, `'PENDING_REVIEW'`, `'MEET_SCHEDULED'`, `'RESOLVED_OVERTURNED'`, `'RESOLVED_UPHELD'` |
| `dispute_category` | `TEXT` | Category of objection raised |
| `dispute_reason` | `TEXT` | Detailed justification provided by FE or Manager |
| `dispute_raised_by_role` | `TEXT` | Role of submitter (`FE`, `AM`, `RM`, `SuperAdmin`) |
| `dispute_raised_by_name` | `TEXT` | Name of user who submitted objection |
| `dispute_raised_at` | `TIMESTAMP` | Submission timestamp |
| `dispute_meet_url` | `TEXT` | Google Meet URL generated for dispute hearing |
| `dispute_meet_time` | `TIMESTAMP` | Scheduled time for Google Meet |
| `dispute_resolved_at` | `TIMESTAMP` | Resolution timestamp |
| `dispute_resolved_by_name` | `TEXT` | Senior QA / GM who resolved objection |
| `dispute_resolution_remarks` | `TEXT` | Formal remarks explaining uphold/overturn verdict |
| `dispute_proof_url` | `TEXT` | URL to counter-evidence uploaded by FE |

### Table: `profiles`
| Column | Type | Description |
|---|---|---|
| `id` | `UUID PRIMARY KEY` | Supabase auth user reference |
| `email` | `TEXT UNIQUE` | Staff corporate email address |
| `full_name` | `TEXT` | Full name |
| `role` | `TEXT` | Primary role (`SuperAdmin`, `AM`, `RM`, `Auditor`, etc.) |
| `roles` | `TEXT[]` | Multi-role assignment array |
| `facility_code` | `TEXT` | Assigned primary hub / city |
| `reporting_manager_email` | `TEXT` | Direct Area Manager (AM) email |
| `reporting_manager_name` | `TEXT` | Direct Area Manager full name |
| `reporting_manager_id` | `UUID` | Direct AM foreign key reference |
| `regional_manager_email` | `TEXT` | Regional Manager (RM) email |
| `regional_manager_name` | `TEXT` | Regional Manager full name |
| `granted_page_access` | `TEXT[]` | Individual granted page overrides independent of role preset |
| `page_access` | `TEXT[]` | Direct authorized page overrides |

### Table: `daily_fe_fatal_dispatch_logs`
| Column | Type | Description |
|---|---|---|
| `id` | `BIGSERIAL PRIMARY KEY` | Log identifier |
| `digest_date` | `DATE` | Audit date of recorded strikes |
| `fe_code` | `TEXT` | Field Executive code |
| `fe_name` | `TEXT` | Field Executive name |
| `fe_email` | `TEXT` | Addressee email (TO) |
| `am_email` | `TEXT` | Area Manager in CC |
| `rm_email` | `TEXT` | Regional Manager in CC |
| `fatal_count` | `INTEGER` | Number of fatal strikes incurred today |
| `task_ids` | `TEXT[]` | Array of task IDs included in notice |
| `sent_status` | `TEXT` | `'SENT'` \| `'DRY_RUN'` \| `'FAILED'` |
| `error_message`| `TEXT` | Delivery error message if failed |
| `sent_at` | `TIMESTAMP` | Dispatch timestamp |

### Table: `system_settings`
| Column | Type | Description |
|---|---|---|
| `key` | `TEXT PRIMARY KEY` | Unique setting key (e.g. `'role_presets'`) |
| `value` | `JSONB` | Dynamic JSON configuration payload |
| `updated_at` | `TIMESTAMPTZ` | Timestamp when setting was last modified |
| `updated_by` | `TEXT` | Admin user email / name who made the change |

---

## 7. Scheduled Cron Jobs & Automation (`vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "crons": [
    {
      "path": "/api/cron/daily-digest",
      "schedule": "0 20 * * *"
    },
    {
      "path": "/api/cron/daily-fe-fatal-digest",
      "schedule": "30 20 * * *"
    }
  ]
}
```

- **`0 20 * * *` (20:00 IST / 8:00 PM)**: Dispatches high-level KPI daily digests to Area Managers and Regional Managers.
- **`30 20 * * *` (20:30 IST / 8:30 PM)**: Dispatches consolidated non-compliance warning notices strictly to FEs with $\ge 1$ fatal strike today (CC: direct AM & RM).

---

## 8. Environment Variables & External Services

```ini
# Supabase Configuration
VITE_SUPABASE_URL=https://qaxzlidehuekecsrztsy.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=optional_service_role_for_backend_crons

# Cron Job Authorization Token
CRON_SECRET=your_secure_cron_secret_token

# Option A: Resend Cloud Email Provider
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=Lenskart Quality Audit <alerts@lenskart.in>

# Option B: SMTP Relay (Google Workspace / Gmail App Password / SES)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=audits@lenskart.in
SMTP_PASS=your_app_specific_password

# Public Application URL for Deep-Links in Emails
APP_URL=https://locus-auditor.vercel.app
NEXT_PUBLIC_APP_URL=https://locus-auditor.vercel.app
VITE_APP_URL=https://locus-auditor.vercel.app
```

---

## 9. How to Use This Document with Google Gemini

When you are away from your local machine and discussing features or debugging with **Google Gemini**, copy-paste this prompt:

```markdown
I am working on an existing production web application called "Locus Auditor" (Lenskart Home Try-On Quality Auditing platform).
Repository: https://github.com/Kshitij-Bagal/Locus-Auditor
Deployed at: https://locus-auditor.vercel.app

Below is the complete architectural reference:
[PASTE SECTIONS OR THIS ENTIRE README.MD HERE]

Here is the task/logic I want to improve:
<Describe your specific requirement here, e.g. "Add a dispute workflow for FEs" or "Integrate WhatsApp notification logic">
```

### Useful Gemini Conversation Starters:
1. *"I want to modify the Fatal-Only FE email template in `src/utils/dailyDigestHelper.js` to include photos inline. How do I adapt it?"*
2. *"I want to add an automatic shift suspension flag when an FE accumulates 3 fatals in 7 days. Which files should be updated?"*
3. *"Help me write the Supabase SQL migration for the WhatsApp notification logs table."*

---

## 10. Roadmap & Pending Items

- [x] **Fatal-Only FE Warning Email Aggregation**: Grouping daily strikes per FE and notifying FE, AM, RM.
- [x] **SuperAdmin Schedulable Cron Engine**: UI controls, dry-run simulation, and live trigger.
- [x] **D+1 SLA Calculation Fix**: Precise 24h countdown based on task ingestion time.
- [x] **Compact Expand-on-Hover Navbar**: Zero header overflow on smaller viewports.
- [ ] **WhatsApp Business API Dispatch** (*Excluded for now pending template approval & provider selection*): Daily summary SMS/WhatsApp messages to FEs.
- [ ] **FE Dispute & Re-Audit Workflow**: Permitting Field Executives to contest a strike with photo evidence for secondary review by Senior Auditors.
- [ ] **Automatic Shift Roster Suspension**: Auto-toggling FE availability to `SUSPENDED` if $\ge 3$ fatal strikes are confirmed within 7 days.

---

## 👥 Corporate Author & Contact
- **Project Lead**: Kshitij Bagal
- **Git Author Email**: `kshitijbagal@gmail.com`
- **Organization**: Lenskart Solutions Pvt. Ltd. &bull; Home Try-On (HTO) Quality & Governance Division
