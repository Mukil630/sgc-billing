# SGC Billing v6.0 — Sri Ganapathi Colours Enterprise Suite
<img width="1774" height="887" alt="SGC Billing Dashboard" src="https://github.com/user-attachments/assets/07d6ebf3-6530-462f-a97b-07c2a78eacd0" />

Enterprise Billing, GST Invoicing, Customer Ledger & Financial Management System tailored for Textile Dyeing & Bleaching Units.

---

## 🌟 New Features in v6.0

1. **📁 Autonomous Month-Wise Google Drive Vault Allocation**:
   - Invoices are automatically categorized and routed into chronological month subfolders (e.g. `2026-05 (May 2026)`, `2026-07 (July 2026)`, `2026-09 (September 2026)`).
   - Zero lost files with 100% cloud redundancy across 3 distributed vault mirrors.

2. **🏛️ Monthly GST Tax Radar & Bill-by-Bill Breakdown**:
   - Auto-aggregates CGST (2.50%), SGST (2.50%), and Total GST (5.00%) across all invoices of the month for GSTR-3B and GSTR-1 filing.
   - Dedicated interactive table showing each bill's individual GST amounts with a single-click WhatsApp export for the CA / Tax Auditor.

3. **📱 Telegram AI Mobile Control Plane**:
   - `/gst` — Interactive GST Control Center with Inline Buttons to toggle months, download GSTR-1 CSV directly into chat, and forward tax data to CA.
   - `/bill` — Generate official tax invoices with Dynamic UPI QR codes (CSB Bank / GPay / PhonePe) directly from mobile on the factory floor.
   - `/overdue` — Real-time customer balance radar with automated Tamil/English payment reminder templates.

4. **💬 Instant WhatsApp Invoicing & Payment Reminders**:
   - Send complete invoice summaries, bank details, balance due, and PDF links directly to party WhatsApp with a single click.

5. **👥 Customer Account Ledger & Statements (கணக்கு பேரேடு)**:
   - Real-time customer outstanding balances, total invoiced vs total received, and printable A4 Party Statements.

6. **💵 Partial Payment Tracking & Payment History**:
   - Record multiple installment payments (GPay/UPI, NEFT/Bank, Cash, Cheque) with receipts and automatic balance tracking.

7. **📊 GSTR-1 Ready Sales Register (Excel / CSV Export)**:
   - One-click export for CA / Tax auditor with taxable values, CGST (2.5%), SGST (2.5%), and invoice amounts.

8. **📈 Financial Intelligence & Analytics**:
   - Visual monthly revenue trends, top revenue customers, yarn count volume tracking (10s, 2/30s, 2/40s), and overdue aging.

---

## 📦 Quick Start Guide

### Step 1 — Install Dependencies (One time)
```bash
npm install
```

### Step 2 — Run in Desktop Mode (Electron)
```bash
npm start
```

### Step 3 — Run in Web Browser Mode
```bash
npm run web
```
Opens automatically at `http://localhost:3000`.

---

## 💾 Build Windows Desktop Installer (.exe)
```bash
npm run build
```
Generates the Windows installer in the `dist/` directory and creates the Desktop shortcut.

---

## ☁ Google Drive Setup
1. Open App → **Settings** → **Connect Drive →**
2. Upload your `client_secret.json`
3. Sign in to your Google Account and paste the authorization code.
4. All generated bills will automatically upload as PDFs to your Google Drive folder.
