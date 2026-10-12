const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Prevent GPU crash on Windows
app.disableHardwareAcceleration();

const store = new Store({ name: 'sgc-billing-data' });

let mainWindow;

// ── CREATE WINDOW ─────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    title: 'SGC Billing — Sri Ganapathi Colours',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0b0f19',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  // Fallback if ready-to-show is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.maximize();
    }
  }, 1500);

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

// ── DATA STORE IPC ────────────────────────────────────────────────────────────
ipcMain.handle('store-get', async (_, key) => {
  if (key === 'drive-folder-id') return '11KMBP0HHa2AFl30zjL8-a_-BQk9MgWM9';
  return store.get(key, null);
});

ipcMain.handle('store-set', async (_, key, value) => {
  store.set(key, value);
  return true;
});

// ── GOOGLE DRIVE VAULT FOLDERS ───────────────────────────────────────────────────
// Mukil's Master Main Bills Drive Vault (Hardcoded Primary Target)
// Plus secondary backup vaults for redundancy.
const MAIN_BILLS_FOLDER_ID = '11KMBP0HHa2AFl30zjL8-a_-BQk9MgWM9';
const MAIN_BILLS_DRIVE_URL = 'https://drive.google.com/drive/folders/11KMBP0HHa2AFl30zjL8-a_-BQk9MgWM9?usp=drive_link';

const VAULT_FOLDERS = [
  '11KMBP0HHa2AFl30zjL8-a_-BQk9MgWM9', // Mukil's Master Main Bills Drive Vault (Primary)
  '155EqYOwPJ2Fc9QfqVSrZu5VnYzZgRcyZ', // Billing Backup Vault 1
  '1a9VJAP_Nypn_mjUEYCNvMpkGN5H9Kwf4', // Billing Backup Vault 2
];

// Always enforce Mukil's main drive folder ID in store
store.set('drive-folder-id', MAIN_BILLS_FOLDER_ID);

// Build an authenticated Google Drive client from stored OAuth credentials or Master Vault.
function getDriveClient() {
  const { google } = require('googleapis');

  let tokens = store.get('google-tokens', null);
  let clientSecret = store.get('google-client-secret', null);

  // Auto-fallback: Load directly from JARVIS Master Vault if missing or not configured
  const vaultTokenPath = path.join('C:', 'Users', 'mukil', 'jarvis-core', 'storage', 'vault', 'google_drive_token.json');
  if ((!tokens || !tokens.refresh_token) && fs.existsSync(vaultTokenPath)) {
    try {
      const v = JSON.parse(fs.readFileSync(vaultTokenPath, 'utf8'));
      tokens = {
        access_token: v.token || v.access_token,
        refresh_token: v.refresh_token,
        scope: Array.isArray(v.scopes) ? v.scopes.join(' ') : (v.scopes || v.scope || 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive'),
        token_type: 'Bearer',
        expiry_date: v.expiry ? new Date(v.expiry).getTime() : Date.now() + 3600000
      };
      store.set('google-tokens', tokens);
      if (!clientSecret && v.client_id && v.client_secret) {
        clientSecret = {
          installed: {
            client_id: v.client_id,
            client_secret: v.client_secret,
            redirect_uris: ['http://localhost', 'urn:ietf:wg:oauth:2.0:oob']
          }
        };
        store.set('google-client-secret', clientSecret);
      }
    } catch (e) {
      console.error('Error loading master vault token fallback:', e);
    }
  }

  if (!tokens || !clientSecret) return null;
  const { installed } = clientSecret;
  const oAuth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    installed.redirect_uris ? installed.redirect_uris[0] : 'http://localhost'
  );
  oAuth2Client.setCredentials(tokens);
  oAuth2Client.on('tokens', (newTokens) => {
    const updated = { ...store.get('google-tokens', {}), ...newTokens };
    store.set('google-tokens', updated);
    try {
      if (fs.existsSync(vaultTokenPath)) {
        const v = JSON.parse(fs.readFileSync(vaultTokenPath, 'utf8'));
        if (updated.access_token) v.token = updated.access_token;
        if (updated.refresh_token) v.refresh_token = updated.refresh_token;
        if (updated.expiry_date) v.expiry = new Date(updated.expiry_date).toISOString();
        fs.writeFileSync(vaultTokenPath, JSON.stringify(v, null, 2), 'utf8');
      }
    } catch (_) {}
  });
  return { google, drive: google.drive({ version: 'v3', auth: oAuth2Client }), oAuth2Client };
}

