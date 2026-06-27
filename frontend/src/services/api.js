import axios from "axios";
import {
  discoverApiOrigin,
  getApiOrigin,
  getApiBaseUrl,
  isProductionFrontendHost,
  LOCAL_API_PORT_FALLBACKS,
  resetDiscoveredApiOrigin,
} from "@/config/apiConfig";
import { isValidAuthToken } from "@/utils/authJwt";
import {
  AUTH_ERROR_MESSAGES,
  resolveAuthErrorMessage,
} from "@/lib/authErrorHandler";

const cleanBaseUrl = getApiOrigin();
// Treat explicit origin carefully: prefer the Next.js proxy when the configured
// origin points at localhost and the app is running in the browser on localhost.
let hasExplicitOrigin =
  Boolean(
    (process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.API_ORIGIN ||
      "").trim(),
  ) ||
  (typeof window !== "undefined" && isProductionFrontendHost());
if (hasExplicitOrigin && typeof window !== "undefined") {
  try {
    const parsed = new URL(cleanBaseUrl || "http://localhost");
    const originIsLocalhost = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    const runningOnLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    // If both the configured origin and the browser are on localhost, prefer
    // the Next.js `/api` proxy unless the env explicitly forces bypass.
    if (originIsLocalhost && runningOnLocalhost && process.env.NEXT_PUBLIC_FORCE_EXPLICIT_ORIGIN !== "true") {
      hasExplicitOrigin = false;
    }
  } catch {
    // ignore and respect the original flag
  }
}

// Use explicit origin when configured; otherwise proxy via Next.js /api rewrite in dev
const resolveApiBaseUrl = () => {
  if (typeof window !== "undefined" && isProductionFrontendHost()) {
    return getApiBaseUrl();
  }
  if (hasExplicitOrigin) {
    return getApiBaseUrl();
  }
  return "/api";
};

const resolveFileBaseUrl = () => {
  if (typeof window !== "undefined" && isProductionFrontendHost()) {
    return getApiOrigin();
  }
  return hasExplicitOrigin ? cleanBaseUrl : "";
};

export const API_BASE_URL = resolveApiBaseUrl();
export const FILE_BASE_URL = resolveFileBaseUrl();
const API_DEBUG = process.env.NEXT_PUBLIC_ENABLE_API_DEBUG === "true";
const debugLog = (...args) => {
  if (API_DEBUG) {
    console.log(...args);
  }
};

const isAbortedFetchError = (error, signal) =>
  Boolean(
    signal?.aborted ||
      error?.name === "AbortError" ||
      error?.code === 20 ||
      /aborted/i.test(String(error?.message || "")),
  );

export const isAbortRequestError = (error, signal) =>
  isAbortedFetchError(error, signal) || error?.__aborted === true;

const createNormalizedAbortError = (originalError) => {
  if (originalError?.name === "AbortError" || originalError?.__aborted) {
    return originalError;
  }
  const abortError = new Error(originalError?.message || "Request aborted");
  abortError.name = "AbortError";
  abortError.__aborted = true;
  abortError.cause = originalError;
  return abortError;
};

const getLocalhostPortFallbackUrls = (requestUrl) => {
  try {
    const parsedUrl = new URL(requestUrl, typeof window !== "undefined" ? window.location.origin : undefined);
    const host = parsedUrl.hostname?.toLowerCase();
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    if (!isLocalHost) return [];

    if (
      typeof window !== "undefined" &&
      parsedUrl.pathname.startsWith("/api/") &&
      parsedUrl.hostname === window.location.hostname &&
      (parsedUrl.port === window.location.port || (parsedUrl.port === "" && window.location.port === ""))
    ) {
      // When the browser is already requesting the local Next.js /api proxy,
      // do not retry on backend fallback ports from the client side.
      return [];
    }

    const urls = [];
    const pushUrl = (port) => {
      const nextUrl = new URL(parsedUrl.toString());
      nextUrl.port = String(port);
      const rendered = nextUrl.toString();
      if (!urls.includes(rendered)) {
        urls.push(rendered);
      }
    };

    const currentPort = parsedUrl.port || "";
    LOCAL_API_PORT_FALLBACKS.forEach((port) => {
      if (String(port) !== currentPort) {
        pushUrl(port);
      }
    });

    return urls;
  } catch {
    return [];
  }
};

