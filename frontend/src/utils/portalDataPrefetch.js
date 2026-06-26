import { api } from "@/services/api";
import { AUTH_ROLES, normalizeAuthRole, normalizeAuthUser } from "@/utils/authRoles";

let portalDataSnapshot = null;
let portalDataPromise = null;
const PORTAL_DATA_STORAGE_KEY = "mbk_portal_data_bundle_v2";
const PORTAL_DATA_STORAGE_VERSION = 4;
const PORTAL_DATA_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache
const CORE_DASHBOARD_BUNDLE_ENDPOINT = "/dashboard-data?scope=minimal";

const clonePortalDataBundle = (bundle) => {
  if (bundle === null || typeof bundle !== "object") {
    return bundle;
  }

  // Optimize: Avoid expensive deep-cloning of the massive resource map if it's already an object.
  // We only clone the core bundle structure to prevent main-thread spikes.
  const { resources, ...core } = bundle;
  
  if (typeof structuredClone === "function") {
    const clonedCore = structuredClone(core);
    return { ...clonedCore, resources };
  }

  const clonedCore = JSON.parse(JSON.stringify(core));
  return { ...clonedCore, resources };
};

const getStoredAuthToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    localStorage.getItem("authToken")
    || localStorage.getItem("accessToken")
    || localStorage.getItem("token")
  );
};

const getCurrentSessionUser = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!getStoredAuthToken()) {
    return null;
  }

  try {
    const rawUser = localStorage.getItem("user") || localStorage.getItem("userInfo");
    if (!rawUser) return null;
    return normalizeAuthUser(JSON.parse(rawUser));
  } catch (error) {
    console.warn("Failed to read cached auth user for portal data:", error);
    return null;
  }
};

const buildPortalUserKey = (user) => {
  if (!user || typeof user !== "object") {
    return "";
  }

  const normalizedUser = normalizeAuthUser(user);

  return JSON.stringify({
    id: normalizedUser?.id || normalizedUser?._id || "",
    email: String(normalizedUser?.email || "").trim().toLowerCase(),
    role: normalizedUser?.role || "",
  });
};

const clearPersistedPortalDataBundle = () => {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(PORTAL_DATA_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear persisted portal data bundle:", error);
  }
};

const persistPortalDataBundle = (bundle) => {
  if (typeof window === "undefined" || !bundle) return;

  try {
    sessionStorage.setItem(
      PORTAL_DATA_STORAGE_KEY,
      JSON.stringify({
        version: PORTAL_DATA_STORAGE_VERSION,
        cachedAt: Date.now(),
        userKey: buildPortalUserKey(bundle.user),
        bundle,
      }),
    );
  } catch (error) {
    console.warn("Failed to persist portal data bundle:", error);
  }
};

const readPersistedPortalDataBundle = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cachedValue = sessionStorage.getItem(PORTAL_DATA_STORAGE_KEY);
    if (!cachedValue) {
      return null;
    }

    const payload = JSON.parse(cachedValue);
    const cachedAt = Number(payload?.cachedAt || 0);
    const isExpired =
      !cachedAt || Date.now() - cachedAt > PORTAL_DATA_CACHE_TTL_MS;

    if (
      payload?.version !== PORTAL_DATA_STORAGE_VERSION ||
      isExpired ||
      !payload?.bundle
    ) {
      clearPersistedPortalDataBundle();
      return null;
    }

    const currentUserKey = buildPortalUserKey(getCurrentSessionUser());
    if (!currentUserKey || !payload.userKey) {
      clearPersistedPortalDataBundle();
      return null;
    }

    if (currentUserKey !== payload.userKey) {
      clearPersistedPortalDataBundle();
      return null;
    }

    return clonePortalDataBundle(payload.bundle);
  } catch (error) {
    console.warn("Failed to read persisted portal data bundle:", error);
    clearPersistedPortalDataBundle();
    return null;
  }
};

const broadcastPortalDataReady = (bundle) => {
  if (typeof window === "undefined" || !bundle) return;

  window.dispatchEvent(
    new CustomEvent("mbk:portal-data-ready", {
      detail: bundle,
    }),
  );
};