function getMonthFolderName(dateString) {
  let year, monthNum;
  if (dateString) {
    const s = String(dateString).trim();
    const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      monthNum = parseInt(isoMatch[2], 10);
    } else {
      const ddmmyyyyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
      if (ddmmyyyyMatch) {
        year = parseInt(ddmmyyyyMatch[3], 10);
        monthNum = parseInt(ddmmyyyyMatch[2], 10);
      } else {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
          monthNum = d.getMonth() + 1;
        }
      }
    }
  }
  if (!year || !monthNum || isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    const now = new Date();
    year = now.getFullYear();
    monthNum = now.getMonth() + 1;
  }
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const paddedMonth = String(monthNum).padStart(2, '0');
  const monthName = monthNames[monthNum - 1];
  return `${year}-${paddedMonth} (${monthName} ${year})`; // e.g. "2026-10 (October 2026)"
}

const monthFolderCache = {};

// Find or create month subfolder inside a parent vault folder
async function getOrCreateMonthFolder(drive, parentFolderId, monthFolderName) {
  const cacheKey = `${parentFolderId}_${monthFolderName}`;
  if (monthFolderCache[cacheKey]) {
    return monthFolderCache[cacheKey];
  }

  try {
    const q = `'${parentFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${monthFolderName}'`;
    const res = await drive.files.list({ q, fields: 'files(id, name)', pageSize: 5 });
    if (res.data.files && res.data.files.length > 0) {
      const folderId = res.data.files[0].id;
      monthFolderCache[cacheKey] = folderId;
      return folderId;
    }

    // Not found, create it
    const created = await drive.files.create({
      requestBody: {
        name: monthFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id, name',
    });
    const folderId = created.data.id;
    monthFolderCache[cacheKey] = folderId;
    return folderId;
  } catch (err) {
    console.warn(`Could not get/create month folder '${monthFolderName}' in '${parentFolderId}':`, err.message);
    return parentFolderId; // fallback to parent
  }
}

// Generate safe sanitized file name for a bill
function billFileName(billData) {
  const safeName = (billData.customer || 'Customer')
    .replace(/[^a-zA-Z0-9 ]/g, '_')
    .slice(0, 40)
    .trim();
  return `Bill_${String(billData.billNo || '').padStart(4, '0')}_${safeName}.pdf`;
}

// Find existing bill files on Drive for update-in-place
async function findExistingFiles(drive, folderId, billNo) {
  try {
    const padded = String(billNo).padStart(4, '0');
    // Crucial: Only search for PDF files and never match folder names (e.g., month folders)
    const q = `'${folderId}' in parents and trashed=false and mimeType='application/pdf' and (name contains 'Bill_${padded}' or name contains 'Bill_${billNo}_')`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, webViewLink, parents)',
      pageSize: 10,
    });
    return (res.data.files || []).filter(f => f.mimeType === 'application/pdf');
  } catch (err) {
    console.warn(`findExistingFiles error in folder ${folderId}:`, err.message);
    return [];
  }
}

// Upload (or update-in-place) a bill PDF across every vault folder, organized into month subfolders.
async function uploadBillToVaults(drive, billData, pdfBuffer) {
  const { Readable } = require('stream');
  const fileName = billFileName(billData);
  const monthFolderName = getMonthFolderName(billData.date);
  const results = [];
  const errors = [];

  for (const parentFolderId of VAULT_FOLDERS) {
    try {
      // Find or auto-create the monthly subfolder under this parent vault
      const targetFolderId = await getOrCreateMonthFolder(drive, parentFolderId, monthFolderName);

      let target = null;
      const recorded = billData && billData.vaultFiles && billData.vaultFiles[parentFolderId];
      if (recorded && recorded.fileId && recorded.fileId !== targetFolderId && recorded.fileId !== parentFolderId && (!recorded.webViewLink || !recorded.webViewLink.includes('/drive/folders/'))) {
        target = { id: recorded.fileId, webViewLink: recorded.webViewLink };
      } else {
        try {
          // Check target month folder first
          const existingInMonth = await findExistingFiles(drive, targetFolderId, billData.billNo);
          if (existingInMonth.length > 0) {
            target = existingInMonth[0];
          } else {
            // Check parent root folder (in case it was uploaded there previously)
            const existingInParent = await findExistingFiles(drive, parentFolderId, billData.billNo);
            if (existingInParent.length > 0) target = existingInParent[0];
          }
        } catch (searchErr) {
          console.warn(`Drive list failed for folder ${targetFolderId}, will create:`, searchErr.message);
        }
      }

      // Extra safeguard: Never treat a folder as the target bill file
      if (target && (target.id === targetFolderId || target.id === parentFolderId)) {
        target = null;
      }

      const media = { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) };
      let driveRes;
      let updated = false;
      if (target && target.id) {
        try {
          driveRes = await drive.files.update({
            fileId: target.id,
            addParents: targetFolderId !== parentFolderId ? targetFolderId : undefined,
            removeParents: target.parents && target.parents.includes(parentFolderId) && parentFolderId !== targetFolderId ? parentFolderId : undefined,
            media,
            fields: 'id, webViewLink, name, parents',
          });
        } catch (moveErr) {
          driveRes = await drive.files.update({
            fileId: target.id,
            media,
            fields: 'id, webViewLink, name',
          });
        }
        updated = true;
      } else {
        driveRes = await drive.files.create({
          requestBody: { name: fileName, mimeType: 'application/pdf', parents: [targetFolderId] },
          media,
          fields: 'id, webViewLink, name',
        });
      }

      const fileId = driveRes.data.id;
      const webViewLink = driveRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
      results.push({
        folderId: parentFolderId,
        targetFolderId,
        monthFolderName,
        fileId,
        webViewLink,
        updated
      });
    } catch (folderErr) {
      console.error(`Error syncing bill #${billData.billNo} to folder ${parentFolderId}:`, folderErr);
      errors.push(`Folder ${parentFolderId}: ${folderErr.message}`);
    }
  }

  return { results, errors, fileName, monthFolderName };
}