const GET_CACHE_BUSTER_PARAMS = new Set(["t"]);
const API_RESPONSE_CACHE_TTL_MS = Number(
  process.env.NEXT_PUBLIC_API_CACHE_TTL_MS || 5 * 60 * 1000,
);
const API_RESPONSE_CACHE_MAX_ENTRIES = Number(
  process.env.NEXT_PUBLIC_API_CACHE_MAX_ENTRIES || 200,
);
/** @type {Map<string, { data: unknown, expiresAt: number }>} */
const apiResponseCache = new Map();
const apiInFlightRequests = new Map();
const latestRequestStartByCacheKey = new Map();
const recentApiErrorLogs = new Map();
const API_METRICS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_API_METRICS === "true";
const API_METRICS_WINDOW_SIZE = Number(
  process.env.NEXT_PUBLIC_API_METRICS_WINDOW_SIZE || 200,
);
const apiLatencyMetrics = new Map();
const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
const DEFAULT_REQUEST_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_API_TIMEOUT_MS ||
    (typeof window !== "undefined" && isProductionFrontendHost() ? 45000 : 60000),
);
const DEFAULT_UPLOAD_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_API_UPLOAD_TIMEOUT_MS || 180000,
);

const resolveTimeoutMs = (timeoutMs, fallbackMs) => {
  const parsed = Number(timeoutMs);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallbackMs;
};

const shouldLogApiError = (signature, cooldownMs = 2500) => {
  const now = Date.now();
  const lastLoggedAt = Number(recentApiErrorLogs.get(signature) || 0);
  if (now - lastLoggedAt < cooldownMs) {
    return false;
  }
  recentApiErrorLogs.set(signature, now);
  return true;
};

const toMetricRouteKey = (endpoint = "") => {
  const normalized = normalizeApiCacheKey(endpoint);
  const pathOnly = String(normalized || "").split("?")[0] || "/";
  // Remove object ids to reduce cardinality for p50/p95 tracking.
  return pathOnly.replace(
    /\b[0-9a-f]{24}\b/gi,
    ":id",
  );
};

const computePercentile = (values = [], percentile = 0.5) => {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile * sorted.length) - 1),
  );
  return Number(sorted[index] || 0);
};

const recordApiLatencyMetric = ({
  method,
  endpoint,
  status,
  durationMs,
  ok,
}) => {
  if (!API_METRICS_ENABLED) return;

  const metricMethod = String(method || "GET").toUpperCase();
  const metricRoute = toMetricRouteKey(endpoint);
  const key = `${metricMethod} ${metricRoute}`;
  const duration = Math.max(0, Number(durationMs) || 0);

  const metric = apiLatencyMetrics.get(key) || {
    method: metricMethod,
    endpoint: metricRoute,
    count: 0,
    errors: 0,
    durations: [],
    lastStatus: null,
  };

  metric.count += 1;
  if (!ok || Number(status) >= 400 || Number(status) === 0) {
    metric.errors += 1;
  }
  metric.lastStatus = Number(status) || 0;
  metric.durations.push(duration);
  if (metric.durations.length > API_METRICS_WINDOW_SIZE) {
    metric.durations = metric.durations.slice(-API_METRICS_WINDOW_SIZE);
  }

  apiLatencyMetrics.set(key, metric);
  debugLog("[API_METRIC]", {
    method: metricMethod,
    endpoint: metricRoute,
    status: metric.lastStatus,
    durationMs: Number(duration.toFixed(1)),
    count: metric.count,
    errorRate: Number((metric.errors / Math.max(metric.count, 1)).toFixed(3)),
    p50: Number(computePercentile(metric.durations, 0.5).toFixed(1)),
    p95: Number(computePercentile(metric.durations, 0.95).toFixed(1)),
  });
};

export const getApiLatencyMetricsSnapshot = () =>
  Array.from(apiLatencyMetrics.values()).map((metric) => ({
    method: metric.method,
    endpoint: metric.endpoint,
    count: metric.count,
    errors: metric.errors,
    errorRate: Number((metric.errors / Math.max(metric.count, 1)).toFixed(3)),
    p50: Number(computePercentile(metric.durations, 0.5).toFixed(1)),
    p95: Number(computePercentile(metric.durations, 0.95).toFixed(1)),
    lastStatus: metric.lastStatus,
  }));

