# Locus FE Quality & Audit Command Center

A high-performance, responsive auditing dashboard designed for **Lenskart Operations** to systematically audit Field Executive (FE / Refractionist) at-home eye test dispatches exported from Locus.

Built for **simultaneous multi-location practical use** across city hubs (Ahmedabad, Delhi NCR, Mumbai, Bangalore, Hyderabad, Pune, Chennai, Kolkata).

---

## 🆕 New Management Features Added

### 1. 🛠️ Defective Items & Equipment Replacement Requisition Zone
Auditors can now flag faulty, broken, non-working, missing, or expired tools during image inspection:
- **Direct in Inspect Modal**: A dedicated **"Asset Faults & Orders"** tab alongside the SOP checklist.
- **Quick Pick by Photo**:
  - *Torches*: Cobalt Blue Torch, Amber Yellow Torch, AAA Rechargeable Batteries.
  - *Refraction Kit*: Universal Trial Frame, Jackson Cross Cylinder (JCC), Near Vision Book, Handheld Mirror, PD Ruler, Hand Sanitizer.
  - *Vision Acuity*: Telescopic Standee & Bracket, Snellen Acuity Chart.
  - *Merchandising*: 18-Slot Frame Display Tray, DLC Carry Backpack, Lenskart Polo, ID Badge.
- **Fault Condition & Urgency Tagging**:
  - Condition: *Non-working / Inoperative*, *Damaged / Broken parts*, *Missing / Lost*, *Exhausted consumable*, etc.
  - Urgency: *Critical / Immediate Block (Within 24h)*, *High Priority*, *Routine Consumable Restock*.
  - Auditor remarks on specific defects (e.g., loose screw, dead bulb).

### 2. 📦 Weekly & Monthly Central Procurement Requisition Reports
A dedicated **"Asset Orders"** tab in the main navigation:
- **Weekly / Monthly Filters**: View items ordered over the last 7 days or 30 days.
- **Procurement SKU Aggregation**: Groups items by SKU count (e.g., 5 Blue Torches needed across Ahmedabad, 3 Standees needed across Mumbai) so Central Supply can bulk-order before FEs run out of equipment.
- **Detailed FE Distribution Table**: Maps every replacement order to the FE Name, Rider ID, Facility Hub, Urgency, and Date.
- **1-Click Excel Order Export (`.xlsx`)**: Generates a procurement workbook ready to send to the Central Logistics & Supply Chain team.

### 3. 🔐 Simple Authentication & FE Self-Service Portal
Field Executives can now log in to view their own consolidated compliance records:
- **Login Credentials**:
  - **Facility / Hub Code** (e.g. `Ahmedabad`, `DLC-AHM`)
  - **Person ID / Rider ID** (e.g. `227563`, `213812`, `214687`, `207874`, `208658`, `228766`)
- **FE Self-Service Dashboard**:
  - Displays only the logged-in executive's visits, pass rate, and compliance score.
  - **Consolidated Fatal Strikes**: Shows exactly which visits received a fatal strike, the specific reasons (e.g. Missing Uniform, ID card blurred, torches non-functional), and auditor feedback.
  - **Replacement Orders for Me**: FEs can check what tools and consumables have been ordered for their kit by QA.
  - **SOP Quick Refresher**: The 5 golden standards to prevent future fatals.
  - 1-Click Logout back to Auditor mode.

---

## 🚀 How to Deploy for Simultaneous Multi-Location Practical Use

### 🌐 Option 1: Direct Vercel Deployment (Fastest — 30 Seconds)
1. Double-click **`deploy_to_vercel.bat`** (or run `npx vercel --prod` in terminal).
2. Follow the 1-time prompt to log in with your email or GitHub account.
3. Accept default project settings.
4. **Done!** Vercel gives you a live global link (e.g. `https://locus-fe-auditor.vercel.app`).
5. Share this link with QA auditors, city leads, and FEs across all locations—no local setup or installation required!

---

### 🐙 Option 2: Deploy to GitHub & Auto-Connect to Vercel
1. Create a new repository on [GitHub](https://github.com/new) named `locus-auditor`.
2. Double-click **`setup_github.bat`** and paste your GitHub repository URL.
3. Open **[vercel.com/new](https://vercel.com/new)** $\rightarrow$ Click **Import** next to your `locus-auditor` repo $\rightarrow$ Click **Deploy**.
4. Every time you push an update to GitHub, Vercel will auto-deploy within seconds.

---

## 🏢 Multi-Location Collaboration Features

1. **Auditor Hub Tagging**: Each auditor selects their operating station (e.g. *Ahmedabad Hub*, *Mumbai Hub*, *Delhi NCR Hub*).
2. **Session Bundle Export & Merge**: Auditors in different cities can audit separate tasks and merge their sessions (`.json`) into one consolidated master view without overwriting notes.
3. **Live Cross-Browser Broadcast Sync**: Auditors on the same network or shared room code receive live real-time audit updates across tabs and windows without manual page reloads.
4. **100% Client-Side Privacy**: Customer addresses, phone numbers, and employee records remain encrypted in local browser memory.