const primePortalBundleCache = (bundle) => {
  if (!bundle) {
    return;
  }

  const payload = {
    success: true,
    data: clonePortalDataBundle(bundle),
  };

  // Prime both keys to keep compatibility with callers that still hit /dashboard-data.
  api.primeCache(CORE_DASHBOARD_BUNDLE_ENDPOINT, payload);
  api.primeCache("/dashboard-data", payload);
  primePortalResourceCache(bundle);
};

export const primePortalResourceCache = (bundle) => {
  const resources = bundle?.resources;
  if (!resources || typeof resources !== "object") {
    return;
  }

  const entries = Object.entries(resources);
  if (entries.length === 0) return;

  // Prime only FIRST 10 resources immediately (critical path)
  const critical = entries.slice(0, 10);
  critical.forEach(([endpoint, data]) => {
    if (!endpoint) return;
    api.primeCache(endpoint, data);
  });

  // Lazy load remaining resources after 2 seconds in background
  if (entries.length > 10) {
    setTimeout(() => {
      let index = 10;
      const CHUNK_SIZE = 20;

      const loadChunk = () => {
        const chunk = entries.slice(index, index + CHUNK_SIZE);
        chunk.forEach(([endpoint, data]) => {
          if (!endpoint) return;
          api.primeCache(endpoint, data);
        });
        index += CHUNK_SIZE;
        if (index < entries.length) {
          if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            window.requestIdleCallback(loadChunk);
          } else {
            setTimeout(loadChunk, 50);
          }
        }
      };

      loadChunk();
    }, 2000);
  }
};

export const clearPortalDataBundle = () => {
  portalDataSnapshot = null;
  portalDataPromise = null;
  clearPersistedPortalDataBundle();
};

const shouldSkipPortalDataBundle = (user) => {
  const role = normalizeAuthRole(user?.role, user?.email);
  return role === AUTH_ROLES.STUDENT || role === AUTH_ROLES.COMPANY;
};

const buildSkippedPortalDataBundle = (user) => ({
  role: normalizeAuthRole(user?.role, user?.email),
  user: normalizeAuthUser(user),
  dashboard: {},
  resources: {},
  fetchedAt: new Date().toISOString(),
});

export const warmPortalDataBundle = async (options = {}) => {
  const { force = false } = options;

  const sessionUser = getCurrentSessionUser();
  if (sessionUser && shouldSkipPortalDataBundle(sessionUser)) {
    const bundle = buildSkippedPortalDataBundle(sessionUser);
    portalDataSnapshot = bundle;
    persistPortalDataBundle(bundle);
    primePortalBundleCache(bundle);
    broadcastPortalDataReady(bundle);
    return bundle;
  }

  if (force) {
    clearPortalDataBundle();
  }

  if (!force && portalDataSnapshot) {
    primePortalBundleCache(portalDataSnapshot);
    return portalDataSnapshot;
  }

  if (!force) {
    const persistedBundle = readPersistedPortalDataBundle();
    if (persistedBundle) {
      portalDataSnapshot = persistedBundle;
      primePortalBundleCache(persistedBundle);
      broadcastPortalDataReady(persistedBundle);
      return persistedBundle;
    }
  }

  if (!force && portalDataPromise) {
    return portalDataPromise;
  }

  portalDataPromise = api
    .get(CORE_DASHBOARD_BUNDLE_ENDPOINT, force ? { skipCache: true } : undefined)
    .then((response) => {
      const bundle = response?.data || null;
      portalDataSnapshot = bundle;
      persistPortalDataBundle(bundle);
      primePortalBundleCache(bundle);
      broadcastPortalDataReady(bundle);
      return bundle;
    })
    .finally(() => {
      portalDataPromise = null;
    });

  return portalDataPromise;
};

export const getWarmPortalDataBundle = () => {
  if (portalDataSnapshot) {
    primePortalBundleCache(portalDataSnapshot);
    return portalDataSnapshot;
  }

  const persistedBundle = readPersistedPortalDataBundle();
  if (!persistedBundle) {
    return null;
  }

  portalDataSnapshot = persistedBundle;
  primePortalBundleCache(persistedBundle);
  return persistedBundle;
};