const cloneApiValue = (value) => {
  if (value === null || typeof value !== "object") {
    return value;
  }

  // Optimization: Small objects with few keys are often faster to clone via spread
  // if they aren't deeply nested. However, for API safety, we prefer deep clone.
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (e) {
      // Fallback for non-cloneable objects (rare in API JSON)
      return JSON.parse(JSON.stringify(value));
    }
  }

  return JSON.parse(JSON.stringify(value));
};

const normalizeApiCacheKey = (endpoint = "") => {
  const normalizedEndpoint = String(endpoint || "").trim();
  if (!normalizedEndpoint) return normalizedEndpoint;

  const [pathPart = "", queryPart = ""] = normalizedEndpoint.split("?", 2);
  const normalizedPath =
    pathPart !== "/" ? pathPart.replace(/\/+$/, "") || "/" : "/";

  const params = new URLSearchParams(queryPart);
  const normalizedParams = [];

  for (const [key, value] of params.entries()) {
    if (!key) continue;
    if (GET_CACHE_BUSTER_PARAMS.has(key)) continue;
    normalizedParams.push([key, value]);
  }

  normalizedParams.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = leftKey.localeCompare(rightKey);
    return keyOrder !== 0 ? keyOrder : leftValue.localeCompare(rightValue);
  });

  if (normalizedParams.length === 0) {
    return normalizedPath;
  }

  const nextParams = new URLSearchParams();
  normalizedParams.forEach(([key, value]) => {
    nextParams.append(key, value);
  });

  return `${normalizedPath}?${nextParams.toString()}`;
};

export const getApiCacheKey = (endpoint) => normalizeApiCacheKey(endpoint);

const evictExpiredApiCacheEntries = () => {
  const now = Date.now();
  for (const [key, entry] of apiResponseCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      apiResponseCache.delete(key);
    }
  }
};

const trimApiResponseCache = () => {
  evictExpiredApiCacheEntries();
  while (apiResponseCache.size > API_RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = apiResponseCache.keys().next().value;
    if (!oldestKey) break;
    apiResponseCache.delete(oldestKey);
  }
};

const readCachedApiResponse = (cacheKey) => {
  if (!cacheKey || !apiResponseCache.has(cacheKey)) {
    return undefined;
  }
  const entry = apiResponseCache.get(cacheKey);
  if (!entry || entry.expiresAt <= Date.now()) {
    apiResponseCache.delete(cacheKey);
    return undefined;
  }
  return cloneApiValue(entry.data);
};

const writeCachedApiResponse = (cacheKey, data) => {
  if (!cacheKey) return;
  trimApiResponseCache();
  apiResponseCache.set(cacheKey, {
    data: cloneApiValue(data),
    expiresAt: Date.now() + API_RESPONSE_CACHE_TTL_MS,
  });
};

export const primeApiCache = (endpoint, data) => {
  const cacheKey = normalizeApiCacheKey(endpoint);
  if (!cacheKey) return;
  writeCachedApiResponse(cacheKey, data);
};

/**
 * Read a primed/cached response without making a request. Used as React Query
 * placeholderData so dashboards paint instantly from the portal bundle while
 * fresh data loads in the background.
 */
export const readApiCache = (endpoint) => {
  const cacheKey = normalizeApiCacheKey(endpoint);
  return readCachedApiResponse(cacheKey);
};

export const clearApiCache = (matcher) => {
  if (typeof matcher !== "function") {
    apiResponseCache.clear();
    apiInFlightRequests.clear();
    latestRequestStartByCacheKey.clear();
    return;
  }

  Array.from(apiResponseCache.keys()).forEach((key) => {
    if (matcher(key)) {
      apiResponseCache.delete(key);
    }
  });

  Array.from(apiInFlightRequests.keys()).forEach((key) => {
    if (matcher(key)) {
      apiInFlightRequests.delete(key);
    }
  });

  Array.from(latestRequestStartByCacheKey.keys()).forEach((key) => {
    if (matcher(key)) {
      latestRequestStartByCacheKey.delete(key);
    }
  });
};

const getStoredAccessToken = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const token =
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("token") ||
    "";

  if (!token || !isValidAuthToken(token)) {
    return "";
  }

  return token;
};

/**
 * Chat System API Instance (Axios)
 * Used by the new chat system components
 */
