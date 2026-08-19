# SGC Billing v5.0 — Sri Ganapathi Colours
<img width="1774" height="887" alt="SGC Billing Dashboard" src="https://github.com/user-attachments/assets/07d6ebf3-6530-462f-a97b-07c2a78eacd0" />

Enterprise Billing, GST Invoicing, Customer Ledger & Financial Management System tailored for Textile Dyeing & Bleaching Units.

---

## 🌟 New Features in v5.0

1. **💬 Instant WhatsApp Invoicing & Payment Reminders**:
   - Send complete invoice summaries, bank details, balance due, and PDF links directly to party WhatsApp with a single click.
2. **👥 Customer Account Ledger & Statements (கணக்கு பேரேடு)**:
   - Real-time customer outstanding balances, total invoiced vs total received, and printable A4 Party Statements.
3. **💵 Partial Payment Tracking & Payment History**:
   - Record multiple installment payments (GPay/UPI, NEFT/Bank, Cash, Cheque) with receipts and automatic balance tracking.
4. **📊 GSTR-1 Ready Sales Register (Excel / CSV Export)**:
   - One-click export for CA / Tax auditor with taxable values, CGST (2.5%), SGST (2.5%), and invoice amounts.
5. **✏️ Bill Edit & Instant Clone/Duplicate**:
   - Modify existing bills or duplicate recurring orders to new bills in seconds.
6. **📈 Financial Intelligence & Analytics**:
   - Visual monthly revenue trends, top revenue customers, yarn count volume tracking (10s, 17s, 20s, 30s), and overdue aging.
7. **💾 Dual PDF Engine (Cloud Drive + Offline Local Save)**:
   - Direct local PDF download without cloud delays, plus automated Google Drive sync.
8. **🛡️ 1-Click System Backup & Restore**:
   - Download complete database snapshots (`.json`) and restore seamlessly on any machine.

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
