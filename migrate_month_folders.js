const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DATA_PATH = path.join(process.env.APPDATA, 'sgc-billing', 'sgc-billing-data.json');
const VAULT_TOKEN_PATH = 'C:/Users/mukil/jarvis-core/storage/vault/google_drive_token.json';
const MAIN_BILLS_FOLDER_ID = '11KMBP0HHa2AFl30zjL8-a_-BQk9MgWM9';

function getMonthFolderName(dateString) {
  let d = new Date();
  if (dateString) {
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  const year = d.getFullYear();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthNum = String(d.getMonth() + 1).padStart(2, '0');
  const monthName = monthNames[d.getMonth()];
  return `${year}-${monthNum} (${monthName} ${year})`;
}

async function run() {
  console.log('[*] Testing Month Folder Allocation on Google Drive...');
  const tokenData = JSON.parse(fs.readFileSync(VAULT_TOKEN_PATH, 'utf8'));

  const oAuth2Client = new google.auth.OAuth2(
    tokenData.client_id,
    tokenData.client_secret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oAuth2Client.setCredentials({
    access_token: tokenData.token,
    refresh_token: tokenData.refresh_token,
    token_type: 'Bearer',
  });

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  // List existing folders in Mukil's Master Main Bills Folder
  const res = await drive.files.list({
    q: `'${MAIN_BILLS_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
    fields: 'files(id, name)',
  });
  console.log('[+] Current month folders in Drive:', res.data.files);

  const existingFolders = {};
  (res.data.files || []).forEach(f => {
    existingFolders[f.name] = f.id;
  });

  // Read bills
  const appData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const bills = appData['sgc-bills'] || [];
  console.log(`[+] Found ${bills.length} bills in local database.`);

  const monthFolderCache = { ...existingFolders };

  for (const b of bills) {
    const folderName = getMonthFolderName(b.date);
    let folderId = monthFolderCache[folderName];

    if (!folderId) {
      console.log(`[*] Creating month folder: '${folderName}' in Drive...`);
      const created = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [MAIN_BILLS_FOLDER_ID],
        },
        fields: 'id, name',
      });
      folderId = created.data.id;
      monthFolderCache[folderName] = folderId;
      console.log(`[+] Created folder '${folderName}' -> ID: ${folderId}`);
    }

    b.monthFolder = folderName;
    b.monthFolderId = folderId;

    // If bill has a driveFileId, move it into the month folder if not already there
    if (b.driveFileId) {
      try {
        const fileInfo = await drive.files.get({
          fileId: b.driveFileId,
          fields: 'id, name, parents',
        });
        const parents = fileInfo.data.parents || [];
        if (!parents.includes(folderId)) {
          console.log(`[*] Moving Bill #${b.billNo} (${fileInfo.data.name}) into '${folderName}'...`);
          await drive.files.update({
            fileId: b.driveFileId,
            addParents: folderId,
            removeParents: parents.includes(MAIN_BILLS_FOLDER_ID) ? MAIN_BILLS_FOLDER_ID : undefined,
            fields: 'id, parents',
          });
          console.log(`[+] Successfully moved Bill #${b.billNo} into '${folderName}'`);
        } else {
          console.log(`[=] Bill #${b.billNo} already in '${folderName}'`);
        }
      } catch (err) {
        console.warn(`[-] Could not move file for Bill #${b.billNo}:`, err.message);
      }
    }
  }

  // Save back updated bills with monthFolder and monthFolderId
  fs.writeFileSync(DATA_PATH, JSON.stringify(appData, null, 2), 'utf8');
  console.log('[+] Migration complete! Database and Drive successfully organized into Month Folders.');
}

run().catch(console.error);