export const API = axios.create({
  baseURL: cleanBaseUrl ? `${cleanBaseUrl}/api` : "/api",
  timeout: DEFAULT_REQUEST_TIMEOUT_MS,
});

API.interceptors.request.use((config) => {
  // Maintaining consistency with existing localStorage key "accessToken"
  const token = getStoredAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.__startedAt = nowMs();

  return config;
});

API.interceptors.response.use(
  (response) => {
    recordApiLatencyMetric({
      method: response?.config?.method || "GET",
      endpoint: response?.config?.url || "/",
      status: response?.status || 0,
      durationMs: nowMs() - Number(response?.config?.__startedAt || nowMs()),
      ok: true,
    });
    return response;
  },
  (error) => {
    const config = error?.config || {};
    recordApiLatencyMetric({
      method: config?.method || "GET",
      endpoint: config?.url || "/",
      status: Number(error?.response?.status || 0),
      durationMs: nowMs() - Number(config?.__startedAt || nowMs()),
      ok: false,
    });

    const normalizedMessage = resolveAuthErrorMessage(error);
    if (normalizedMessage && error?.message !== normalizedMessage) {
      error.message = normalizedMessage;
    }
    if (error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "")) {
      error.message = AUTH_ERROR_MESSAGES.CONNECTION_TIMEOUT;
    }

    return Promise.reject(error);
  },
);

/**
 * Get authentication headers with JWT token
 */
const getAuthHeaders = () => {
  const token = getStoredAccessToken();
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

/**
 * Handle API response errors
 */
const handleResponse = async (response) => {
  debugLog("[API] Response status:", response.status, response.statusText);

  const rawText = await response.text();
  debugLog("[API] Raw response text:", rawText);

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const isJson =
    contentType.includes("application/json") ||
    contentType.includes("text/json") ||
    rawText.trim().startsWith("{") ||
    rawText.trim().startsWith("[");

  let body = null;
  if (rawText) {
    if (isJson) {
      try {
        body = JSON.parse(rawText);
      } catch (parseError) {
        debugLog("[API] JSON parse error:", parseError, "raw text:", rawText);
        body = rawText;
      }
    } else {
      body = rawText;
    }
  }

  if (!response.ok) {
    const errorMessage =
      body && typeof body === "object"
        ? body.message || JSON.stringify(body)
        : String(body || response.statusText || `HTTP error! status: ${response.status}`);

    const error = new Error(errorMessage || `HTTP error! status: ${response.status}`);
    error.status = response.status;
    error.statusText = response.statusText;
    error.data = body && typeof body === "object" ? body.data || null : null;
    error.response = body;
    throw error;
  }

  if (body === null || body === "") {
    return null;
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  debugLog("[API] Success response:", body);
  return body;
};

const dispatchUnauthorized = (reason = "session_expired") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("unauthorized", { detail: { reason } }),
  );
};

/**
 * Refresh Access Token
 */
const refreshAccessToken = async () => {
  try {
    const storedRefreshToken = localStorage.getItem("refreshToken") || "";
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    });

    if (!response.ok) throw new Error("Refresh failed");

    const data = await response.json();
    const payload = data.data || data;
    const accessToken = payload.accessToken || data.accessToken;
    const refreshToken = payload.refreshToken || data.refreshToken;
    if (!accessToken) throw new Error("Refresh failed");

    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("authToken", accessToken);
    if (refreshToken) {
      localStorage.setItem("refreshToken", refreshToken);
    }
    if (typeof document !== "undefined") {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `token=${accessToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax${secure}`;
    }
    return accessToken;
  } catch (error) {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("authToken");
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        localStorage.removeItem("userInfo");
        localStorage.removeItem("userRole");
        document.cookie = "token=; path=/; max-age=0; SameSite=Lax";
        document.cookie = "accessToken=; path=/; max-age=0; SameSite=Lax";
        document.cookie = "mbk_token=; path=/; max-age=0; SameSite=Lax";
        document.cookie = "portal_session=; Path=/; Max-Age=0; SameSite=Lax";
        document.cookie = "portal_role=; Path=/; Max-Age=0; SameSite=Lax";
      } catch (cleanupError) {
        console.warn("Failed to clear local auth state:", cleanupError);
      }

      dispatchUnauthorized("session_expired");
    }

    throw error;
  }
};

