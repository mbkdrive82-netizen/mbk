"use client";

import { useEffect, useRef, useState } from "react";
import mbkLogo from "@/assets/mbk_tech_cyan.png";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { API_BASE_URL } from "@/services/api";
import authService, { setAuthCookie } from "@/services/authService";
import { isFirebaseConfigured } from "@/services/firebase";

import { User, Lock, Eye, EyeOff, Home } from "lucide-react";
import EmailOTP from "@/features/auth/components/EmailOTP";
import CTAButton from "@/components/common/CTAButton";
import OptimizedImage from "@/components/common/OptimizedImage";
import {
  AUTH_ROLES,
  normalizeAuthRole,
  normalizeAuthUser,
  getDashboardRouteByRole,
  roleToLoginType,
  isKnownPortalRole,
} from "@/utils/authRoles";
import { prefetchPortalRoutes } from "@/utils/portalPrefetch";
import { warmPortalDataBundle } from "@/utils/portalDataPrefetch";
import notify from "@/lib/toast";
import { validateLoginForm, hasLoginCredentials } from "@/utils/authValidation";
import "@/features/auth/components/login.css";

const Login = ({ specificRole, inModal = false, onSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [queryLoginType, setQueryLoginType] = useState("");
  const [queryRedirect, setQueryRedirect] = useState("");
  const { login, setAuthUser, currentUser, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { safeReplace, isRouterReady } = useSafeRouter();

  const resolvePostLoginRoute = (role, userEmail) => {
    if (
      queryRedirect &&
      queryRedirect.startsWith("/") &&
      !queryRedirect.startsWith("//") &&
      !["/login", "/signup", "/forgot-password", "/trainer-signup"].some(
        (route) => queryRedirect === route || queryRedirect.startsWith(`${route}/`),
      )
    ) {
      return queryRedirect;
    }

    return getDashboardRouteByRole(role, userEmail);
  };

  const navigateAfterLogin = async (route, role, email) => {
    console.debug("[AUTH] redirecting after login:", { route, role, email });

    // Use a hard redirect for protected portal routes so the Next.js middleware
    // reads the freshly-set auth cookie on the very first request and allows
    // access immediately — soft (client-side) navigation doesn't send the cookie
    // to the middleware, causing a momentary home-page flash before the dashboard loads.
    const isPortalRoute =
      route.startsWith("/dashboard") ||
      route.startsWith("/spoc") ||
      route.startsWith("/trainer") ||
      route.startsWith("/student") ||
      route.startsWith("/company") ||
      route.startsWith("/accountant");

    if (typeof window !== "undefined" && isPortalRoute) {
      // Background warmup before the hard redirect
      try {
        prefetchPortalRoutes(router, role, email);
        warmPortalDataBundle();
      } catch {
        // Non-blocking; ignore warmup errors
      }
      window.location.href = route;
      return;
    }

    // Fallback: soft navigation for non-portal or SSR paths
    safeReplace(route);
  };

  useEffect(() => {
    if (!isRouterReady || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") || "";
    const redirect = params.get("redirect") || "";

    setQueryLoginType(type);
    setQueryRedirect(redirect);
  }, [isRouterReady, safeReplace]);

  // Redirect to home when user presses the browser Back button from the login page
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      window.location.replace("/");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!isRouterReady || authLoading || loading || !currentUser || !isAuthenticated) return;
    if (!authService.getValidToken()) return;
    if (!isKnownPortalRole(currentUser.role, currentUser.email)) return;

    const targetRoute = resolvePostLoginRoute(currentUser.role, currentUser.email);
    if (targetRoute.startsWith("/login")) return;

    void navigateAfterLogin(
      targetRoute,
      currentUser.role,
      currentUser.email,
    );
  }, [authLoading, isRouterReady, loading, currentUser, isAuthenticated, queryRedirect, router]);

  // Determine login type
  let loginType = ""; // Unified/common default
  if (specificRole) {
    loginType = roleToLoginType(specificRole);
  } else if (queryLoginType === "admin") {
    loginType = roleToLoginType(AUTH_ROLES.SUPER_ADMIN);
  } else if (queryLoginType === "spoc") {
    loginType = roleToLoginType(AUTH_ROLES.SPOC);
  } else if (queryLoginType === "trainer") {
    loginType = roleToLoginType(AUTH_ROLES.TRAINER);
  } else if (queryLoginType === "student") {
    loginType = "student";
  } else if (queryLoginType === "company") {
    loginType = "company";
  } else if (
    queryRedirect.startsWith("/dashboard") ||
    queryRedirect.startsWith("/accountant")
  ) {
    loginType = roleToLoginType(AUTH_ROLES.SUPER_ADMIN);
  } else if (queryRedirect.startsWith("/spoc")) {
    loginType = roleToLoginType(AUTH_ROLES.SPOC);
  } else if (queryRedirect.startsWith("/trainer")) {
    loginType = roleToLoginType(AUTH_ROLES.TRAINER);
  } else if (queryRedirect.startsWith("/student")) {
    loginType = "student";
  } else if (queryRedirect.startsWith("/company")) {
    loginType = "company";
  }
  const showGoogleSignIn =
    isFirebaseConfigured() &&
    (inModal || !loginType || loginType === "trainer" || loginType === "admin" || loginType === "student" || loginType === "company");

  // Toggle between Email/Password and OTP Login
  const [useOtpLogin, setUseOtpLogin] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      const { signInWithGoogle } = await import("@/services/firebase");
      const googleUser = await signInWithGoogle();

      // Backend exchange
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: googleUser.email,
          name: googleUser.displayName,
          googleId: googleUser.uid,
          photoURL: googleUser.photoURL,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Google Login failed");
      }

      // Success
      const normalizedUser = normalizeAuthUser(data.user);
      console.debug("[AUTH] Google login succeeded:", { role: normalizedUser.role, email: normalizedUser.email });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("authToken", data.accessToken);
      setAuthCookie(data.accessToken);
      setAuthUser({ ...normalizedUser, accessToken: data.accessToken });

      await notify.successAndNavigate(
        "Login successful",
        () =>
          navigateAfterLogin(
            resolvePostLoginRoute(normalizedUser.role, normalizedUser.email),
            normalizedUser.role,
            normalizedUser.email,
          ),
      );
      onSuccess?.();
    } catch (err) {
      console.error("Google Login Error:", err);
      setError(err.message || "Failed to sign in with Google");
    } finally {
      setLoading(false);
    }
  };

  // --- THEME STYLES (Color matched with landing page) ---
  const styles = {
    container: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "linear-gradient(180deg, #fff7f0 0%, #ffe8d5 52%, #fff4eb 100%)",
    },
    glassCard: {
      background: "linear-gradient(180deg, #ffffff 0%, #fffbf7 100%)",
      border: "1px solid rgba(249, 115, 22, 0.35)",
      borderRadius: "20px",
      padding: "40px",
      width: "100%",
      maxWidth: "450px",
      boxShadow: "0 10px 30px rgba(120, 60, 10, 0.08)",
      color: "#5c3a1a",
    },
    title: {
      fontSize: inModal ? "1.6rem" : "2rem",
      fontWeight: "bold",
      marginBottom: "2rem",
      textAlign: "center",
      textTransform: "uppercase",
      letterSpacing: "1px",
      color: "#5c3a1a",
      lineHeight: "1.2",
    },
    inputContainer: {
      marginBottom: "1.5rem",
      position: "relative",
    },
    label: {
      display: "block",
      marginBottom: "0.5rem",
      fontSize: "0.875rem",
      fontWeight: "500",
      color: "#7a5230",
    },
    input: {
      width: "100%",
      backgroundColor: "#fffbf7",
      border: "none",
      borderBottom: "1px solid rgba(120, 60, 10, 0.25)",
      padding: "0.5rem 0.5rem 0.5rem 2rem",
      color: "#3b1a06",
      fontSize: "1rem",
      transition: "all 0.3s ease",
      outline: "none",
    },
    icon: {
      position: "absolute",
      left: "0",
      top: "0.5rem",
      color: "rgba(120, 60, 10, 0.5)",
      height: "1.25rem",
      width: "1.25rem",
    },
    button: {
      width: "100%",
      padding: "0.75rem",
      background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
      border: "none",
      color: "#ffffff",
      fontWeight: "bold",
      textTransform: "uppercase",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.3s ease",
      marginTop: "1rem",
      boxShadow: "0 6px 18px rgba(249, 115, 22, 0.22)",
    },
    link: {
      color: "#f97316",
      textDecoration: "none",
      fontSize: "0.875rem",
      transition: "color 0.3s ease",
      cursor: "pointer",
    },
  };

  if (inModal) {
    styles.container = {
      minHeight: "auto",
      display: "block",
      padding: 0,
      background: "transparent",
    };
    styles.glassCard = {
      ...styles.glassCard,
      background:
        "linear-gradient(165deg, rgba(8, 30, 49, 0.98) 0%, rgba(7, 25, 41, 0.98) 100%)",
      border: "1px solid rgba(118, 168, 208, 0.45)",
      color: "#eaf4fd",
      maxWidth: "100%",
      borderRadius: "16px",
      padding: "28px",
      boxShadow: "none",
    };
    styles.label = {
      ...styles.label,
      color: "#d8eafb",
    };
    styles.input = {
      ...styles.input,
      border: "1px solid rgba(123, 170, 208, 0.44)",
      borderBottom: "1px solid rgba(123, 170, 208, 0.44)",
      borderRadius: "10px",
      backgroundColor: "rgba(9, 35, 55, 0.7)",
      color: "#f0f7ff",
      padding: "0.72rem 0.8rem 0.72rem 2.3rem",
    };
    styles.icon = {
      ...styles.icon,
      left: "0.7rem",
      top: "0.75rem",
      color: "#95c9f1",
    };
    styles.button = {
      ...styles.button,
      border: "1px solid rgba(122, 175, 217, 0.52)",
      borderRadius: "10px",
      backgroundColor: "rgba(13, 67, 102, 0.85)",
      boxShadow: "0 8px 14px rgba(5, 24, 40, 0.28)",
      textTransform: "none",
    };
  }

  const handleInputFocus = (e) =>
    (e.target.style.borderBottom = "1px solid #f97316");
  const handleInputBlur = (e) =>
    (e.target.style.borderBottom = "1px solid rgba(120, 60, 10, 0.25)");
  const handleButtonEnter = (e) => {
    e.currentTarget.style.boxShadow = "0 8px 24px rgba(249, 115, 22, 0.35)";
    e.currentTarget.style.transform = "translateY(-1px)";
  };
  const handleButtonLeave = (e) => {
    e.currentTarget.style.boxShadow = "0 6px 18px rgba(249, 115, 22, 0.22)";
    e.currentTarget.style.transform = "translateY(0)";
  };


  const canSubmitLogin = hasLoginCredentials({ email, password });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateLoginForm({ email, password });
    if (validationError) {
      setError(validationError);
      notify.error(validationError);
      return;
    }

    try {
      setError("");
      setLoading(true);

      const loginEmail = email.trim().toLowerCase();

      const userData = await login(loginEmail, password, {
        expectedRole: loginType,
      });
      console.debug("[AUTH] login succeeded:", { role: userData.role, email: userData.email });

      await notify.successAndNavigate(
        "Login successful",
        () =>
          navigateAfterLogin(
            resolvePostLoginRoute(userData.role, userData.email),
            userData.role,
            userData.email,
          ),
      );
      onSuccess?.();
    } catch (err) {
      const isExpectedAuthState =
        err.pendingApproval ||
        err.requiresEmailVerification ||
        err.roleMismatch ||
        err.accountDeactivated ||
        err.status === 401 ||
        err.status === 429 ||
        err.message === 'Invalid email or password' ||
        err.message?.startsWith('Invalid email or password') ||
        err.message?.toLowerCase().includes('too many');
      if (isExpectedAuthState) {
        console.debug("[AUTH] login blocked:", err.message);
      } else if (err.status !== 400) {
        // Only log truly unexpected errors (network, server, timeout)
        console.warn("Login Error:", err);
      }
      const message = err.pendingApproval
        ? err.message || "Your account is pending admin approval."
        : err.requiresEmailVerification
          ? err.message || "Please verify your email before signing in."
          : err.roleMismatch
            ? err.message || "This email is not registered for the selected account type."
          : err.message || "Invalid email or password";
      setError(message);
      notify.error(message);
      if (err.requiresEmailVerification) {
          setUseOtpLogin(true);
      }
    } finally {
      setLoading(false);
    }
  };
  const handleMsg91Success = async (result) => {
    console.log("MSG91 Login Success:", result);

    if (result.success && result.user && result.accessToken) {
      const normalizedUser = normalizeAuthUser(result.user);
      console.debug("[AUTH] OTP login succeeded:", { role: normalizedUser.role, email: normalizedUser.email });
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("authToken", result.accessToken);
      localStorage.setItem("user", JSON.stringify(normalizedUser));
      setAuthCookie(result.accessToken);
      setAuthUser({ ...normalizedUser, accessToken: result.accessToken });

      await notify.successAndNavigate(
        "Login successful",
        () =>
          navigateAfterLogin(
            resolvePostLoginRoute(normalizedUser.role, normalizedUser.email),
            normalizedUser.role,
            normalizedUser.email,
          ),
      );
      onSuccess?.();
    }
  };

  return (
    <div
      className={inModal ? "" : "login-page-wrapper"}
      style={styles.container}
    >
      <div
        className={inModal ? "" : "login-page-card"}
        style={styles.glassCard}
      >
        {/* Home button — top-left of card */}
        {!inModal && (
          <div style={{ marginBottom: '1rem' }}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#f97316',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(249,115,22,0.3)',
                background: 'rgba(249,115,22,0.06)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(249,115,22,0.15)';
                e.currentTarget.style.borderColor = 'rgba(249,115,22,0.6)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(249,115,22,0.06)';
                e.currentTarget.style.borderColor = 'rgba(249,115,22,0.3)';
              }}
            >
              <Home size={14} aria-hidden="true" />
              Home
            </Link>
          </div>
        )}

        <div className="flex flex-col items-center mb-6">
          <OptimizedImage
            src={mbkLogo}
            alt="MBK Tech"
            width={60}
            height={60}
            priority={true}
            style={{ height: "60px", width: "auto", marginBottom: "1rem" }}
          />
          <h2 style={styles.title}>
            {loginType === "trainer" && (
              <>
                TRAINER
                <br />
                LOGIN
              </>
            )}
            {loginType === "spoc" && (
              <>
                SPOC ADMIN
                <br />
                LOGIN
              </>
            )}
            {loginType === "student" && (
              <>
                STUDENT
                <br />
                LOGIN
              </>
            )}
            {loginType === "company" && (
              <>
                COMPANY
                <br />
                LOGIN
              </>
            )}
            {!["trainer", "spoc", "student", "company"].includes(
              loginType,
            ) && (
              <>
                SIGN IN
                <br />
                YOUR ACCOUNT
              </>
            )}
          </h2>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-100 p-3 rounded mb-4 text-center">
            {error}
          </div>
        )}

        {useOtpLogin ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <EmailOTP
              email={email}
              password={password}
              onSuccess={() => {
                setUseOtpLogin(false);
                handleSubmit({ preventDefault: () => {} });
              }}
              onCancel={() => setUseOtpLogin(false)}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off" noValidate>
            <input
              type="text"
              name="fake_username"
              autoComplete="username"
              style={{ display: "none" }}
              tabIndex={-1}
              aria-hidden="true"
            />
            <input
              type="password"
              name="fake_password"
              autoComplete="new-password"
              style={{ display: "none" }}
              tabIndex={-1}
              aria-hidden="true"
            />
            <div style={styles.inputContainer}>
              <label style={styles.label}>Email or Username :</label>
              <div style={{ position: "relative" }}>
                <User style={{ ...styles.icon, top: "0.2rem" }} />
                <input
                  type="text"
                  name="login_email"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder="Enter your email *"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div style={styles.inputContainer}>
              <label style={styles.label}>Password :</label>
              <div style={{ position: "relative" }}>
                <Lock style={{ ...styles.icon, top: "0.2rem" }} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="login_password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...styles.input, paddingRight: "2.75rem" }}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder="Enter your password *"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setShowPassword((prev) => !prev);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  style={{
                    position: "absolute",
                    right: "4px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    padding: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "36px",
                    minHeight: "36px",
                    color: inModal ? "#95c9f1" : "rgba(120, 60, 10, 0.55)",
                    touchAction: "manipulation",
                  }}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>



            <div className="flex items-center justify-between mt-8 w-full">
              <CTAButton
                type="submit"
                variant="brand"
                size="lg"
                fullWidth
                loading={loading}
                disabled={loading || !canSubmitLogin}
                loadingText="Signing in..."
              >
                LOGIN
              </CTAButton>
            </div>

            <div className="mt-6 text-center space-y-3">
              <div className="flex justify-between text-sm pt-4 border-t border-gray-100/10">
                <Link href="/forgot-password" style={styles.link}>Forgot password?</Link>
                <Link href="/signup" style={{ ...styles.link, fontWeight: 'bold' }}>Sign Up</Link>
              </div>

              {showGoogleSignIn && (
                <div className="mt-4 pt-4 border-t border-gray-100/10">
                  <CTAButton
                    type="button"
                    onClick={handleGoogleSignIn}
                    loading={loading}
                    disabled={loading}
                    variant="secondary"
                    fullWidth
                    className="w-full bg-white text-gray-700 font-semibold py-2 px-4 rounded-md shadow hover:shadow-md transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ transition: "all 0.3s ease" }}
                    iconLeft={
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    }
                  >
                    Sign in with Google
                  </CTAButton>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
