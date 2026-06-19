'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
// Removed unused import of fetchWithTimeout
import authService, { studentAuthService, companyAuthService, setAuthCookie, clearAuthCookie, markPortalLoginSession, clearClientAuthSession } from '../services/authService';
import { discoverApiOrigin } from '@/config/apiConfig';
import { loginTypeMatchesUser, normalizeAuthUser, isKnownPortalRole } from '@/utils/authRoles';
import { validateLoginForm } from '@/utils/authValidation';
import { getUnauthenticatedLoginPath } from '@/utils/authRedirects';
import { isPublicPath } from '@/shared/config/routeProtection';
import { AUTH_ERROR_MESSAGES, resolveAuthErrorMessage, parseApiJsonResponse } from '@/lib/authErrorHandler';

const AuthContext = createContext();

const readInitialAuthState = () => {
  if (typeof window === 'undefined') {
    return {
      user: null,
      userRole: null,
      isAuthenticated: false,
      loading: false,
    };
  }

  const token = authService.getValidToken();
  if (!token) {
    return {
      user: null,
      userRole: null,
      isAuthenticated: false,
      loading: false,
    };
  }

  const stored = authService.getStoredUserInfo();
  if (!stored?.user) {
    return {
      user: null,
      userRole: null,
      isAuthenticated: false,
      loading: true,
    };
  }

  const userWithRole = normalizeAuthUser({
    ...stored.user,
    role: stored.role || stored.user.role,
  });

  if (!isKnownPortalRole(userWithRole?.role, userWithRole?.email)) {
    clearClientAuthSession();
    return {
      user: null,
      userRole: null,
      isAuthenticated: false,
      loading: false,
    };
  }

  return {
    user: userWithRole,
    userRole: userWithRole.role,
    isAuthenticated: true,
    loading: true,
  };
};