// ── HELPER: GENERATE PDF BUFFER ───────────────────────────────────────────────
async function generatePdfBuffer(htmlContent) {
  // 1. Try Native Electron printToPDF (Fast, ultra-reliable, zero puppeteer extra setup)
  try {
    const pdfWin = new BrowserWindow({
      width: 900,
      height: 1200,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    await new Promise((r) => setTimeout(r, 450));
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      margins: { top: 0.3, bottom: 0.3, left: 0.25, right: 0.25 },
      printBackground: true,
      pageSize: 'A4',
    });
    pdfWin.close();
    return pdfBuffer;
  } catch (nativeErr) {
    console.warn('Native PDF error, trying Puppeteer fallback:', nativeErr);
    // 2. Puppeteer fallback
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
    });
    await browser.close();
    return pdfBuffer;
  }
}

// ── SAVE & UPLOAD BILL (PDF → Google Drive) ───────────────────────────────────
ipcMain.handle('save-and-upload-bill', async (_, { billData, htmlContent }) => {
  try {
    const pdfBuffer = await generatePdfBuffer(htmlContent);
    const client = getDriveClient();
    if (!client) {
      return { success: false, error: 'Google Drive not authenticated. Please connect Drive in Settings.' };
    }

    const { results, errors, fileName } = await uploadBillToVaults(client.drive, billData, pdfBuffer);
    const primary = results.find(r => r.folderId === VAULT_FOLDERS[0]) || results[0];
    const vaultFiles = {};
    results.forEach(r => { vaultFiles[r.folderId] = { fileId: r.fileId, webViewLink: r.webViewLink }; });

    if (!primary && errors.length > 0) {
      console.error('All Drive uploads failed:', errors);
      const isAuthOrQuota = errors.some(e => /quota|invalid_grant|unauthorized|Service Accounts/i.test(e));
      const cleanMsg = isAuthOrQuota
        ? 'Google Drive connection expired. Please reconnect Drive in Settings.'
        : 'Google Drive upload pending (Check network or reconnect in Settings).';
      return { success: false, error: cleanMsg, rawErrors: errors };
    }

    return {
      success: true,
      driveUrl: primary ? primary.webViewLink : null,
      fileId: primary ? primary.fileId : null,
      monthFolderName: results[0] ? results[0].monthFolderName : getMonthFolderName(billData.date),
      monthFolderId: primary ? primary.targetFolderId : null,
      fileName,
      vaultFiles,
      results,
      errors,
    };
  } catch (err) {
    console.error('save-and-upload-bill error:', err);
    return { success: false, error: err.message };
  }
});

// ── BULK SYNC ALL LOCAL BILLS TO DRIVE (PDF + update-in-place) ───────────────────
ipcMain.handle('sync-all-bills', async (_, { billPayloads }) => {
  try {
    const client = getDriveClient();
    if (!client) {
      return { success: false, error: 'Google Drive not authenticated. Please connect Drive in Settings.' };
    }
    const { drive } = client;
    const summary = { total: billPayloads.length, synced: 0, updated: 0, failed: 0, results: [] };

    for (const { billData, htmlContent } of billPayloads) {
      try {
        const pdfBuffer = await generatePdfBuffer(htmlContent);
        const { results, errors, fileName, monthFolderName } = await uploadBillToVaults(drive, billData, pdfBuffer);
        const primary = results.find(r => r.folderId === VAULT_FOLDERS[0]) || results[0];
        const vaultFiles = {};
        results.forEach(r => { vaultFiles[r.folderId] = { fileId: r.fileId, webViewLink: r.webViewLink }; });
        const anyUpdated = results.some(r => r.updated);

        if (primary) {
          summary.synced++;
          if (anyUpdated) summary.updated++;
          summary.results.push({
            billNo: billData.billNo,
            success: true,
            fileName,
            monthFolderName,
            driveUrl: primary.webViewLink,
            fileId: primary.fileId,
            vaultFiles,
            updated: anyUpdated,
            errors: errors.length ? errors : undefined,
          });
        } else {
          summary.failed++;
          summary.results.push({ billNo: billData.billNo, success: false, errors });
        }
      } catch (e) {
        summary.failed++;
        summary.results.push({ billNo: billData.billNo, success: false, error: e.message });
      }
    }

    return { success: true, summary };
  } catch (err) {
    console.error('sync-all-bills error:', err);
    return { success: false, error: err.message };
  }
});

