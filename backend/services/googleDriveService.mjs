import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Authentication method: 'oauth2' or 'service_account'
const AUTH_METHOD = process.env.GOOGLE_DRIVE_AUTH_METHOD || process.env.GOOGLE_DRIVE_AUTH_MODE || 'oauth2';

// OAuth 2.0 Configuration
const OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const OAUTH_REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_GMAIL_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
const OAUTH_REDIRECT_URL = process.env.GOOGLE_OAUTH_REDIRECT_URL || process.env.GOOGLE_DRIVE_REDIRECT_URL || 'http://localhost:5005/auth/google/callback';

// Parent folder configuration - NM Trainers folder ID
const PARENT_FOLDER_ID = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '1Sy_OM3laf4VJBmsfamvIAHQMV7hYjPDl';

// Shared Drive configuration (optional - for future use)
const USE_SHARED_DRIVE = process.env.GOOGLE_DRIVE_USE_SHARED_DRIVE === 'true';
const SHARED_DRIVE_ID = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID;

const AUTO_SYNC_ENABLED = process.env.GOOGLE_DRIVE_AUTO_SYNC === 'true';
const SYNC_INTERVAL = parseInt(process.env.GOOGLE_DRIVE_SYNC_INTERVAL || '5000', 10);

// Constant for NM Trainers folder name
const NM_TRAINERS_FOLDER_NAME = 'NM Trainers';

// Google Drive authentication setup
let driveClient = null;
let isInitialized = false;
let nmTrainersFolderId = null; // Cache the NM Trainers folder ID

const initializeGoogleDrive = async () => {
  try {
    if (isInitialized && driveClient) return driveClient;

    // Resolve credentials lazily at call time. The module may be imported before
    // dotenv has injected env vars (server.mjs configures dotenv inside its body,
    // which runs after ESM imports are evaluated), so reading process.env here —
    // instead of via top-level consts — guarantees the values are present.
    const authMethod = process.env.GOOGLE_DRIVE_AUTH_METHOD || process.env.GOOGLE_DRIVE_AUTH_MODE || AUTH_METHOD;
    const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || OAUTH_CLIENT_SECRET;
    const oauthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_GMAIL_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN || OAUTH_REFRESH_TOKEN;
    const oauthRedirectUrl = process.env.GOOGLE_OAUTH_REDIRECT_URL || process.env.GOOGLE_DRIVE_REDIRECT_URL || OAUTH_REDIRECT_URL;

    let auth;

    if (authMethod === 'oauth2') {
      // OAuth 2.0 Authentication (uses user's personal Google account)
      if (!oauthClientId || !oauthClientSecret || !oauthRefreshToken) {
        throw new Error('OAuth credentials not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN in .env');
      }

      auth = new google.auth.OAuth2(
        oauthClientId,
        oauthClientSecret,
        oauthRedirectUrl
      );

      auth.setCredentials({
        refresh_token: oauthRefreshToken,
      });
    } else {
      // Service Account Authentication (legacy - no storage quota for personal folders)
      const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || 
        path.join(__dirname, '..', 'config', 'google-service-account.json');
      
      const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON 
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

      auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.file',
        ],
      });
    }

    driveClient = google.drive({
      version: 'v3',
      auth: auth,
    });

    isInitialized = true;
    
    // Log setup info (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Google Drive initialized successfully');
      console.log(`🔐 Authentication: ${AUTH_METHOD.toUpperCase()}`);
      console.log('📁 Parent Folder ID:', PARENT_FOLDER_ID);
      console.log('✅ Ready to save trainer data to: NM Trainers folder');
    }
    return driveClient;
  } catch (error) {
    console.error('Google Drive initialization failed:', error.message);
    throw new Error(`Google Drive Auth Error: ${error.message}`);
  }
};

/**
 * Find or create the NM Trainers root folder
 * This folder is created once or uses existing one
 */