export const AuthProvider = ({ children }) => {
  const [initialAuth] = useState(readInitialAuthState);
  const [user, setUser] = useState(initialAuth.user);
  const [userRole, setUserRole] = useState(initialAuth.userRole);
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth.isAuthenticated);
  const [loading, setLoading] = useState(initialAuth.loading);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const initializeAuth = async () => {
      try {
        const token = authService.getValidToken();

        if (!token) {
          clearAuthCookie();
          if (!cancelled) {
            setUser(null);
            setUserRole(null);
            setIsAuthenticated(false);
            setLoading(false);
          }
          return;
        }

        setAuthCookie(token);

        const pathname = window.location.pathname || '/';
        if (isPublicPath(pathname)) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        const response = await authService.verifyAuth();
        if (cancelled) return;

        if (response.success && response.authenticated && response.user) {
          const userWithRole = normalizeAuthUser({
            ...response.user,
            role: response.role || response.user.role,
          });

          if (!isKnownPortalRole(userWithRole?.role, userWithRole?.email)) {
            authService.logout();
            setUser(null);
            setUserRole(null);
            setIsAuthenticated(false);
            return;
          }

          setUser(userWithRole);
          setUserRole(userWithRole.role);
          setIsAuthenticated(true);
        } else {
          authService.logout();
          setUser(null);
          setUserRole(null);
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        authService.logout();
        if (!cancelled) {
          setUser(null);
          setUserRole(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const handleUnauthorized = (event) => {
      setUser(null);
      setUserRole(null);
      setIsAuthenticated(false);
      authService.logout();
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname || '/';
        const isPortalRoute =
          pathname.startsWith('/dashboard')
          || pathname.startsWith('/spoc')
          || pathname.startsWith('/trainer')
          || pathname.startsWith('/student')
          || pathname.startsWith('/company')
          || pathname.startsWith('/accountant')
          || pathname.startsWith('/chat')
          || pathname.startsWith('/admin');
        if (isPortalRoute) {
          window.location.replace(
            getUnauthenticatedLoginPath(pathname, event?.detail?.reason || 'session_expired'),
          );
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('unauthorized', handleUnauthorized);
      return () => {
        cancelled = true;
        window.removeEventListener('unauthorized', handleUnauthorized);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const registerStudent = async (formData) => {
    setError(null);
    try {
      const response = await studentAuthService.register(formData);
      if (response.success && response.token) {
        const studentInfo = { ...(response.student || {}), role: 'student' };
        setUser(studentInfo);
        setUserRole('student');
        setIsAuthenticated(true);
        markPortalLoginSession();
      } else if (!response.success) {
        setError(response.message);
      }
      return response;
    } catch (err) {
      const message = resolveAuthErrorMessage(err, 'Registration failed. Please try again.');
      setError(message);
      return { success: false, message };
    }
  };

  const loginStudent = async (email, password) => {
    setError(null);
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedPassword = String(password || '');
    const validationError = validateLoginForm({
      email: trimmedEmail,
      password: trimmedPassword,
    });
    if (validationError) {
      setError(validationError);
      return { success: false, message: validationError };
    }

    try {
      const response = await studentAuthService.login(trimmedEmail, trimmedPassword);
      if (response.success && response.token) {
        const studentInfo = { ...response.student, role: 'student' };
        console.debug('[AUTH] student authenticated, role: student');
        setUser(studentInfo);
        setUserRole('student');
        setIsAuthenticated(true);
        markPortalLoginSession();
      } else if (response.success) {
        setError('Login succeeded but no session token was returned. Please try again.');
      } else {
        setError(response.message);
      }
      return response;
    } catch (err) {
      const message = resolveAuthErrorMessage(err, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
      setError(message);
      return { success: false, message };
    }
  };

  const registerCompany = async (formData) => {
    setError(null);
    try {
      const response = await companyAuthService.register(formData);
      if (response.success && response.token) {
        const companyInfo = { ...(response.company || {}), role: 'company' };
        setUser(companyInfo);
        setUserRole('company');
        setIsAuthenticated(true);
        markPortalLoginSession();
      } else if (!response.success) {
        setError(response.message);
      }
      return response;
    } catch (err) {
      const message = resolveAuthErrorMessage(err, 'Registration failed. Please try again.');
      setError(message);
      return {
        success: false,
        message,
        status: err.status,
      };
    }
  };

  const loginCompany = async (email, password) => {
    setError(null);
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedPassword = String(password || '');
    const validationError = validateLoginForm({
      email: trimmedEmail,
      password: trimmedPassword,
    });
    if (validationError) {
      setError(validationError);
      return { success: false, message: validationError };
    }

    try {
      const response = await companyAuthService.login(trimmedEmail, trimmedPassword);
      if (response.success && response.token) {
        const companyInfo = { ...response.company, role: 'company' };
        console.debug('[AUTH] company authenticated, role: company');
        setUser(companyInfo);
        setUserRole('company');
        setIsAuthenticated(true);
        markPortalLoginSession();
      } else if (response.success) {
        setError('Login succeeded but no session token was returned. Please try again.');
      } else {
        setError(response.message);
      }
      return response;
    } catch (err) {
      const message = resolveAuthErrorMessage(err, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
      setError(message);
      return { success: false, message };
    }
  };

  const login = async (email, password, options = {}) => {
    setError(null);
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedPassword = String(password || '');
    const validationError = validateLoginForm({
      email: trimmedEmail,
      password: trimmedPassword,
    });
    if (validationError) {
      setError(validationError);
      throw new Error(validationError);
    }

    const expectedRole = options.expectedRole;
    const preferAdminFirst = Boolean(options.preferAdminFirst);

    const clearStoredSession = () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('authToken');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('userRole');
        clearAuthCookie();
      }
      setUser(null);
      setUserRole(null);
      setIsAuthenticated(false);
    };

    const finalizePortalLogin = (rawUserInfo, roleCheckOverride = null) => {
      const userInfo = normalizeAuthUser(rawUserInfo);
      const roleToCheck = roleCheckOverride || expectedRole;
      if (roleToCheck && !loginTypeMatchesUser(roleToCheck, userInfo.role, userInfo.email)) {
        clearStoredSession();
        const err = new Error('This email is not registered for the selected account type');
        err.roleMismatch = true;
        throw err;
      }
      setUser(userInfo);
      setUserRole(userInfo.role);
      setIsAuthenticated(true);
      markPortalLoginSession();
      return userInfo;
    };

    const buildAuthError = (
      data,
      payload,
      fallbackMessage = 'Invalid credentials',
      status = undefined,
    ) => {
      const safeData = data || {};
      const safePayload = payload || {};
      const authMessage =
        safeData.message ||
        safePayload.message ||
        ((status >= 500 || safeData.nonJsonBody || safePayload.nonJsonBody)
          ? AUTH_ERROR_MESSAGES.SERVER_UNAVAILABLE
          : fallbackMessage);
      const err = new Error(authMessage);
      err.status = status || safePayload.status || safeData.status;
      err.pendingApproval = safePayload.pendingApproval || safeData.pendingApproval;
      err.requiresEmailVerification =
        safePayload.requiresEmailVerification || safeData.requiresEmailVerification;
      err.accountDeactivated = safePayload.accountDeactivated || safeData.accountDeactivated;
      err.roleMismatch = safePayload.roleMismatch || safeData.roleMismatch;
      err.retryAfterSeconds =
        safePayload.retryAfterSeconds || safeData.retryAfterSeconds;
      err.nonJsonBody = safePayload.nonJsonBody || safeData.nonJsonBody;
      return err;
    };

    // Timeout wrapper for slow connections
    const withTimeout = (promise, ms = 15000) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out. Please check your network and try again.')), ms)
        ),
      ]);

    const throwLoginProviderError = (response, fallback = 'Invalid email or password') => {
      const isRateLimited = response?.status === 429;
      const err = new Error(
        isRateLimited
          ? response?.message ||
              'Too many login attempts. Please wait a few minutes and try again.'
          : response?.message || fallback,
      );
      if (isRateLimited) {
        err.status = 429;
        err.retryAfterSeconds = response?.retryAfterSeconds;
      }
      throw err;
    };

    const tryStudent = async () => {
      try {
        const response = await withTimeout(studentAuthService.login(trimmedEmail, trimmedPassword));
        if (response.success) {
          return finalizePortalLogin({ ...response.student, role: 'student' });
        }
        if (expectedRole === 'student') {
          throwLoginProviderError(response);
        }
      } catch (e) {
        if (
          e.message?.includes('timed out') ||
          e.roleMismatch ||
          e.status === 429
        ) {
          throw e;
        }
        if (expectedRole === 'student') {
          throw e;
        }
      }
      return null;
    };

    const tryCompany = async ({ allowAdminFallback = false } = {}) => {
      try {
        const response = await withTimeout(companyAuthService.login(trimmedEmail, trimmedPassword));
        if (response.success) {
          return finalizePortalLogin({ ...response.company, role: 'company' });
        }
        if (response.status === 429 && !allowAdminFallback) {
          throwLoginProviderError(response);
        }
        if (response.status === 429 && allowAdminFallback) {
          return null;
        }
        if (expectedRole === 'company' && !allowAdminFallback) {
          throwLoginProviderError(response);
        }
      } catch (e) {
        if (
          e.message?.includes('timed out') ||
          e.roleMismatch ||
          (e.status === 429 && !allowAdminFallback)
        ) {
          throw e;
        }
        if (expectedRole === 'company' && !allowAdminFallback) {
          throw e;
        }
      }
      return null;
    };

    const resolveLoginApiUrl = async () => {
      // In the browser, use the Next.js /api rewrite to avoid port/CORS mismatches.
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        return '/api/auth/login';
      }
      const origin = await discoverApiOrigin();
      return `${origin}/api/auth/login`;
    };

    const tryGeneralUser = async (strict = false, roleOverride = null) => {
      try {
        const loginUrl = await resolveLoginApiUrl();
        const requestBody = { email: trimmedEmail, password: trimmedPassword };
        const roleForRequest = roleOverride || expectedRole;
        if (
          roleForRequest &&
          roleForRequest !== 'student' &&
          roleForRequest !== 'company'
        ) {
          requestBody.expectedRole = roleForRequest;
        }

        const response = await withTimeout(
          fetch(loginUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          }),
          10000 // 10‑second timeout
        );

        const data = await parseApiJsonResponse(response);
        const payload = data.data || data;
        const accessToken = payload.accessToken || data.accessToken;
        const authUser = payload.user || data.user;

        if (response.status === 429) {
          const rateLimitError = buildAuthError(
            data,
            payload,
            'Too many login attempts. Please wait a few minutes and try again.',
          );
          rateLimitError.status = 429;
          rateLimitError.retryAfterSeconds =
            payload.retryAfterSeconds || data.retryAfterSeconds;
          throw rateLimitError;
        }

        if (response.ok && data.success && accessToken) {
          const userInfo = normalizeAuthUser({
            id: authUser?.id || authUser?._id,
            email: authUser?.email,
            name: authUser?.name || authUser?.fullName,
            role: authUser?.role,
          });
          console.debug('[AUTH] general login response:', {
            success: true,
            role: userInfo.role,
            email: userInfo.email,
          });

          if (typeof window !== 'undefined') {
            localStorage.setItem('authToken', accessToken);
            localStorage.setItem('accessToken', accessToken);
            if (payload.refreshToken || data.refreshToken) {
              localStorage.setItem(
                'refreshToken',
                payload.refreshToken || data.refreshToken,
              );
            }
            localStorage.setItem('user', JSON.stringify(userInfo));
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            localStorage.setItem('userRole', userInfo.role);
            setAuthCookie(accessToken);
            console.debug('[AUTH] token + role stored:', userInfo.role);
          }

          return finalizePortalLogin(userInfo, roleOverride || expectedRole);
        }

        if (
          payload.pendingApproval ||
          data.pendingApproval ||
          payload.requiresEmailVerification ||
          data.requiresEmailVerification ||
          payload.accountDeactivated ||
          data.accountDeactivated ||
          payload.roleMismatch ||
          data.roleMismatch ||
          strict ||
          !response.ok
        ) {
          throw buildAuthError(data, payload, 'Invalid credentials', response.status);
        }
      } catch (e) {
        if (
          e.message?.includes('timed out') ||
          e.pendingApproval ||
          e.requiresEmailVerification ||
          e.accountDeactivated ||
          e.roleMismatch ||
          e.status === 429 ||
          strict
        ) {
          throw e;
        }
      }
      return null;
    };

    try {
      if (expectedRole === 'student') {
        const res = await tryStudent();
        if (res) return res;
      } else if (expectedRole === 'company') {
        if (preferAdminFirst) {
          try {
            const adminRes = await tryGeneralUser(true, 'admin');
            if (adminRes) return adminRes;
          } catch (adminErr) {
            if (
              adminErr.status === 429 ||
              adminErr.pendingApproval ||
              adminErr.requiresEmailVerification ||
              adminErr.accountDeactivated
            ) {
              throw adminErr;
            }
          }
          const companyRes = await tryCompany({ allowAdminFallback: false });
          if (companyRes) return companyRes;
        } else {
          const res = await tryCompany({ allowAdminFallback: true });
          if (res) return res;
          const adminRes = await tryGeneralUser(true, 'admin');
          if (adminRes) return adminRes;
        }
      } else if (expectedRole && expectedRole !== 'student' && expectedRole !== 'company') {
        const res = await tryGeneralUser(true);
        if (res) return res;
      }

      // Unified login without a selected role: one provider per submit to avoid
      // tripling auth traffic (general + student + company) against rate limits.
      if (!expectedRole) {
        const generalResult = await tryGeneralUser(false);
        if (generalResult) return generalResult;

        throw new Error(
          'Invalid email or password. Use the correct login page for your account type (Student, Company, or Trainer).',
        );
      }

      throw new Error('Invalid email or password');
    } catch (err) {
      const message = resolveAuthErrorMessage(err, AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
      setError(message);
      throw Object.assign(err instanceof Error ? err : new Error(message), { message });
    }
  };

  const setAuthUser = (userData) => {
    if (userData) {
      const sessionToken =
        userData.accessToken
        || userData.token
        || authService.getValidToken();

      if (!sessionToken) {
        setUser(null);
        setUserRole(null);
        setIsAuthenticated(false);
        return;
      }

      const normalizedUser = normalizeAuthUser(userData);
      if (!isKnownPortalRole(normalizedUser?.role, normalizedUser?.email)) {
        authService.logout();
        setUser(null);
        setUserRole(null);
        setIsAuthenticated(false);
        return;
      }

      if (typeof window !== 'undefined' && sessionToken) {
        localStorage.setItem('authToken', sessionToken);
        localStorage.setItem('accessToken', sessionToken);
        setAuthCookie(sessionToken);
      }

      setUser(normalizedUser);
      if (normalizedUser.role) {
        setUserRole(normalizedUser.role);
      }
      setIsAuthenticated(true);
      markPortalLoginSession();
    } else {
      setUser(null);
      setUserRole(null);
      setIsAuthenticated(false);
    }
  };

  const logout = async () => {
    setError(null);
    try {
      await authService.logout();
      setUser(null);
      setUserRole(null);
      setIsAuthenticated(false);
    } catch {
      // Ignore logout failures and ensure redirect on caller side.
    }
    if (typeof window !== 'undefined') {
      window.location.replace('/');
    }
  };

  const value = useMemo(
    () => ({
      user,
      currentUser: user,
      userRole,
      isAuthenticated,
      loading,
      error,
      registerStudent,
      loginStudent,
      registerCompany,
      loginCompany,
      login,
      setAuthUser,
      logout,
      setError,
    }),
    [user, userRole, isAuthenticated, loading, error, registerStudent, loginStudent, registerCompany, loginCompany, login, setAuthUser, logout, setError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;




