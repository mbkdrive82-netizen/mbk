import { api } from "@/services/api";
import {
  AUTH_ERROR_MESSAGES,
  normalizeAuthResponseError,
  resolveAuthErrorMessage,
  parseApiJsonResponse,
} from "@/lib/authErrorHandler";
import {
  discoverApiOrigin,
  getApiOrigin,
  getResolvedApiOrigin,
  getSimpleAuthBaseUrl,
  isProductionFrontendHost,
  resetDiscoveredApiOrigin,
} from "@/config/apiConfig";
import { isKnownPortalRole, normalizeAuthUser } from "@/utils/authRoles";
import { isValidAuthToken } from "@/utils/authJwt";

/**
 * Check trainer email status before OTP
 */
export const checkTrainerEmail = (data) =>
  api.post("/trainers/check-email", data);

/**
 * Trainer Registration - Step 1: email + password, sends OTP to that email only
 */
export const registrationInit = (data) =>
  api.post("/auth/register/trainer", data);

export const registerStudent = (data) =>
  api.post("/auth/register/student", data);

export const registerCompany = (data) =>
  api.post("/auth/register/company", data);

/**
 * Verify Trainer Registration OTP
 */
export const verifyOtp = (data) =>
  api.post("/auth/register/trainer/verify-otp", data);

export const resendTrainerOtp = (data) =>
  api.post("/auth/register/trainer/resend-otp", data);

/**
 * Legacy Registration Step 1
 */
export const registrationStep1 = (data) =>
  api.post("/auth/trainer-registration-step1", data);

/**
 * Register a new trainer (Legacy)
 */
export const signupTrainer = (data) => api.post("/auth/signup", data);


// --- Student and Company Simple Auth Services ---
let API_BASE_URL = getSimpleAuthBaseUrl();

const resolveSimpleAuthBaseUrl = async () => {
  // Browser dev: always use Next.js rewrite to avoid port/CORS mismatches.
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    API_BASE_URL = '/api/simple-auth';
    return API_BASE_URL;
  }

  const hasExplicitOrigin =
    Boolean(
      (process.env.NEXT_PUBLIC_API_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.API_ORIGIN ||
        '').trim(),
    ) ||
    (typeof window !== 'undefined' && isProductionFrontendHost());

  if (!hasExplicitOrigin) {
    API_BASE_URL = '/api/simple-auth';
    return API_BASE_URL;
  }

  const origin = await discoverApiOrigin();
  API_BASE_URL = `${origin}/api/simple-auth`;
  return API_BASE_URL;
};

const TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, matches JWT expiry

/**
 * Mirror the JWT into a cookie so Next.js proxy (which can only read
 * cookies on navigation requests) can authorize protected routes.
 * Without this, every protected route redirects back to
 * /login?redirect=...&reason=unauthenticated even after a successful login.
 */
export const markPortalLoginSession = () => {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('mbk_portal_login', String(Date.now()));
  }
};

export const hasActivePortalLoginSession = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(sessionStorage.getItem('mbk_portal_login'));
};