const ensureNMTrainersFolderExists = async () => {
  try {
    // Return cached ID if already found
    if (nmTrainersFolderId) {
      return nmTrainersFolderId;
    }

    if (!driveClient) await initializeGoogleDrive();

    // For regular folders that are shared with the service account,
    // we use the PARENT_FOLDER_ID directly (NM Trainers folder)
    nmTrainersFolderId = PARENT_FOLDER_ID;
    
    console.log('✅ Using NM Trainers parent folder:', nmTrainersFolderId);
    return nmTrainersFolderId;
  } catch (error) {
    console.error('Error ensuring NM Trainers folder exists:', error.message);
    throw error;
  }
};

// Create folder structure for new trainer (idempotent: reuses existing folders)
export const createTrainerFolderStructure = async (trainerName) => {
  try {
    if (!driveClient) await initializeGoogleDrive();

    // Reuse or create the main trainer folder under the NM Trainers parent folder
    const trainerFolder = await findOrCreateFolder(trainerName, PARENT_FOLDER_ID);

    // Reuse or create the documents subfolder
    const docsFolder = await findOrCreateFolder('documents', trainerFolder.id);

    console.log(`✅ Trainer folder ready: ${trainerName}`);

    return {
      trainerId: trainerFolder.id,
      trainerName: trainerFolder.name,
      docsId: docsFolder.id,
      webViewLink: trainerFolder.webViewLink,
    };
  } catch (error) {
    console.error(`Error creating trainer folder structure for ${trainerName}:`, error.message);
    throw {
      type: 'FOLDER_CREATION_FAILED',
      message: error.message,
    };
  }
};

// Create college-specific folder structure (idempotent: never duplicates folders)
// Per spec, each Day folder contains exactly two subfolders: "Attendance" and "Geo Tag".
export const createCollegeFolderStructure = async (trainerFolderId, collegeName, totalDays = 12) => {
  try {
    if (!driveClient) await initializeGoogleDrive();

    // Reuse or create the college folder under the trainer folder
    const collegeFolder = await findOrCreateFolder(collegeName, trainerFolderId);

    const safeDays = Math.max(1, Number(totalDays) || 12);
    console.log(`📁 Ensuring ${safeDays} day folders for college: ${collegeName}`);

    const dayFolders = {};
    for (let day = 1; day <= safeDays; day++) {
      const dayFolder = await findOrCreateFolder(`Day ${day}`, collegeFolder.id);

      // Only Attendance and Geo Tag are created automatically, per requirement.
      const attendanceFolder = await findOrCreateFolder('Attendance', dayFolder.id);
      const geoTagFolder = await findOrCreateFolder('Geo Tag', dayFolder.id);

      dayFolders[day] = {
        dayFolderId: dayFolder.id,
        attendance: attendanceFolder.id,
        geo_tag: geoTagFolder.id,
        excel_sheet: null,
      };

      if (day % 4 === 0) {
        console.log(`  ✅ Ensured days 1-${day} with Attendance and Geo Tag`);
      }
    }

    console.log(`✅ Completed college folder structure for ${collegeName}`);

    return {
      collegeFolderId: collegeFolder.id,
      collegeLink: collegeFolder.webViewLink || null,
      dayFolders,
    };
  } catch (error) {
    console.error(`Error creating college folder structure for ${collegeName}:`, error.message);
    throw {
      type: 'FOLDER_CREATION_FAILED',
      message: error.message,
    };
  }
};

