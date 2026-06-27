/**
 * Centralized API configuration for MBK Carrierz Portal.
 * All frontend HTTP clients should import from here — never hardcode ports.
 */

const DEFAULT_DEV_API_ORIGIN = 'http://localhost:5005';
export const PRODUCTION_API_ORIGIN = 'https://mbk-project.onrender.com';

const rawApiUrl = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_ORIGIN ||
  ''
).trim();

/** True when the app is served from the Hostinger production domain. */
export const isProductionFrontendHost = () => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === 'mbktechnologies.info' ||
    hostname === 'www.mbktechnologies.info' ||
    hostname.endsWith('.mbktechnologies.info')
  );
};

/** Backend origin without trailing slash or /api suffix (e.g. http://localhost:5005) */
export const getApiOrigin = () => {
  if (rawApiUrl) {
    return rawApiUrl.replace(/\/+$/, '').replace(/\/api\/?$/i, '');
  }
  if (isProductionFrontendHost()) {
    return PRODUCTION_API_ORIGIN;
  }
  return DEFAULT_DEV_API_ORIGIN;
};

/** REST API base including /api prefix */
export const getApiBaseUrl = () => `${getApiOrigin()}/api`;

/** Simple-auth namespace base */
export const getSimpleAuthBaseUrl = () => `${getApiOrigin()}/api/simple-auth`;

/** Socket.IO server origin (same host as API, no /api path) */
export const getSocketOrigin = () => {
  const explicit = String(process.env.NEXT_PUBLIC_SOCKET_URL || '').trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  return getApiOrigin();
};

/** Local dev ports to try when the configured backend port is unreachable */
export const LOCAL_API_PORT_FALLBACKS = [5006, 5005, 5003, 5004, 5007, 5008, 5001, 5000];

let discoveredOrigin = null;

const probeHealth = async (origin) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`${origin}/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.success === true || data?.message === 'Backend Running';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * In development, probe /health on known local ports when the configured
 * backend port is busy and nodemon auto-increments (5003 → 5005 → 5008).
 */
export const discoverApiOrigin = async () => {
  if (discoveredOrigin) return discoveredOrigin;
  if (process.env.NODE_ENV === 'production') return getApiOrigin();

  const hasExplicitOrigin = Boolean(rawApiUrl);
  if (!hasExplicitOrigin) {
    return getApiOrigin();
  }

  const configured = getApiOrigin();
  if (await probeHealth(configured)) {
    discoveredOrigin = configured;
    return discoveredOrigin;
  }

  for (const port of LOCAL_API_PORT_FALLBACKS) {
    const candidate = `http://localhost:${port}`;
    if (candidate === configured) continue;
    if (await probeHealth(candidate)) {
      discoveredOrigin = candidate;
      if (typeof window !== 'undefined') {
        console.info(`[API] Backend discovered at ${candidate}`);
      }
      return discoveredOrigin;
    }
  }

  return configured;
};

export const resetDiscoveredApiOrigin = () => {
  discoveredOrigin = null;
};

export const getResolvedApiOrigin = () => discoveredOrigin || getApiOrigin();

export default {
  getApiOrigin,
  getApiBaseUrl,
  getSimpleAuthBaseUrl,
  getSocketOrigin,
  discoverApiOrigin,
  getResolvedApiOrigin,
  resetDiscoveredApiOrigin,
  LOCAL_API_PORT_FALLBACKS,
};
