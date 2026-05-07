# SGC Billing — Sri Ganapathi Colours
<img width="1774" height="887" alt="image" src="https://github.com/user-attachments/assets/07d6ebf3-6530-462f-a97b-07c2a78eacd0" />

## Electron Desktop App — Setup Guide

---

## 📦 Prerequisites (oru thadavai mattum install pannunga)

1. **Node.js** download: https://nodejs.org (LTS version)
2. **Git** (optional)

---

## 🚀 Installation Steps

### Step 1 — Files extract pannunga
```
sgc-billing/ folder-a ungal system la vaikunga (e.g. C:\SGC-Billing\)
```

### Step 2 — Terminal open pannunga
```
Windows: Win+R → cmd → Enter
cd C:\SGC-Billing\sgc-billing
```

### Step 3 — Dependencies install pannunga
```bash
npm install
```
*(5-10 minutes aagum — puppeteer chromium download aagum)*

### Step 4 — App start pannunga
```bash
npm start
```

---

## ☁ Google Drive Connect Pannuvadu Eppadi?

### Oru thadavai mattum pannanum:

1. **App open aaguthu** → Settings tab → "Connect Drive →" click pannunga

2. **client_secret.json upload pannunga**
   - Ungalukku already file iruku: `client_secret_501766030810-....json`
   - Antha file-a select pannunga

3. **Browser la Google login page open aagum**
   - Ungal Google account la login pannunga
   - "Allow" click pannunga
   - **Code copy pannunga** (browser la kaatum)

4. **Code paste pannunga** → "Connect Drive" click

5. **Done!** — Ippo bill save pannumbodhu automatic-a PDF → Drive upload aagum ✅

---

## 💾 .exe Build Pannuvadu (optional)

```bash
npm run build
```
`dist/` folder la `.exe` installer kidaikkum.

---

## 📋 How It Works

```
Save Button Click
      ↓
Bill data collect (React UI)
      ↓
HTML string generate
      ↓
Puppeteer → HTML to PDF (background la, user-ku teriyaadu)
      ↓
Google Drive API → PDF upload (Bill_0001_CustomerName.pdf)
      ↓
Drive link save → UI la show
```

---

## 🔧 Folder Structure

```
sgc-billing/
├── main.js          ← Electron main (Puppeteer + Drive API here)
├── preload.js       ← Secure bridge
├── package.json
└── public/
    └── index.html   ← Full React app (UI)
```

---

## ❓ Common Issues

**"npm not found"** → Node.js install pannala — https://nodejs.org

**"Puppeteer download slow"** → Wait pannunga, chromium download aaguthu

**"Drive upload failed"** → Settings → Drive reconnect pannunga

**App open aagalai** → `npm start` run panni terminal-la error parunga
