import { API_BASE_URL } from '@/services/api';

const cdnUrl = (process.env.NEXT_PUBLIC_CDN_URL || '').trim().replace(/\/+$/, '');

/**
 * Session-level cache of image URLs that have already failed to load (404, blocked,
 * etc). Used to stop virtualized lists from re-requesting the same dead URL every
 * time a row scrolls back into view, which otherwise floods the console with
 * repeating "Failed to load resource" errors. Lives at module scope so it survives
 * component remounts and parent state resets.
 */
export const failedImageUrls = new Set();

// Safe accessor: `localStorage` is undefined during server-side rendering, so
// reading it directly throws a ReferenceError and blanks the page.
const getAccessToken = () => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem('accessToken');
    } catch {
        return null;
    }
};

export const markImageUrlFailed = (url) => {
    if (url) failedImageUrls.add(url);
};

export const isImageUrlFailed = (url) => Boolean(url) && failedImageUrls.has(url);

const extractGoogleDriveFileId = (value = '') => {
    if (typeof value !== 'string') return null;

    const patterns = [
        /\/file\/d\/([^/?#]+)/i,
        /\/document\/d\/([^/?#]+)/i,
        /[?&]id=([^&#]+)/i,
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (match?.[1]) {
            return decodeURIComponent(match[1]);
        }
    }

    return null;
};

const toGoogleDrivePreviewUrl = (value) => {
    const fileId = extractGoogleDriveFileId(value);
    if (!fileId) return value;
    // Prefer the newer lh3.googleusercontent.com endpoint which is less likely to be blocked by tracking prevention
    return `https://lh3.googleusercontent.com/d/${fileId}`;
};

const toGoogleDriveImagePreviewUrl = (value) => {
    const fileId = extractGoogleDriveFileId(value);
    if (!fileId) return value;
    return `https://lh3.googleusercontent.com/d/${fileId}=w1200`;
};

const toGoogleDriveEmbedUrl = (value) => {
    const fileId = extractGoogleDriveFileId(value);
    if (!fileId) return null;
    return `https://drive.google.com/file/d/${fileId}/preview`;
};

const getGoogleDriveImagePreviewCandidates = (value) => {
    const fileId = extractGoogleDriveFileId(value);
    if (!fileId) {
        return value ? [value] : [];
    }

    return Array.from(
        new Set([
            `https://lh3.googleusercontent.com/d/${fileId}=w1200`,
            `https://lh3.googleusercontent.com/d/${fileId}`,
            `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
            `https://drive.google.com/uc?id=${fileId}`,
        ]),
    );
};

/**
 * Generates a valid image URL for a given profile picture path.
 * Handles:
 * 1. Absolute URLs (starting with http)
 * 2. Relative paths with backslashes (Windows style)
 * 3. Relative paths missing the leading slash
 * 4. Filenames only (heuristic: assumes /uploads/trainer-documents/)
 * 
 * @param {string} path - The profile picture path from the database.
 * @returns {string} - The full usable URL.
 */
export const getProfilePictureUrl = (path) => {
    if (!path) return null;

    // 0. Handle Object input (from Mixed schema)
    if (typeof path === 'object') {
        if (path.file) path = path.file;
        else if (path.passbook) path = path.passbook;
        else if (path.front) path = path.front;
        else if (path.back) path = path.back;
        else if (path.profilePicture) path = path.profilePicture;
        else if (path.filePath) path = path.filePath;
        else if (path.driveViewLink) path = path.driveViewLink;
        else if (path.driveDownloadLink) path = path.driveDownloadLink;
        else if (path.url) path = path.url;
        else return null; // Could not extract path from object
    }

    // 1. If it's already a full URL, return as is
    if (typeof path !== 'string') return null;
    if (path.startsWith('blob:')) {
        return path;
    }
    if (path.startsWith('http')) {
        return toGoogleDrivePreviewUrl(path);
    }

    // 2. Normalize slashes (replace backslashes with forward slashes)
    let normalizedPath = path.replace(/\\/g, '/');

    // Public/static path for generated NDA PDFs
    if (normalizedPath.includes('uploads/NDA/')) {
        const filename = normalizedPath.split('/').pop();
        return `${cdnUrl}/api/uploads/NDA/${filename}`;
    }

    // 3. Remove leading slash to avoid double slashes when joining
    if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
    }

    // 4. HEURISTIC & SECURE ROUTE MAPPING
    // If path seems to be in uploads/trainer-documents (or just a filename), map to secure API
    let filename = normalizedPath;
    if (normalizedPath.includes('/')) {
        filename = normalizedPath.split('/').pop();
    }

    // Use the secure API endpoint
    // NOTE: This assumes all profile pictures/docs are in trainer-documents. Adjust if needed.
    const securePath = `/api/uploads/trainer-documents/${filename}`;
    
    // 5. Append Auth Token
    const token = getAccessToken();
    const authQuery = token ? `?token=${token}` : '';

    return `${cdnUrl}${securePath}${authQuery}`;
};

export const getImagePreviewUrl = (path) => {
    if (!path) return null;

    if (typeof path === 'object') {
        if (path.file) path = path.file;
        else if (path.passbook) path = path.passbook;
        else if (path.front) path = path.front;
        else if (path.back) path = path.back;
        else if (path.profilePicture) path = path.profilePicture;
        else if (path.filePath) path = path.filePath;
        else if (path.driveViewLink) path = path.driveViewLink;
        else if (path.driveDownloadLink) path = path.driveDownloadLink;
        else if (path.url) path = path.url;
        else return null;
    }

    if (typeof path !== 'string') return null;
    if (path.startsWith('blob:')) {
        return path;
    }
    if (path.startsWith('http')) {
        return getGoogleDriveImagePreviewCandidates(path)[0] || null;
    }

    return getProfilePictureUrl(path);
};

export const getDocumentViewUrl = (documentOrPath) => {
    if (!documentOrPath) return null;

    if (typeof documentOrPath === 'object') {
        return (
            getProfilePictureUrl(documentOrPath.driveViewLink) ||
            getProfilePictureUrl(documentOrPath.driveDownloadLink) ||
            getProfilePictureUrl(documentOrPath.filePath) ||
            getProfilePictureUrl(documentOrPath.url)
        );
    }

    return getProfilePictureUrl(documentOrPath);
};

export const getDocumentEmbedUrl = (documentOrPath) => {
    if (!documentOrPath) return null;

    if (typeof documentOrPath === 'object') {
        return (
            toGoogleDriveEmbedUrl(documentOrPath.driveViewLink) ||
            toGoogleDriveEmbedUrl(documentOrPath.driveDownloadLink) ||
            toGoogleDriveEmbedUrl(documentOrPath.filePath) ||
            toGoogleDriveEmbedUrl(documentOrPath.url) ||
            getDocumentViewUrl(documentOrPath)
        );
    }

    return toGoogleDriveEmbedUrl(documentOrPath) || getDocumentViewUrl(documentOrPath);
};

// Resolve a single stored value (Drive link, http URL, local path or bare
// filename) into one or more usable <img> src candidates. Drive links expand to
// the Google preview CDN variants; local paths/filenames are routed through the
// secure backend endpoint (which serves the file or 302-redirects to its Drive
// copy) instead of being left as a frontend-relative URL that always 404s.
const resolveSourceCandidates = (value) => {
    if (!value || typeof value !== 'string') return [];
    if (extractGoogleDriveFileId(value)) {
        return getGoogleDriveImagePreviewCandidates(value);
    }
    const resolved = getProfilePictureUrl(value);
    return resolved ? [resolved] : [];
};

export const getDocumentImagePreviewCandidates = (documentOrPath) => {
    if (!documentOrPath) return [];

    const candidates =
        typeof documentOrPath === 'object'
            ? [
                ...resolveSourceCandidates(documentOrPath.filePath),
                ...resolveSourceCandidates(documentOrPath.driveViewLink),
                ...resolveSourceCandidates(documentOrPath.driveDownloadLink),
                ...resolveSourceCandidates(documentOrPath.url),
            ]
            : documentOrPath.startsWith('http')
                ? getGoogleDriveImagePreviewCandidates(documentOrPath)
                : [getImagePreviewUrl(documentOrPath)];

    return Array.from(new Set(candidates.filter(Boolean)));
};

export const getDocumentImagePreviewUrl = (documentOrPath) => {
    return getDocumentImagePreviewCandidates(documentOrPath)[0] || null;
};

/**
 * Generates a secure URL for any uploaded file (attendance photos, signatures, evidence).
 * Handles:
 * 1. Absolute URLs (starting with http)
 * 2. Relative paths with backslashes (Windows style)
 * 3. Paths that may or may not have leading slashes
 * 4. Automatic /api/ prefix for secure routes
 * 
 * @param {string} path - The file path from the database.
 * @param {string} uploadType - The upload directory type: 'attendance', 'trainer-documents', etc.
 * @returns {string} - The full usable URL with authentication token.
 */
export const getSecureImageUrl = (path, uploadType = 'attendance') => {
    if (!path) return null;

    // Handle Object input
    if (typeof path === 'object') {
        if (path.file) path = path.file;
        else if (path.url) path = path.url;
        else if (path.filePath) path = path.filePath;
        else if (path.driveViewLink) path = path.driveViewLink;
        else if (path.driveDownloadLink) path = path.driveDownloadLink;
        else return null;
    }

    // If it's already a full URL, return as is
    if (typeof path !== 'string') return null;
    if (path.startsWith('blob:')) {
        return path;
    }
    if (path.startsWith('http')) {
        return toGoogleDrivePreviewUrl(path);
    }

    // Normalize slashes
    let normalizedPath = path.replace(/\\/g, '/');

    // SMART PATH PARSING
    // If path looks like "uploads/attendance/images/file.jpg", extract the structure
    if (normalizedPath.includes('uploads/attendance/')) {
        const parts = normalizedPath.split('/');
        const attendanceIndex = parts.indexOf('attendance');
        
        if (attendanceIndex >= 0 && parts.length > attendanceIndex + 2) {
            const subfolder = parts[attendanceIndex + 1]; // 'images', 'photos', 'signatures', etc.
            const filename = parts[parts.length - 1];
            
            // Construct: /api/uploads/attendance/{subfolder}/{filename}
            const securePath = `/api/uploads/attendance/${subfolder}/${filename}`;
            const token = getAccessToken();
            const authQuery = token ? `?token=${token}` : '';
            return `${cdnUrl}${securePath}${authQuery}`;
        }
    }

    // FALLBACK: Extract filename and use provided uploadType
    let filename = normalizedPath;
    if (normalizedPath.includes('/')) {
        filename = normalizedPath.split('/').pop();
    }

    // Handle uploadType with slashes (e.g., 'attendance/images')
    // Construct secure API path
    const securePath = `/api/uploads/${uploadType}/${filename}`;
    
    // Append Auth Token
    const token = getAccessToken();
    const authQuery = token ? `?token=${token}` : '';

    return `${cdnUrl}${securePath}${authQuery}`;
};