export const setAuthCookie = (token) => {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `token=${token}; path=/; max-age=${TOKEN_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  console.debug('[AUTH] token cookie set (proxy can now authorize routes)');
};

export const clearAuthCookie = () => {
  if (typeof document === 'undefined') return;
  document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'accessToken=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'mbk_token=; path=/; max-age=0; SameSite=Lax';
};

const readAuthCookieToken = () => {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const entry of cookies) {
    const [rawName, ...rawValueParts] = entry.trim().split('=');
    const name = rawName?.trim();
    if (!name || !['token', 'accessToken', 'mbk_token'].includes(name)) {
      continue;
    }

    const value = decodeURIComponent(rawValueParts.join('=') || '').trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const normalizeVerifiedAuthPayload = (payload = {}) => {
  const user = payload.user;
  if (!user || typeof user !== 'object') {
    return { success: false, authenticated: false };
  }

  const userWithRole = normalizeAuthUser({
    ...user,
    role: payload.role || user.role,
  });

  if (!isKnownPortalRole(userWithRole?.role, userWithRole?.email)) {
    return { success: false, authenticated: false };
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(userWithRole));
    localStorage.setItem('userInfo', JSON.stringify(userWithRole));
    localStorage.setItem('userRole', userWithRole.role);
  }

  return {
    success: true,
    authenticated: true,
    role: userWithRole.role,
    user: userWithRole,
  };
};

const getToken = () => readRawToken();

const getValidToken = () => purgeInvalidStoredToken();

const setToken = (token) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('authToken', token);
    localStorage.setItem('accessToken', token);
    setAuthCookie(token);
    markPortalLoginSession();
    console.debug('[AUTH] token stored in localStorage (authToken, accessToken)');
  }
};

const AUTH_LOCAL_STORAGE_KEYS = [
  'authToken',
  'accessToken',
  'token',
  'user',
  'userInfo',
  'userRole',
  'refreshToken',
  'mbk-auth',
];

const AUTH_SESSION_STORAGE_KEYS = [
  'mbk_portal_login',
  'mbk-auth',
  'mbk_portal_data_bundle_v2',
];

const removeToken = () => {
  if (typeof window !== 'undefined') {
    AUTH_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    AUTH_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
    clearAuthCookie();
    console.debug('[AUTH] token + user data cleared from storage');
  }
};

export const clearClientAuthSession = () => {
  removeToken();
};

const readRawToken = () => {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem('authToken')
    || localStorage.getItem('accessToken')
    || localStorage.getItem('token')
  );
};

const purgeInvalidStoredToken = () => {
  const token = readRawToken();
  if (!token) return null;
  if (isValidAuthToken(token)) return token;
  removeToken();
  return null;
};

const SIMPLE_AUTH_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 60000);
const SIMPLE_AUTH_MAX_RETRIES = 1;

const makeRequest = async (url, method = 'GET', data = null, attempt = 0) => {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = getValidToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    config.body = JSON.stringify(data);
  }

  const baseUrl = await resolveSimpleAuthBaseUrl();
  const requestUrl = url.startsWith('http')
    ? url
    : `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;

  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timeoutHandle = controller
    ? setTimeout(() => controller.abort('timeout'), SIMPLE_AUTH_TIMEOUT_MS)
    : null;
  if (controller) {
    config.signal = controller.signal;
  }

  try {
    const response = await fetch(requestUrl, config);
    let result = {};
    try {
      result = await parseApiJsonResponse(response);
    } catch (parseError) {
      if (parseError?.status >= 500 || parseError?.nonJsonBody) {
        throw parseError;
      }
      result = {};
    }

    if (response.status === 401) {
      removeToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('unauthorized'));
      }
    }

    const normalized = {
      success: response.ok,
      status: response.status,
      ...result,
    };

    if (!response.ok) {
      normalized.message = resolveAuthErrorMessage(
        { status: response.status, message: result?.message, response: { data: result } },
        result?.message || AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
      );
    }

    return normalized;
  } catch (error) {
    const isTimeout =
      error?.name === 'AbortError' &&
      String(error?.message || controller?.signal?.reason || '').includes('timeout');

    if (attempt < SIMPLE_AUTH_MAX_RETRIES) {
      resetDiscoveredApiOrigin();
      return makeRequest(url, method, data, attempt + 1);
    }

    return {
      success: false,
      status: isTimeout ? 408 : 0,
      message: isTimeout
        ? AUTH_ERROR_MESSAGES.CONNECTION_TIMEOUT
        : resolveAuthErrorMessage(error, AUTH_ERROR_MESSAGES.NETWORK_ERROR),
      error: error.message,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const persistStudentSession = (response) => {
  if (response.success && response.token) {
    setToken(response.token);
    if (typeof window !== 'undefined' && response.student) {
      localStorage.setItem('userInfo', JSON.stringify(response.student));
      localStorage.setItem('userRole', 'student');
      console.debug('[AUTH] user role stored: student (registration)');
    }
  }
};

const persistCompanySession = (response) => {
  if (response.success && response.token) {
    setToken(response.token);
    if (typeof window !== 'undefined' && response.company) {
      localStorage.setItem('userInfo', JSON.stringify(response.company));
      localStorage.setItem('userRole', 'company');
      console.debug('[AUTH] user role stored: company (registration)');
    }
  }
};

export const studentAuthService = {
  register: async (formData) => {
    const response = await makeRequest('/student/register', 'POST', formData);
    persistStudentSession(response);
    return response;
  },
  login: async (email, password) => {
    const response = await makeRequest('/student/login', 'POST', { email, password });
    console.debug('[AUTH] student login response:', { success: response.success, status: response.status, message: response.message });
    if (response.success && response.token) {
      setToken(response.token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('userInfo', JSON.stringify(response.student));
        localStorage.setItem('userRole', 'student');
        console.debug('[AUTH] user role stored: student');
      }
    }
    return response;
  },
  getDashboard: async () => {
    return await makeRequest('/student/dashboard', 'GET');
  },
  forgotPassword: async (email) => {
    return await makeRequest('/student/forgot-password', 'POST', {
      email: String(email || '').trim().toLowerCase(),
    });
  },
  verifyResetOtp: async (email, otp) => {
    return await makeRequest('/student/verify-reset-otp', 'POST', {
      email: String(email || '').trim().toLowerCase(),
      otp: String(otp || '').replace(/\D/g, '').slice(0, 6),
    });
  },
  resetPassword: async (tempToken, password) => {
    return await makeRequest('/student/reset-password', 'POST', { tempToken, password });
  },
};

export const companyAuthService = {
  register: async (formData) => {
    const response = await makeRequest('/company/register', 'POST', formData);
    persistCompanySession(response);
    return response;
  },
  login: async (email, password) => {
    const response = await makeRequest('/company/login', 'POST', { email, password });
    console.debug('[AUTH] company login response:', { success: response.success, status: response.status, message: response.message });
    if (response.success && response.token) {
      setToken(response.token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('userInfo', JSON.stringify(response.company));
        localStorage.setItem('userRole', 'company');
        console.debug('[AUTH] user role stored: company');
      }
    }
    return response;
  },
  getDashboard: async () => {
    return await makeRequest('/company/dashboard', 'GET');
  },
  forgotPassword: async (email) => {
    return await makeRequest('/company/forgot-password', 'POST', {
      email: String(email || '').trim().toLowerCase(),
    });
  },
  verifyResetOtp: async (email, otp) => {
    return await makeRequest('/company/verify-reset-otp', 'POST', {
      email: String(email || '').trim().toLowerCase(),
      otp: String(otp || '').replace(/\D/g, '').slice(0, 6),
    });
  },
  resetPassword: async (tempToken, password) => {
    return await makeRequest('/company/reset-password', 'POST', { tempToken, password });
  },
};

let verifyAuthInFlight = null;

export const authService = {
  logout: async () => {
    const response = await makeRequest('/logout', 'POST');
    removeToken();
    return response;
  },
  verifyAuth: async () => {
    if (verifyAuthInFlight) {
      return verifyAuthInFlight;
    }

    verifyAuthInFlight = (async () => {
      const simpleAuthResult = await makeRequest('/verify', 'GET');
      if (simpleAuthResult.success && simpleAuthResult.authenticated) {
        const normalized = normalizeVerifiedAuthPayload(simpleAuthResult);
        if (normalized.authenticated) {
          return normalized;
        }
        removeToken();
        return normalized;
      }

      const token = getValidToken();
      if (!token) {
        if (readAuthCookieToken()) {
          clearAuthCookie();
        }
        return simpleAuthResult;
      }

      const hasExplicitOrigin = Boolean(
        (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_ORIGIN || '').trim(),
      );
      const meUrl = hasExplicitOrigin
        ? `${getResolvedApiOrigin()}/api/auth/me`
        : '/api/auth/me';

      try {
        const response = await fetch(meUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const data = await response.json();
        const payload = data.data || data;
        const user = payload.user || payload;
        if (response.ok && data.success && user) {
          const normalized = normalizeVerifiedAuthPayload({
            role: user.role || payload.role,
            user,
          });
          if (normalized.authenticated) {
            return normalized;
          }
          removeToken();
          return normalized;
        }

        if (response.status === 401 || response.status === 403) {
          removeToken();
        }
      } catch (error) {
        console.warn('[AUTH] /api/auth/me verification failed:', error);
      }

      return { success: false, authenticated: false };
    })();

    try {
      return await verifyAuthInFlight;
    } finally {
      verifyAuthInFlight = null;
    }
  },
  getStoredUserInfo: () => {
    if (typeof window !== 'undefined') {
      const info = localStorage.getItem('userInfo');
      const role = localStorage.getItem('userRole');
      return info ? { user: JSON.parse(info), role } : null;
    }
    return null;
  },
  isAuthenticated: () => Boolean(getValidToken()),
  getToken,
  getValidToken,
};

export default authService;
