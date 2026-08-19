const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer (React app)
contextBridge.exposeInMainWorld('electronAPI', {
  // Data store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),

  // Bill save + Drive upload + Local PDF
  saveAndUploadBill: (payload) => ipcRenderer.invoke('save-and-upload-bill', payload),
  saveLocalPdf: (payload) => ipcRenderer.invoke('save-local-pdf', payload),
  exportFile: (payload) => ipcRenderer.invoke('export-file', payload),
  importFile: () => ipcRenderer.invoke('import-file'),

  // Google OAuth
  googleAuthStart: (clientSecret) => ipcRenderer.invoke('google-auth-start', clientSecret),
  googleAuthExchange: (code) => ipcRenderer.invoke('google-auth-exchange', code),
  googleAuthStatus: () => ipcRenderer.invoke('google-auth-status'),
  googleAuthDisconnect: () => ipcRenderer.invoke('google-auth-disconnect'),

  // Utilities
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  printBill: (html) => ipcRenderer.invoke('print-bill', html),
});
