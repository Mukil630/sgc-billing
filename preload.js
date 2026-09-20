const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer (React app)
contextBridge.exposeInMainWorld('electronAPI', {
  // Data store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),

  // Bill save + Drive upload + Local PDF
  saveAndUploadBill: (payload) => ipcRenderer.invoke('save-and-upload-bill', payload),
  syncAllBills: (payload) => ipcRenderer.invoke('sync-all-bills', payload),
  saveLocalPdf: (payload) => ipcRenderer.invoke('save-local-pdf', payload),
  organizeDriveBills: () => ipcRenderer.invoke('organize-drive-bills'),
  exportFile: (payload) => ipcRenderer.invoke('export-file', payload),
  importFile: () => ipcRenderer.invoke('import-file'),

  // Gmail
  gmailAuthStart: () => ipcRenderer.invoke('gmail-auth-start'),
  gmailAuthExchange: (code) => ipcRenderer.invoke('gmail-auth-exchange', code),
  gmailAuthStatus: () => ipcRenderer.invoke('gmail-auth-status'),
  gmailAuthDisconnect: () => ipcRenderer.invoke('gmail-auth-disconnect'),
  gmailScan: (payload) => ipcRenderer.invoke('gmail-scan', payload),

  // Google OAuth
  googleAuthStart: (clientSecret) => ipcRenderer.invoke('google-auth-start', clientSecret),
  googleAuthExchange: (code) => ipcRenderer.invoke('google-auth-exchange', code),
  googleAuthStatus: () => ipcRenderer.invoke('google-auth-status'),
  googleAuthDisconnect: () => ipcRenderer.invoke('google-auth-disconnect'),

  // Utilities
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  printBill: (html) => ipcRenderer.invoke('print-bill', html),
});
