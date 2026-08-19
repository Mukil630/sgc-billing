const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

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
    backgroundColor: '#0c0c14',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

// ── DATA STORE IPC ────────────────────────────────────────────────────────────
ipcMain.handle('store-get', async (_, key) => {
  return store.get(key, null);
});

ipcMain.handle('store-set', async (_, key, value) => {
  store.set(key, value);
  return true;
});

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

    // Get stored OAuth tokens
    const tokens = store.get('google-tokens', null);
    const clientSecret = store.get('google-client-secret', null);

    if (!tokens || !clientSecret) {
      return { success: false, error: 'Google Drive not authenticated. Please connect Drive in Settings.' };
    }

    const { google } = require('googleapis');
    const { installed } = clientSecret;
    const oAuth2Client = new google.auth.OAuth2(
      installed.client_id,
      installed.client_secret,
      installed.redirect_uris ? installed.redirect_uris[0] : 'urn:ietf:wg:oauth:2.0:oob'
    );
    oAuth2Client.setCredentials(tokens);

    // Auto-refresh token if expired
    oAuth2Client.on('tokens', (newTokens) => {
      const current = store.get('google-tokens', {});
      store.set('google-tokens', { ...current, ...newTokens });
    });

    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const FOLDER_ID = store.get('drive-folder-id', '11KMBP0HHa2AFl30zjL8-a_-BQk9MgWM9');

    const safeName = (billData.customer || 'Customer')
      .replace(/[^a-zA-Z0-9 ]/g, '_')
      .slice(0, 40)
      .trim();
    const fileName = `Bill_${String(billData.billNo).padStart(4, '0')}_${safeName}.pdf`;

    const { Readable } = require('stream');
    const pdfStream = Readable.from(pdfBuffer);

    const driveRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/pdf',
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: 'application/pdf',
        body: pdfStream,
      },
      fields: 'id, webViewLink, name',
    });

    const fileId = driveRes.data.id;
    const webViewLink = driveRes.data.webViewLink ||
      `https://drive.google.com/file/d/${fileId}/view`;

    return {
      success: true,
      driveUrl: webViewLink,
      fileId,
      fileName,
    };
  } catch (err) {
    console.error('save-and-upload-bill error:', err);
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

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Bill PDF to Computer',
      defaultPath: path.join(app.getPath('downloads'), defaultFileName),
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    const pdfBuffer = await generatePdfBuffer(htmlContent);
    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, filePath };
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

// ── GOOGLE OAUTH FLOW ─────────────────────────────────────────────────────────
ipcMain.handle('google-auth-start', async (_, clientSecretData) => {
  try {
    const { google } = require('googleapis');
    const { installed } = clientSecretData;

    const oAuth2Client = new google.auth.OAuth2(
      installed.client_id,
      installed.client_secret,
      'urn:ietf:wg:oauth:2.0:oob' // Desktop app flow
    );

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent',
    });

    // Store client secret for later use
    store.set('google-client-secret', clientSecretData);

    // Open auth URL in browser
    shell.openExternal(authUrl);

    return { success: true, authUrl };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
      'urn:ietf:wg:oauth:2.0:oob'
    );

    const { tokens } = await oAuth2Client.getToken(authCode.trim());
    store.set('google-tokens', tokens);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('google-auth-status', async () => {
  const tokens = store.get('google-tokens', null);
  const clientSecret = store.get('google-client-secret', null);
  return { connected: !!(tokens && clientSecret) };
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