// Find an existing (non-trashed) folder by name under a parent, or create it.
// This guarantees idempotency so re-running assignment/upload never duplicates folders.
export const findOrCreateFolder = async (folderName, parentFolderId) => {
  if (!driveClient) await initializeGoogleDrive();

  const safeName = String(folderName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  try {
    const response = await driveClient.files.list({
      q: `name = '${safeName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      spaces: 'drive',
      fields: 'files(id, name, webViewLink)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const existing = response.data.files && response.data.files[0];
    if (existing && existing.id) {
      return existing;
    }
  } catch (error) {
    console.warn(`[GOOGLE-DRIVE] Folder lookup failed for "${folderName}", will create: ${error.message}`);
  }

  return createFolder(folderName, parentFolderId);
};

// Generic folder creation helper
const createFolder = async (folderName, parentFolderId) => {
  try {
    const request = {
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
      supportsTeamDrives: true,
    };

    const response = await driveClient.files.create(request);

    return response.data;
  } catch (error) {
    if (error.message.includes('PERMISSION_DENIED')) {
      throw {
        type: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to create folder in Google Drive',
      };
    }
    throw error;
  }
};

// Upload file to specific folder with retry logic
export const uploadFileToGoogleDrive = async (
  filePath,
  fileName,
  targetFolderId,
  maxRetries = 3
) => {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!driveClient) await initializeGoogleDrive();

      const fileStats = fs.statSync(filePath);
      const mimeType = getMimeType(fileName);

      const requestBody = {
        name: fileName,
        mimeType: mimeType,
        parents: [targetFolderId],
        description: `Uploaded by MBK Trainer Management System - ${new Date().toISOString()}`,
      };

      const response = await driveClient.files.create(
        USE_SHARED_DRIVE && SHARED_DRIVE_ID
          ? {
              requestBody,
              media: {
                mimeType: mimeType,
                body: fs.createReadStream(filePath),
              },
              fields: 'id, name, size, webViewLink, createdTime',
              supportsAllDrives: true,
              supportsTeamDrives: true,
            }
          : {
              requestBody,
              media: {
                mimeType: mimeType,
                body: fs.createReadStream(filePath),
              },
              fields: 'id, name, size, webViewLink, createdTime',
              supportsAllDrives: true,
              supportsTeamDrives: true,
            }
      );

      return {
        driveFileId: response.data.id,
        fileName: response.data.name,
        fileSize: fileStats.size,
        webViewLink: response.data.webViewLink,
        uploadedAt: response.data.createdTime,
      };
    } catch (error) {
      lastError = error;
      
      // Handle specific errors
      if (error.message && error.message.includes('Service Accounts do not have storage quota')) {
        throw {
          type: 'QUOTA_ERROR',
          message: 'Service account storage limit reached. Consider using a Shared Drive for better storage management.',
          solution: 'Shared Drives don\'t have storage quota limits for service accounts.',
        };
      }

      if (error.message && error.message.includes('PERMISSION_DENIED')) {
        throw {
          type: 'PERMISSION_ERROR',
          message: 'Permission denied. Make sure the service account has access to the folder.',
        };
      }

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        console.log(`Retry attempt ${attempt} of ${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // All retries failed
  throw {
    type: 'FILE_UPLOAD_FAILED',
    message: lastError?.message || 'Unknown upload error',
    attempts: maxRetries,
  };
};

// Helper to determine MIME type
const getMimeType = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

// Get folder information
export const getFolderInfo = async (folderId) => {
  try {
    if (!driveClient) await initializeGoogleDrive();

    const request = {
      fileId: folderId,
      fields: 'id, name, webViewLink, parents',
      supportsAllDrives: true,
      supportsTeamDrives: true,
    };

    const response = await driveClient.files.get(request);

    return response.data;
  } catch (error) {
    throw {
      type: 'FOLDER_INFO_ERROR',
      message: error.message,
    };
  }
};

// Verify folder structure
export const verifyFolderStructure = async (collegeFolderId) => {
  try {
    if (!driveClient) await initializeGoogleDrive();

    const response = await driveClient.files.list({
      q: `'${collegeFolderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      supportsTeamDrives: true,
    });

    return response.data.files || [];
  } catch (error) {
    throw {
      type: 'VERIFY_ERROR',
      message: error.message,
    };
  }
};

// OAuth 2.0 Helper: Generate authorization URL
export const getOAuthAuthorizationUrl = () => {
  if (!OAUTH_CLIENT_ID) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    OAUTH_REDIRECT_URL
  );

  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Force consent screen to ensure refresh token
  });
};

// OAuth 2.0 Helper: Get refresh token from authorization code
export const getOAuthRefreshToken = async (authCode) => {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    throw new Error('OAuth credentials not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    OAUTH_REDIRECT_URL
  );

  const { tokens } = await oauth2Client.getToken(authCode);
  return tokens.refresh_token;
};

// Initialize Google Drive on module import
export const initGoogleDrive = initializeGoogleDrive;

export default {
  initializeGoogleDrive,
  createTrainerFolderStructure,
  createCollegeFolderStructure,
  findOrCreateFolder,
  uploadFileToGoogleDrive,
  getFolderInfo,
  verifyFolderStructure,
  getOAuthAuthorizationUrl,
  getOAuthRefreshToken,
};