/**
 * Fetch wrapper with retry logic for 401s
 */
const fetchWithAuth = async (endpoint, options = {}) => {
  const apiBaseUrl = resolveApiBaseUrl();
  const fileBaseUrl = resolveFileBaseUrl();
  // Intelligent URL construction:
  let url;
  if (endpoint.startsWith("/api/")) {
    url = `${fileBaseUrl}${endpoint}`;
  } else {
    url = `${apiBaseUrl}${endpoint}`;
  }

  const method = (options.method || "GET").toUpperCase();
  const useCache = method === "GET" && !options.skipCache;
  const cacheKey = useCache ? normalizeApiCacheKey(endpoint) : "";
  const shouldDedupeInFlight =
    options.disableDedupe !== true &&
    (method === "GET" || options.allowUnsafeDedupe === true);
  const dedupeKey = shouldDedupeInFlight
    ? `${method}:${normalizeApiCacheKey(endpoint)}:${String(options.dedupeKey || "")}`
    : "";

  if (useCache) {
    const cachedResponse = readCachedApiResponse(cacheKey);
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }
  }

  if (shouldDedupeInFlight && apiInFlightRequests.has(dedupeKey)) {
    return apiInFlightRequests
      .get(dedupeKey)
      .then((result) => cloneApiValue(result));
  }

  const publicTrainerEndpoints = [
    { path: "/api/trainers/create-step1" },
    { path: "/api/trainers/update-step2" },
    { path: "/api/trainers/update-step3" },
    { path: "/api/trainers/submit" },
    { path: "/api/trainers/save-step" },
    { path: "/api/trainers/progress" },
    { path: "/api/trainers/nda-template", methods: ["GET"] },
    { path: "/api/trainer-documents/upload", methods: ["POST"] },
  ];
  const publicAuthEndpoints = [
    "/auth/login",
    "/auth/signup",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/verify-reset-otp",
    "/auth/reset-password",
    "/auth/verify-email",
    "/auth/otp",
    "/auth/refresh",
  ];
  const normalizedEndpoint = String(endpoint || "").toLowerCase().split("?")[0];
  const isPublicAuthEndpoint = publicAuthEndpoints.some((path) =>
    normalizedEndpoint.includes(path),
  );
  const skipAuthHeaders =
    options.skipAuth ||
    isPublicAuthEndpoint ||
    publicTrainerEndpoints.some(
      (rule) =>
        url.includes(rule.path) &&
        (!rule.methods || rule.methods.includes(method)),
    );

  const headers = {
    ...(skipAuthHeaders ? {} : getAuthHeaders()),
    ...options.headers,
  };

  // Ensure credentials are included for all requests (needed for cookies)
  const config = {
    ...options,
    headers,
    credentials: "include",
  };
  const timeoutMs = resolveTimeoutMs(
    options.timeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const startedAt = nowMs();
  if (useCache && cacheKey) {
    latestRequestStartByCacheKey.set(cacheKey, startedAt);
  }

  debugLog(`[API] ${config.method || "GET"} Request to: ${url}`);

  let timeoutController = null;
  let timeoutHandle = null;
  let externalAbortListener = null;
  let externalSignal = null;

  const requestPromise = (async () => {
    if (typeof AbortController !== "undefined" && timeoutMs > 0) {
      timeoutController = new AbortController();
      externalSignal = config.signal || null;

      if (externalSignal) {
        if (externalSignal.aborted) {
          timeoutController.abort(externalSignal.reason || "aborted");
        } else {
          externalAbortListener = () => {
            timeoutController.abort(externalSignal.reason || "aborted");
          };
          externalSignal.addEventListener("abort", externalAbortListener);
        }
      }

      timeoutHandle = setTimeout(() => {
        timeoutController.abort("timeout");
      }, timeoutMs);

      config.signal = timeoutController.signal;
    }

    let response;
    try {
      response = await fetch(url, config);
    } catch (fetchError) {
      const durationMs = nowMs() - startedAt;
      const didTimeout =
        timeoutController?.signal?.aborted &&
        String(timeoutController?.signal?.reason || "").toLowerCase() === "timeout";
      if (didTimeout) {
        recordApiLatencyMetric({
          method,
          endpoint,
          status: 0,
          durationMs,
          ok: false,
        });
        const timeoutError = new Error(AUTH_ERROR_MESSAGES.CONNECTION_TIMEOUT);
        timeoutError.code = "ETIMEDOUT";
        timeoutError.status = 0;
        timeoutError.__metricCaptured = true;
        throw timeoutError;
      }
      if (isAbortedFetchError(fetchError, config.signal)) {
        debugLog("[API] Fetch aborted:", {
          url,
          method: config.method,
        });
        throw createNormalizedAbortError(fetchError);
      }

      const fallbackUrls = getLocalhostPortFallbackUrls(url);
      for (const fallbackUrl of fallbackUrls) {
        try {
          debugLog("[API] Retry request on local fallback port:", {
            originalUrl: url,
            fallbackUrl,
            method: config.method,
          });
          response = await fetch(fallbackUrl, config);
          url = fallbackUrl;
          break;
        } catch {
          // Try next fallback candidate.
        }
      }

      if (!response) {
        const isRetryableGetError =
          method === "GET" &&
          options.retryGetNetwork !== false &&
          options.__retryAttempted !== true;
        if (isRetryableGetError) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return fetchWithAuth(endpoint, {
            ...options,
            __retryAttempted: true,
            disableDedupe: true,
            skipCache: true,
          });
        }

        const isOnline =
          typeof navigator === "undefined" ? true : navigator.onLine;
        const errorSignature = `${method}:${endpoint}:network`;
        if (shouldLogApiError(errorSignature)) {
          console.error("[API] Fetch network error:", {
            url,
            method: config.method,
            error: fetchError.message,
            stack: fetchError.stack,
            online: isOnline,
            type: fetchError.name,
            fallbackCandidates: fallbackUrls,
          });
        }

        let detail = fetchError.message;
        if (!isOnline) detail = "Device is offline";

        recordApiLatencyMetric({
          method,
          endpoint,
          status: 0,
          durationMs,
          ok: false,
        });
        const networkError = new Error(resolveAuthErrorMessage(fetchError, AUTH_ERROR_MESSAGES.NETWORK_ERROR));
        networkError.code = fetchError.code || "ERR_NETWORK";
        networkError.status = 0;
        networkError.__metricCaptured = true;
        throw networkError;
      }
    }

    // Never refresh/retry on rate limits; never attach refresh logic to public auth calls.
    if (response.status === 401 && !skipAuthHeaders) {
      try {
        const newToken = await refreshAccessToken();
        config.headers["Authorization"] = `Bearer ${newToken}`;
        response = await fetch(url, config);
      } catch (refreshRetryError) {
        if (isAbortedFetchError(refreshRetryError, config.signal)) {
          throw createNormalizedAbortError(refreshRetryError);
        }
        throw refreshRetryError;
      }
    }

    if ((response.status === 401 || response.status === 403) && !skipAuthHeaders) {
      dispatchUnauthorized("session_expired");
    }

    const result = await handleResponse(response);
    recordApiLatencyMetric({
      method,
      endpoint,
      status: response?.status || 0,
      durationMs: nowMs() - startedAt,
      ok: Boolean(response?.ok),
    });

    if (useCache) {
      const latestRequestStartedAt = Number(
        latestRequestStartByCacheKey.get(cacheKey) || 0,
      );
      if (startedAt >= latestRequestStartedAt) {
        writeCachedApiResponse(cacheKey, result);
      }
    }

    return result;
  })().catch((requestError) => {
    if (requestError?.__metricCaptured) {
      throw requestError;
    }
    const hasStatus = Number.isFinite(Number(requestError?.status));
    if (!hasStatus) {
      recordApiLatencyMetric({
        method,
        endpoint,
        status: 0,
        durationMs: nowMs() - startedAt,
        ok: false,
      });
    }
    throw requestError;
  }).finally(() => {
    // cleanup timeout + abort listener
    if (typeof timeoutHandle !== "undefined" && timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener("abort", externalAbortListener);
    }
  });

  if (shouldDedupeInFlight) {
    apiInFlightRequests.set(dedupeKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (shouldDedupeInFlight) {
      apiInFlightRequests.delete(dedupeKey);
    }
  }
};

