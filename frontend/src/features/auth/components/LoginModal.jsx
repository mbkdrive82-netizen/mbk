"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  XMarkIcon,
  UserIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from 'next/navigation';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { safeRouterReplace } from "@/utils/safeRouterNavigation";
import Image from 'next/image';
import Link from 'next/link';

import { useAuth } from "@/context/AuthContext";
import authService, { studentAuthService, companyAuthService } from "@/services/authService";
import {
  forgotPassword,
  verifyResetOTP,
  resetPassword,
} from "@/services/api";
import CTAButton from "@/components/common/CTAButton";
import "@/features/auth/components/login.css";
import { getDashboardRouteByRole } from "@/utils/authRoles";
import { prefetchPortalRoutes } from "@/utils/portalPrefetch";
import { warmPortalDataBundle } from "@/utils/portalDataPrefetch";
import notify from "@/lib/toast";
import { validateLoginForm, PASSWORD_MIN_LENGTH, hasLoginCredentials } from "@/utils/authValidation";

const ACCOUNT_TYPES = [
  { id: "trainer", label: "Trainer" },
  { id: "student", label: "Student" },
  { id: "company", label: "Company" },
];

const LoginModal = ({ isOpen, onClose }) => {
  const router = useRouter();
  const { isRouterReady } = useSafeRouter();
  const { login, currentUser, isAuthenticated, loading: authLoading } = useAuth();
  const [accountType, setAccountType] = useState("trainer");

  const navigateAfterLogin = async (route, role, email) => {
    // Navigate immediately so the user lands on their dashboard without waiting
    // for portal data warmup. Warming runs in the background (non-blocking) to
    // avoid the perceived "stuck on home, then dashboard" delay after login.
    safeRouterReplace(router, route);

    if (typeof window !== "undefined") {
      Promise.resolve()
        .then(() => prefetchPortalRoutes(router, role, email))
        .then(() => warmPortalDataBundle())
        .catch((error) =>
          console.warn("Portal data warmup failed (non-blocking):", error),
        );
    }
  };

  // Login State
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);




  // Password Reset State
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState("");
  const [resetOTP, setResetOTP] = useState("");

  const [tempToken, setTempToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  // Password Visibility & Strength
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const calculateStrength = (password) => {
    let strength = 0;
    if (password.length >= 6) strength += 25;
    if (password.match(/[A-Z]/)) strength += 25;
    if (password.match(/[0-9]/)) strength += 25;
    if (password.match(/[^A-Za-z0-9]/)) strength += 25;
    return strength;
  };

  const handlePasswordChange = (e) => {
    const pass = e.target.value;
    setNewPassword(pass);
    setPasswordStrength(calculateStrength(pass));
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  useEffect(() => {
    if (!isRouterReady || !isOpen || authLoading || !currentUser || !isAuthenticated) return;
    if (!authService.getValidToken()) return;
    void navigateAfterLogin(
      getDashboardRouteByRole(currentUser.role, currentUser.email),
      currentUser.role,
      currentUser.email,
    );
  }, [isRouterReady, isOpen, authLoading, currentUser, isAuthenticated, router]);

  if (!isOpen) return null;

  // Password Reset Handlers
  const handleForgotPasswordClick = () => {
    setIsFlipped(true);
    setResetStep(1);
    setResetEmail("");
    setResetOTP("");
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetSuccess("");
  };

  const handleBackToLogin = () => {
    setIsFlipped(false);
    setResetStep(1);
    setResetError("");
    setResetSuccess("");
  };

  const canSubmitLogin = hasLoginCredentials(formData);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateLoginForm(formData);
    if (validationError) {
      setError(validationError);
      notify.error(validationError);
      return;
    }

    setError("");
    setLoading(true);
    try {
      const loginEmail = formData.email.trim().toLowerCase();
      const userData = await login(loginEmail, formData.password, {
        expectedRole: accountType,
        preferAdminFirst: accountType === "company",
      });
      const dashboardRoute = getDashboardRouteByRole(userData.role, userData.email);
      
      // Use successAndNavigate which handles both notification and navigation
      await notify.successAndNavigate("Login successful", async () => {
        onClose();
        await navigateAfterLogin(dashboardRoute, userData.role, userData.email);
      });
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
      if (!isExpectedAuthState && err.status !== 400) {
        // Only log truly unexpected errors (network, server, timeout)
        console.error("Login Error:", err);
      }
      const message = err.pendingApproval
        ? err.message || "Your account is pending admin approval."
        : err.requiresEmailVerification
          ? err.message || "Please verify your email before signing in."
          : err.roleMismatch
            ? err.message || "This email is not registered for the selected account type."
            : err.accountDeactivated
              ? err.message || "Your account has been deactivated."
              : err.message || "Invalid email or password.";
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  const getPasswordResetHandlers = () => {
    if (accountType === "student") {
      return {
        sendOtp: (email) => studentAuthService.forgotPassword(email),
        verifyOtp: (email, otp) => studentAuthService.verifyResetOtp(email, otp),
        reset: (token, password) => studentAuthService.resetPassword(token, password),
      };
    }
    if (accountType === "company") {
      return {
        sendOtp: (email) => companyAuthService.forgotPassword(email),
        verifyOtp: (email, otp) => companyAuthService.verifyResetOtp(email, otp),
        reset: (token, password) => companyAuthService.resetPassword(token, password),
      };
    }
    return {
      sendOtp: (email) => forgotPassword(email),
      verifyOtp: (email, otp) => verifyResetOTP(email, otp),
      reset: (token, password) => resetPassword(token, password),
    };
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);

    try {
      const normalizedEmail = String(resetEmail || "").trim().toLowerCase();
      const { sendOtp } = getPasswordResetHandlers();
      const response = await sendOtp(normalizedEmail);
      if (response.success === false) {
        throw new Error(response.message || "Failed to send OTP");
      }
      setResetSuccess(response.message || "OTP sent to your email!");
      setResetStep(2);
    } catch (err) {
      setResetError(err.message || "Failed to send OTP");
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);

    try {
      const normalizedEmail = String(resetEmail || "").trim().toLowerCase();
      const normalizedOtp = String(resetOTP || "").replace(/\D/g, "").slice(0, 6);
      const { verifyOtp } = getPasswordResetHandlers();
      const response = await verifyOtp(normalizedEmail, normalizedOtp);
      if (response.success === false) {
        throw new Error(response.message || "Invalid or expired OTP");
      }
      setTempToken(response.tempToken);
      setResetSuccess("OTP verified! Set your new password.");
      setResetStep(3);
    } catch (err) {
      setResetError(err.message || "Invalid or expired OTP");
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError("");

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setResetError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match");
      return;
    }

    setResetLoading(true);

    try {
      const { reset } = getPasswordResetHandlers();
      const response = await reset(tempToken, newPassword);
      if (response.success === false) {
        throw new Error(response.message || "Failed to reset password");
      }
      setResetSuccess(response.message || "Password reset successfully!");

      setTimeout(() => {
        handleBackToLogin();
      }, 2000);
    } catch (err) {
      setResetError(err.message || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="login-modal-overlay">
      <div className="login-modal-container">
        <button
          className="login-modal-close"
          onClick={onClose}
          aria-label="Close Modal"
        >
          <XMarkIcon style={{ width: "24px", height: "24px" }} />
        </button>

        <div className="login-left-panel">
          <Image
            src="/logos/mbkz-256.png"
            alt="MBK CarrierZ Logo"
            className="login-brand-logo"
            width={120}
            height={40}
            loading="lazy"
            sizes="120px"
          />
          <h2 className="login-welcome-title">Login to MBK CarrierZ</h2>
          <p className="login-welcome-subtitle">Student • Trainer • Company • Super Admin</p>
        </div>

        <div className="login-right-panel">
          <div className="login-flip-wrapper">
            <div className={`login-flipper ${isFlipped ? "flipped" : ""}`}>
              {/* FRONT FACE: LOGIN */}
              <div className="login-face login-front">
                {error && (
                  <div className="login-alert login-alert-error" role="alert">
                    {error}
                  </div>
                )}

                {accountType === "company" && (
                  <p className="login-company-admin-hint">
                    Corporate partners and MBK Super Admin accounts both sign in on the Company tab.
                  </p>
                )}

                <div className="login-account-tabs" role="tablist" aria-label="Account type">
                  {ACCOUNT_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      role="tab"
                      aria-selected={accountType === type.id}
                      className={`login-account-tab${accountType === type.id ? " active" : ""}`}
                      onClick={() => {
                        setAccountType(type.id);
                        setError("");
                      }}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>

                <form className="login-form" onSubmit={handleSubmit} noValidate>
                  <div className="login-input-group">
                    <label htmlFor="email" className="login-input-label">
                        Email Address
                    </label>
                    <div className="login-input-wrapper">
                      <UserIcon className="login-input-icon" />
                      <input
                          id="email"
                          type="email"
                          name="email"
                          autoComplete="email"
                        className="login-input"
                          placeholder="Enter your email"
                          value={formData.email}
                        onChange={handleChange}
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="login-input-group">
                    <label htmlFor="password" className="login-input-label">
                      Password
                    </label>
                    <div
                      className="login-input-wrapper"
                      style={{ position: "relative" }}
                    >
                      <LockClosedIcon className="login-input-icon" />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete="current-password"
                        className="login-input"
                        placeholder="Enter password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        disabled={loading}
                        style={{ paddingRight: "40px" }}
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
                          right: "8px",
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
                          color: "#666",
                          touchAction: "manipulation",
                        }}
                      >
                        {showPassword ? (
                          <EyeSlashIcon
                            style={{ width: "20px", height: "20px" }}
                          />
                        ) : (
                          <EyeIcon style={{ width: "20px", height: "20px" }} />
                        )}
                      </button>
                    </div>
                  </div>



                  <div className="login-options">
                    <a
                      href="#"
                      className="login-forgot-link"
                      onClick={(e) => {
                        e.preventDefault();
                        handleForgotPasswordClick();
                      }}
                    >
                      Forgot Password?
                    </a>
                  </div>

                  <CTAButton
                    type="submit"
                    variant="brand"
                    size="lg"
                    fullWidth
                    loading={loading}
                    disabled={loading || !canSubmitLogin}
                    loadingText="Logging in..."
                    className="login-btn"
                  >
                    Login
                  </CTAButton>
                </form>

                <p className="login-register-text">
                  New user?{' '}
                  <Link
                    href="/#register-section"
                    onClick={(e) => {
                      e.preventDefault();
                      onClose();
                      setTimeout(() => {
                        const el = document.getElementById("register-section");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      }, 300);
                    }}
                    className="login-register-link"
                  >
                    Register here
                  </Link>
                </p>
              </div>

              {/* BACK FACE: FORGOT PASSWORD */}
              <div className="login-face login-back">
                <h3 className="login-back-title">
                  {resetStep === 1 && "Forgot Password?"}
                  {resetStep === 2 && "Verify OTP"}
                  {resetStep === 3 && "Set New Password"}
                </h3>
                <p className="login-back-subtitle">
                  {resetStep === 1 &&
                    `Enter your ${accountType} account email to receive a reset code`}
                  {resetStep === 2 &&
                    "Enter the 6-digit code sent to your email"}
                  {resetStep === 3 && "Create a new password for your account"}
                </p>

                {resetSuccess && (
                  <div className="login-alert login-alert-success" aria-live="polite">
                    {resetSuccess}
                  </div>
                )}

                {resetError && (
                  <div className="login-alert login-alert-error" role="alert">
                    {resetError}
                  </div>
                )}

                {resetStep === 1 && (
                  <form className="login-form" onSubmit={handleSendOTP}>
                    <div className="login-input-group">
                      <label htmlFor="resetEmail" className="login-input-label">
                        Email Address
                      </label>
                      <div className="login-input-wrapper">
                        <UserIcon className="login-input-icon" />
                        <input
                          id="resetEmail"
                          name="email"
                          autoComplete="email"
                          type="email"
                          className="login-input"
                          placeholder="Enter your email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <CTAButton
                      type="submit"
                      variant="brand"
                      size="md"
                      fullWidth
                      loading={resetLoading}
                      loadingText="Sending..."
                    >
                      Send OTP
                    </CTAButton>
                  </form>
                )}

                {resetStep === 2 && (
                  <form className="login-form" onSubmit={handleVerifyOTP}>
                    <div className="login-input-group">
                      <label htmlFor="resetOTP" className="login-input-label">
                        Enter OTP
                      </label>
                      <input
                        id="resetOTP"
                        name="otp"
                        autoComplete="one-time-code"
                        type="text"
                        className="login-input"
                        placeholder="Enter 6-digit code"
                        value={resetOTP}
                        onChange={(e) =>
                          setResetOTP(
                            e.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                        }
                        maxLength="6"
                        style={{
                          textAlign: "center",
                          letterSpacing: "8px",
                          fontSize: "1.2rem",
                        }}
                        required
                      />
                    </div>
                    <CTAButton
                      type="submit"
                      variant="brand"
                      size="md"
                      fullWidth
                      loading={resetLoading}
                      loadingText="Verifying..."
                    >
                      Verify OTP
                    </CTAButton>
                    <button
                      type="button"
                      className="login-back-btn"
                      onClick={() => setResetStep(1)}
                      style={{ marginTop: "12px" }}
                    >
                      Resend OTP
                    </button>
                  </form>
                )}

                {resetStep === 3 && (
                  <form className="login-form" onSubmit={handleResetPassword}>
                    <div className="login-input-group">
                      <label
                        htmlFor="newPassword"
                        className="login-input-label"
                      >
                        New Password
                      </label>
                      <div
                        className="login-input-wrapper"
                        style={{ position: "relative" }}
                      >
                        <LockClosedIcon className="login-input-icon" />
                        <input
                          id="newPassword"
                          name="newPassword"
                          autoComplete="new-password"
                          type={showNewPassword ? "text" : "password"}
                          className="login-input"
                          placeholder="Enter new password"
                          value={newPassword}
                          onChange={handlePasswordChange}
                          required
                          minLength={PASSWORD_MIN_LENGTH}
                          style={{ paddingRight: "40px" }}
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setShowNewPassword((prev) => !prev);
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          aria-label={showNewPassword ? "Hide password" : "Show password"}
                          aria-pressed={showNewPassword}
                          style={{
                            position: "absolute",
                            right: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#6b7280",
                            minWidth: "36px",
                            minHeight: "36px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {showNewPassword ? (
                            <EyeSlashIcon
                              style={{ width: "20px", height: "20px" }}
                            />
                          ) : (
                            <EyeIcon
                              style={{ width: "20px", height: "20px" }}
                            />
                          )}
                        </button>
                      </div>
                      {newPassword && (
                        <div style={{ marginTop: "5px" }}>
                          <div
                            style={{
                              height: "4px",
                              width: "100%",
                              backgroundColor: "#e5e7eb",
                              borderRadius: "2px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${passwordStrength}%`,
                                backgroundColor:
                                  passwordStrength < 50
                                    ? "#ef4444"
                                    : passwordStrength < 75
                                      ? "#f59e0b"
                                      : "#10b981",
                                transition:
                                  "width 0.3s ease, background-color 0.3s ease",
                              }}
                            />
                          </div>
                          <p
                            style={{
                              fontSize: "0.75rem",
                              color:
                                passwordStrength < 50
                                  ? "#ef4444"
                                  : passwordStrength < 75
                                    ? "#f59e0b"
                                    : "#10b981",
                              marginTop: "2px",
                              textAlign: "right",
                            }}
                          >
                            {passwordStrength < 50
                              ? "Weak"
                              : passwordStrength < 75
                                ? "Medium"
                                : "Strong"}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="login-input-group">
                      <label
                        htmlFor="confirmPassword"
                        className="login-input-label"
                      >
                        Confirm Password
                      </label>
                      <div
                        className="login-input-wrapper"
                        style={{ position: "relative" }}
                      >
                        <LockClosedIcon className="login-input-icon" />
                        <input
                          id="confirmPassword"
                          name="confirmPassword"
                          autoComplete="new-password"
                          type={showConfirmPassword ? "text" : "password"}
                          className="login-input"
                          placeholder="Confirm new password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={PASSWORD_MIN_LENGTH}
                          style={{ paddingRight: "40px" }}
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setShowConfirmPassword((prev) => !prev);
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          aria-pressed={showConfirmPassword}
                          style={{
                            position: "absolute",
                            right: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#6b7280",
                            minWidth: "36px",
                            minHeight: "36px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {showConfirmPassword ? (
                            <EyeSlashIcon
                              style={{ width: "20px", height: "20px" }}
                            />
                          ) : (
                            <EyeIcon
                              style={{ width: "20px", height: "20px" }}
                            />
                          )}
                        </button>
                      </div>
                    </div>
                    <CTAButton
                      type="submit"
                      variant="brand"
                      size="md"
                      fullWidth
                      loading={resetLoading}
                      loadingText="Resetting..."
                    >
                      Reset Password
                    </CTAButton>
                  </form>
                )}

                <button className="login-back-btn" onClick={handleBackToLogin}>
                  Back to Login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