// ── ORGANIZE ALL BILLS INTO MONTH FOLDERS (DRIVE REORGANIZATION) ───────────────
ipcMain.handle('organize-drive-bills', async () => {
  try {
    const client = getDriveClient();
    if (!client) return { success: false, error: 'Google Drive not authenticated.' };
    const { drive } = client;
    const bills = store.get('sgc-bills', []);
    const report = { total: bills.length, moved: 0, alreadyInPlace: 0, errors: [] };

    for (const b of bills) {
      const folderName = getMonthFolderName(b.date);
      for (const parentId of VAULT_FOLDERS) {
        try {
          const targetFolderId = await getOrCreateMonthFolder(drive, parentId, folderName);
          const targetFiles = await findExistingFiles(drive, targetFolderId, b.billNo);
          if (targetFiles.length > 0) {
            report.alreadyInPlace++;
          } else {
            const parentFiles = await findExistingFiles(drive, parentId, b.billNo);
            if (parentFiles.length > 0) {
              const fileToMove = parentFiles[0];
              await drive.files.update({
                fileId: fileToMove.id,
                addParents: targetFolderId,
                removeParents: parentId,
                fields: 'id, parents',
              });
              report.moved++;
            }
          }
        } catch (e) {
          report.errors.push(`Bill #${b.billNo}: ${e.message}`);
        }
      }
    }
    return { success: true, report };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── ENSURE CURRENT MONTH FOLDER ON DRIVE ──────────────────────────────────────
ipcMain.handle('ensure-month-folder', async () => {
  try {
    const client = getDriveClient();
    if (!client) return { success: false, error: 'Google Drive not authenticated' };
    const now = new Date();
    const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    const monthFolderName = getMonthFolderName(localDateStr);
    const folderIds = {};
    for (const parentId of VAULT_FOLDERS) {
      const folderId = await getOrCreateMonthFolder(client.drive, parentId, monthFolderName);
      folderIds[parentId] = folderId;
    }
    return { success: true, monthFolderName, folderIds };
  } catch (err) {
    console.error('ensure-month-folder error:', err);
    return { success: false, error: err.message };
  }
});

// ── GENERATE MONTH-END FINANCIAL AUDIT REPORT ─────────────────────────────────
ipcMain.handle('generate-month-end-report', async (_, monthKey) => {
  try {
    const now = new Date();
    const targetMonth = monthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const bills = store.get('sgc-bills', []);
    const company = store.get('sgc-company-profile', {}) || {};
    const monthBills = bills.filter(b => b.date && b.date.startsWith(targetMonth));

    let totalSub = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalNet = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const customerMap = {};
    const countMap = {};

    monthBills.forEach(b => {
      const net = Number(b.netAmount || 0);
      const sub = Number(b.subtotal || (net / 1.05));
      const cgst = Number(b.cgst || (sub * 0.025));
      const sgst = Number(b.sgst || (sub * 0.025));

      totalSub += sub;
      totalCgst += cgst;
      totalSgst += sgst;
      totalNet += net;

      let p = 0;
      if (b.payments && Array.isArray(b.payments) && b.payments.length > 0) {
        p = b.payments.reduce((s, it) => s + Number(it.amount || 0), 0);
      } else if (b.status === 'paid') {
        p = net;
      }
      const bal = Math.max(0, net - p);
      totalPaid += p;
      totalPending += bal;

      const c = b.customer || 'Unknown';
      if (!customerMap[c]) customerMap[c] = { name: c, count: 0, totalNet: 0, totalPaid: 0, totalPending: 0, bills: [] };
      customerMap[c].count++;
      customerMap[c].totalNet += net;
      customerMap[c].totalPaid += p;
      customerMap[c].totalPending += bal;
      customerMap[c].bills.push({ billNo: b.billNo, date: b.date, net, status: b.status, driveUrl: b.driveUrl });

      (b.items || []).forEach(it => {
        const cnt = (it.count || 'Unknown').trim();
        if (!countMap[cnt]) countMap[cnt] = { count: cnt, kattu: 0, kazhi: 0, amount: 0 };
        countMap[cnt].kattu += Number(it.kattu || 0);
        countMap[cnt].kazhi += Number(it.kazhi || 0);
        countMap[cnt].amount += Number(it.amount || 0);
      });
    });

    const summary = {
      monthKey: targetMonth,
      monthName: getMonthFolderName(targetMonth + '-01'),
      totalBills: monthBills.length,
      grossSubtotal: totalSub,
      totalCgst,
      totalSgst,
      totalGst: totalCgst + totalSgst,
      netTotal: totalNet,
      totalPaid,
      totalPending,
      customers: Object.values(customerMap),
      counts: Object.values(countMap),
      bills: monthBills,
      syncedCount: monthBills.filter(b => b.driveUrl).length
    };

    return { success: true, summary };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── AUTONOMOUS BACKGROUND SYNC DAEMON ──────────────────────────────────────────
async function runAutonomousBackgroundSync() {
  try {
    const client = getDriveClient();
    if (!client || !client.oAuth2Client) return;

    try {
      const at = await client.oAuth2Client.getAccessToken();
      if (!at || !at.token) return;
    } catch (_) {
      return;
    }

    // 1. Ensure current month folder exists in all vaults
    const currentMonthFolder = getMonthFolderName(new Date().toISOString());
    for (const parentId of VAULT_FOLDERS) {
      await getOrCreateMonthFolder(client.drive, parentId, currentMonthFolder);
    }

    // 2. Scan and auto-sync any unsynced bills
    const bills = store.get('sgc-bills', []);
    const unsynced = bills.filter(b => !b.driveUrl);
    if (unsynced.length === 0) return;

    console.log(`[Auto-Daemon] Found ${unsynced.length} unsynced bill(s). Syncing to Drive in background...`);
    const { generateBillHTML } = require('./bill_html.js');
    const comp = store.get('sgc-company-profile', null);
    let anySynced = false;

    for (let i = 0; i < bills.length; i++) {
      const b = bills[i];
      if (b.driveUrl) continue;

      try {
        const html = generateBillHTML(b, comp);
        const pdfBuffer = await generatePdfBuffer(html);
        const { results } = await uploadBillToVaults(client.drive, b, pdfBuffer);
        const primary = results.find(r => r.folderId === VAULT_FOLDERS[0]) || results[0];
        if (primary && primary.webViewLink) {
          bills[i].driveUrl = primary.webViewLink;
          bills[i].driveFileId = primary.fileId;
          const vaultFiles = {};
          results.forEach(r => { vaultFiles[r.folderId] = { fileId: r.fileId, webViewLink: r.webViewLink }; });
          bills[i].vaultFiles = vaultFiles;
          bills[i].monthFolder = primary.monthFolderName;
          bills[i].monthFolderId = primary.targetFolderId;
          anySynced = true;
          console.log(`[Auto-Daemon] Bill #${b.billNo} successfully auto-synced! Link: ${primary.webViewLink}`);
        }
      } catch (uploadErr) {
        console.warn(`[Auto-Daemon] Upload failed for bill #${b.billNo}:`, uploadErr.message);
      }
    }

    if (anySynced) {
      store.set('sgc-bills', bills);
      const memPath = path.join('C:', 'Users', 'mukil', 'jarvis-core', 'storage', 'memory', 'sgc-billing-data.json');
      try {
        if (fs.existsSync(memPath)) {
          const mdata = JSON.parse(fs.readFileSync(memPath, 'utf8'));
          mdata['sgc-bills'] = bills;
          fs.writeFileSync(memPath, JSON.stringify(mdata, null, 2), 'utf8');
        }
      } catch (_) {}

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bills-updated', bills);
      }
    }
  } catch (daemonErr) {
    console.warn('[Auto-Daemon] Cycle error:', daemonErr.message);
  }
}

// Start autonomous daemon 10s after startup, then every 3 minutes
setTimeout(runAutonomousBackgroundSync, 10000);
setInterval(runAutonomousBackgroundSync, 180000);

// ── DELETE BILL FROM DRIVE VAULTS ─────────────────────────────────────────────
ipcMain.handle('delete-bill-from-drive', async (_, { billData }) => {
  try {
    const client = getDriveClient();
    if (!client) return { success: false, error: 'Google Drive not authenticated' };
    const { drive } = client;
    const fileIdsToDelete = new Set();

    if (billData.driveFileId) fileIdsToDelete.add(billData.driveFileId);
    if (billData.vaultFiles) {
      Object.values(billData.vaultFiles).forEach(v => {
        if (v && v.fileId) fileIdsToDelete.add(v.fileId);
      });
    }

    // Also search Drive by padded billNo in month folders across all vaults
    for (const parentFolderId of VAULT_FOLDERS) {
      try {
        const monthFolderName = getMonthFolderName(billData.date);
        const targetFolderId = await getOrCreateMonthFolder(drive, parentFolderId, monthFolderName);
        const existing = await findExistingFiles(drive, targetFolderId, billData.billNo);
        existing.forEach(f => fileIdsToDelete.add(f.id));
      } catch (searchErr) {
        console.warn('Drive search during delete failed:', searchErr.message);
      }
    }

    const deleted = [];
    const errors = [];
    for (const fileId of fileIdsToDelete) {
      try {
        const fileMeta = await drive.files.get({ fileId, fields: 'id, mimeType, name' });
        // Safeguard: NEVER delete a folder!
        if (fileMeta.data.mimeType === 'application/vnd.google-apps.folder') {
          console.warn(`Skipping deletion of folder ${fileId} (${fileMeta.data.name})`);
          continue;
        }
        await drive.files.delete({ fileId });
        deleted.push(fileId);
      } catch (delErr) {
        errors.push(`File ${fileId}: ${delErr.message}`);
      }
    }
    return { success: true, deleted, errors };
  } catch (err) {
    console.error('delete-bill-from-drive error:', err);
    return { success: false, error: err.message };
  }
});

// ── SAVE LOCAL PDF ────────────────────────────────────────────────────────────
ipcMain.handle('save-local-pdf', async (_, { billData, htmlContent }) => {
  try {
    const safeName = (billData.customer || 'Customer')
      .replace(/[^a-zA-Z0-9 ]/g, '_')
      .slice(0, 40)
      .trim();
    const defaultFileName = `Bill_${String(billData.billNo).padStart(4, '0')}_${safeName}.pdf`;
    const monthFolderName = getMonthFolderName(billData.date);

    // Default to Documents/SGC Bills/<monthFolderName>/
    const localDir = path.join(app.getPath('documents'), 'SGC Bills', monthFolderName);
    if (!fs.existsSync(localDir)) {
      try { fs.mkdirSync(localDir, { recursive: true }); } catch (_) {}
    }

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: `Save Bill PDF (${monthFolderName})`,
      defaultPath: path.join(localDir, defaultFileName),
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    const pdfBuffer = await generatePdfBuffer(htmlContent);
    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, filePath, monthFolderName };
  } catch (err) {
    console.error('save-local-pdf error:', err);
    return { success: false, error: err.message };
  }
});

// ── EXPORT FILE (CSV / JSON) ──────────────────────────────────────────────────
ipcMain.handle('export-file', async (_, { defaultName, content, extension }) => {
  try {
    const ext = extension || 'csv';
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export File',
      defaultPath: path.join(app.getPath('downloads'), defaultName),
      filters: [{ name: `${ext.toUpperCase()} Files`, extensions: [ext] }],
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IMPORT BACKUP FILE ────────────────────────────────────────────────────────
ipcMain.handle('import-file', async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select SGC Billing Backup JSON File',
      filters: [{ name: 'JSON Backup (*.json)', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (canceled || !filePaths || filePaths.length === 0) return { success: false, canceled: true };

    const raw = fs.readFileSync(filePaths[0], 'utf8');
    const data = JSON.parse(raw);
    return { success: true, data, fileName: path.basename(filePaths[0]) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── GMAIL OAUTH & SCAN ───────────────────────────────────────────────────────────
// Uses the same client credentials as Google Drive auth but requests Gmail scope.

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || store.get('gmail-client-id', '');
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || store.get('gmail-client-secret', '');
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';

function getGmailClient() {
  const { google } = require('googleapis');
  const tokens = store.get('gmail-tokens', null);
  if (!tokens) return null;
  const oAuth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );
  oAuth2Client.setCredentials(tokens);
  return { google, gmail: google.gmail({ version: 'v1', auth: oAuth2Client }) };
}

// Parse bill data from email subject/body text
function parseBillFromEmail(subject, snippet) {
  const text = `${subject} ${snippet}`.toLowerCase();
  const billNoMatch = text.match(/#?bill\s*(\d+)/i) || text.match(/bill\s*no[:\s]*(\d+)/i) || subject.match(/(\d{3,})/);
  const amountMatch = text.match(/rs\.?\s*([\d,]+\.?\d*)/i) || text.match(/₹\s*([\d,]+\.?\d*)/) || text.match(/amount\s*[:\s]*₹?\s*([\d,]+\.?\d*)/i);
  const customerMatch = text.match(/(?:party|m\/s|billed to|customer)\s*:?\s*(.*?)(?:\n|$)/i);

  if (!billNoMatch && !amountMatch) return null;

  return {
    billNo: billNoMatch ? parseInt(billNoMatch[1], 10) : null,
    amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null,
    customer: customerMatch ? customerMatch[1].replace(/[.,]$/, '').trim() : null,
    rawSubject: subject,
    rawSnippet: snippet.slice(0, 200),
  };
}

ipcMain.handle('gmail-auth-start', async () => {
  try {
    const { google } = require('googleapis');
    const oAuth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI
    );
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      prompt: 'consent',
    });
    shell.openExternal(authUrl);
    return { success: true, authUrl };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gmail-auth-exchange', async (_, authCode) => {
  try {
    const { google } = require('googleapis');
    const oAuth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI
    );
    const { tokens } = await oAuth2Client.getToken(authCode.trim());
    store.set('gmail-tokens', tokens);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gmail-auth-status', async () => {
  const tokens = store.get('gmail-tokens', null);
  return { connected: !!tokens };
});

ipcMain.handle('gmail-auth-disconnect', async () => {
  store.delete('gmail-tokens');
  return { success: true };
});

ipcMain.handle('gmail-scan', async (_, { label = 'SGC-Billing', maxResults = 50 }) => {
  try {
    const client = getGmailClient();
    if (!client) {
      return { success: false, error: 'Gmail not authenticated. Connect Gmail in Settings.' };
    }

    const { gmail } = client;

    // Get label ID
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const targetLabel = labelsRes.data.labels?.find(l => l.name.toLowerCase() === label.toLowerCase());

    if (!targetLabel) {
      return { success: false, error: `Gmail label "${label}" not found. Create this label in Gmail first.` };
    }

    const labelId = targetLabel.id;

    // List messages with the label
    const msgRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [labelId],
      maxResults,
    });

    const messages = msgRes.data.messages || [];

    if (messages.length === 0) {
      return { success: true, count: 0, bills: [], message: `No emails found with label "${label}".` };
    }

    // Parse each message
    const parsedBills = [];
    for (const msgRef of messages) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: msgRef.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date'],
      });

      const headers = msg.data.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('Subject') || '(no subject)';
      const from = getHeader('From') || '';
      const date = getHeader('Date') || '';

      // Get snippet from message
      const snippet = msg.data.snippet || '';

      const parsed = parseBillFromEmail(subject, snippet);
      if (parsed) {
        parsedBills.push({ ...parsed, from, date, messageId: msgRef.id });
      }
    }

    // Store parsed bills for UI
    store.set('gmail-scanned-bills', parsedBills);

    return {
      success: true,
      count: parsedBills.length,
      bills: parsedBills,
      message: `Found ${parsedBills.length} bill(s) from ${messages.length} email(s).`,
    };
  } catch (err) {
    console.error('gmail-scan error:', err);
    return { success: false, error: err.message };
  }
});

// ── GOOGLE DRIVE OAUTH (Modern Loopback Flow) ──────────────────────────────────
let authHttpServer = null;

ipcMain.handle('google-auth-start', async (_, clientSecretData) => {
  return new Promise((resolve) => {
    try {
      const http = require('http');
      const { google } = require('googleapis');

      if (!clientSecretData || !clientSecretData.installed) {
        clientSecretData = store.get('google-client-secret', null);
      }
      if (!clientSecretData || !clientSecretData.installed) {
        const dlPath = path.join('C:', 'Users', 'mukil', 'Downloads', 'client_secret_501766030810-m0bn27lv0ksg4mhgn15lapajebrdr9ic.apps.googleusercontent.com.json');
        if (fs.existsSync(dlPath)) {
          try { clientSecretData = JSON.parse(fs.readFileSync(dlPath, 'utf8')); } catch (_) {}
        }
      }

      if (!clientSecretData || !clientSecretData.installed) {
        return resolve({ success: false, error: 'client_secret.json not found! Please provide client secret.' });
      }

      const { installed } = clientSecretData;
      store.set('google-client-secret', clientSecretData);

      if (authHttpServer) {
        try { authHttpServer.close(); } catch (_) {}
        authHttpServer = null;
      }

      let port = 0;
      authHttpServer = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url, 'http://localhost');
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"><title>SGC Billing — Drive Connected</title></head>
              <body style="background:#0b0f19;color:#e2e8f0;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <div style="background:#151c2e;border:1px solid #34a853;padding:40px;border-radius:12px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.5);max-width:480px;">
                  <div style="font-size:48px;margin-bottom:12px;">✅</div>
                  <h2 style="color:#34a853;margin-top:0;">Google Drive Connected!</h2>
                  <p style="font-size:14px;color:#94a3b8;line-height:1.5;">Mukil's SGC Billing is now securely connected to Google Drive.<br/>Bills will automatically upload to your Master Vault (<code>11KMBP0HHa2AFl30zjL8-a_-BQk9MgWM9</code>).</p>
                  <p style="font-size:12px;color:#64748b;margin-top:20px;">You can safely close this browser window and return to SGC Billing.</p>
                </div>
              </body>
              </html>
            `);

            try { authHttpServer.close(); } catch (_) {}
            authHttpServer = null;

            const redirectUri = `http://localhost:${port}`;
            const oAuth2Client = new google.auth.OAuth2(
              installed.client_id,
              installed.client_secret,
              redirectUri
            );

            const { tokens } = await oAuth2Client.getToken(code);
            store.set('google-tokens', tokens);

            const vaultTokenPath = path.join('C:', 'Users', 'mukil', 'jarvis-core', 'storage', 'vault', 'google_drive_token.json');
            try {
              fs.writeFileSync(vaultTokenPath, JSON.stringify({
                token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_uri: "https://oauth2.googleapis.com/token",
                client_id: installed.client_id,
                client_secret: installed.client_secret,
                scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"],
                expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3600000).toISOString()
              }, null, 2), 'utf8');
            } catch (_) {}

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('drive-auth-success');
            }
          } else if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<html><body style="background:#0b0f19;color:red;padding:40px;font-family:sans-serif;"><h3>Auth Cancelled: ${error}</h3></body></html>`);
            try { authHttpServer.close(); } catch (_) {}
            authHttpServer = null;
          }
        } catch (e) {
          console.error('OAuth callback error:', e);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<html><body>Error: ${e.message}</body></html>`);
          try { authHttpServer.close(); } catch (_) {}
          authHttpServer = null;
        }
      });

      authHttpServer.listen(0, () => {
        port = authHttpServer.address().port;
        const redirectUri = `http://localhost:${port}`;
        const oAuth2Client = new google.auth.OAuth2(
          installed.client_id,
          installed.client_secret,
          redirectUri
        );

        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive'
          ],
          prompt: 'consent',
        });

        shell.openExternal(authUrl);
        resolve({ success: true, authUrl, port });
      });

      setTimeout(() => {
        if (authHttpServer) {
          try { authHttpServer.close(); } catch (_) {}
          authHttpServer = null;
        }
      }, 180000);
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('google-auth-exchange', async (_, authCode) => {
  try {
    const { google } = require('googleapis');
    const clientSecretData = store.get('google-client-secret');
    if (!clientSecretData || !clientSecretData.installed) {
      return { success: false, error: 'Client secret not found. Please upload client_secret.json again.' };
    }
    const { installed } = clientSecretData;

    const oAuth2Client = new google.auth.OAuth2(
      installed.client_id,
      installed.client_secret,
      'http://localhost'
    );

    const { tokens } = await oAuth2Client.getToken(authCode.trim());
    store.set('google-tokens', tokens);

    const vaultTokenPath = path.join('C:', 'Users', 'mukil', 'jarvis-core', 'storage', 'vault', 'google_drive_token.json');
    try {
      fs.writeFileSync(vaultTokenPath, JSON.stringify({
        token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_uri: "https://oauth2.googleapis.com/token",
        client_id: installed.client_id,
        client_secret: installed.client_secret,
        scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"],
        expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3600000).toISOString()
      }, null, 2), 'utf8');
    } catch (_) {}

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('google-auth-status', async () => {
  const client = getDriveClient();
  if (!client || !client.oAuth2Client) return { connected: false };
  try {
    const at = await client.oAuth2Client.getAccessToken();
    if (at && at.token) {
      return { connected: true };
    }
    return { connected: false, error: 'Token missing or expired' };
  } catch (err) {
    console.warn('Google Drive token validation check failed:', err.message);
    return { connected: false, error: err.message };
  }
});

ipcMain.handle('google-auth-disconnect', async () => {
  store.delete('google-tokens');
  return { success: true };
});

// ── OPEN EXTERNAL LINK ────────────────────────────────────────────────────────
ipcMain.handle('open-external', async (_, url) => {
  shell.openExternal(url);
  return true;
});

// ── PRINT BILL ────────────────────────────────────────────────────────────────
ipcMain.handle('print-bill', async (_, htmlContent) => {
  const printWin = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    title: 'Print Bill — Sri Ganapathi Colours',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  printWin.webContents.once('did-finish-load', () => {
    printWin.webContents.print({ silent: false, printBackground: true });
  });
  return true;
});