/**
 * API service object with HTTP methods
 */
export const api = {
  get: (endpoint, options = {}) =>
    fetchWithAuth(endpoint, { method: "GET", ...options }),

  post: async (endpoint, data, options = {}) => {
    const isFormData = data instanceof FormData;
    const defaultHeaders = isFormData ? {} : { "Content-Type": "application/json" };
    const body = isFormData ? data : JSON.stringify(data);

    // If FormData, delete Content-Type to let browser handle boundary
    if (isFormData && defaultHeaders["Content-Type"]) {
      delete defaultHeaders["Content-Type"];
    }

    const headers = {
      ...defaultHeaders,
      ...(options.headers || {}),
    };

    if (isFormData && headers["Content-Type"]) {
      delete headers["Content-Type"];
    }

    if (isFormData) {
      let totalSize = 0;
      // Approximate size
      for (let [key, value] of data.entries()) {
        if (value instanceof File) totalSize += value.size;
        else totalSize += String(value).length;
      }
      debugLog(
        `[API] POST Multipart Size: ~${Math.round(totalSize / 1024)} KB`,
      );
    }

    const response = await fetchWithAuth(endpoint, {
      ...options,
      method: "POST",
      body,
      headers,
      timeoutMs: resolveTimeoutMs(
        options.timeoutMs,
        isFormData ? DEFAULT_UPLOAD_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS,
      ),
    });
    clearApiCache();
    return response;
  },

  put: async (endpoint, data, options = {}) => {
    debugLog("[API] PUT Request:", { endpoint, data });
    const isFormData = data instanceof FormData;
    const defaultHeaders = isFormData ? {} : { "Content-Type": "application/json" };
    const body = isFormData ? data : JSON.stringify(data);
    debugLog("[API] PUT Body (stringified):", body);

    if (isFormData && defaultHeaders["Content-Type"]) {
      delete defaultHeaders["Content-Type"];
    }

    const headers = {
      ...defaultHeaders,
      ...(options.headers || {}),
    };

    if (isFormData && headers["Content-Type"]) {
      delete headers["Content-Type"];
    }

    const response = await fetchWithAuth(endpoint, {
      ...options,
      method: "PUT",
      body,
      headers,
      timeoutMs: resolveTimeoutMs(
        options.timeoutMs,
        isFormData ? DEFAULT_UPLOAD_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS,
      ),
    });
    clearApiCache();
    return response;
  },

  delete: async (endpoint, options = {}) => {
    const response = await fetchWithAuth(endpoint, {
      ...options,
      method: "DELETE",
    });
    clearApiCache();
    return response;
  },

  uploadWithProgress: (endpoint, formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let url;
      if (endpoint.startsWith("/api/")) {
        url = `${FILE_BASE_URL || ""}${endpoint}`;
      } else {
        url = `${API_BASE_URL || "/api"}${endpoint}`;
      }
      
      xhr.open("POST", url, true);
      
      const token = getStoredAccessToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percentCompleted = Math.round((event.loaded * 100) / event.total);
          onProgress(percentCompleted);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            resolve(xhr.responseText);
          }
        } else {
          let errorMsg = `HTTP Error ${xhr.status}`;
          try {
            const response = JSON.parse(xhr.responseText);
            errorMsg = response.message || errorMsg;
          } catch {}
          const error = new Error(errorMsg);
          error.status = xhr.status;
          reject(error);
        }
      };
      
      xhr.onerror = () => {
        reject(new Error("Network error during upload"));
      };
      
      xhr.send(formData);
    });
  },

  primeCache: primeApiCache,
  clearCache: clearApiCache,
};

/**
 * Password Reset API Functions
 */
export const forgotPassword = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  debugLog("[API] Forgot Password Request:", { email: normalizedEmail });
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail }),
    credentials: "include",
  });
  return handleResponse(response);
};

export const verifyResetOTP = async (email, otp) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedOtp = String(otp || "").replace(/\D/g, "").slice(0, 6);
  debugLog("[API] Verify Reset OTP Request:", {
    email: normalizedEmail,
    otp: normalizedOtp,
  });
  const response = await fetch(`${API_BASE_URL}/auth/verify-reset-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail, otp: normalizedOtp }),
  });
  return handleResponse(response);
};

export const resetPassword = async (tempToken, password) => {
  debugLog("[API] Reset Password Request");
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempToken, password }),
  });
  return handleResponse(response);
};

// Default export for convenience
export default api;
