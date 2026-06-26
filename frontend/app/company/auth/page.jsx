'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '../../../src/context/AuthContext';
import authService from '../../../src/services/authService';
import { getDashboardRouteByRole } from '../../../src/utils/authRoles';
import notify from '../../../src/lib/toast';
import CTAButton from '../../../src/components/common/CTAButton';
import PasswordInputWithToggle from '../../../src/components/common/PasswordInputWithToggle';
import {
  sanitizePhoneInput,
  validateLoginForm,
  validateCompanySignup,
  hasLoginCredentials,
  PASSWORD_MIN_LENGTH,
} from '../../../src/utils/authValidation';

export default function CompanyAuthPage() {
  const router = useRouter();
  const { safeReplace, safePush, isRouterReady } = useSafeRouter();
  const searchParams = useSearchParams();
  const queryRedirect = searchParams.get('redirect') || '';
  const {
    registerCompany,
    loginCompany,
    login,
    isAuthenticated,
    userRole,
    loading: authLoading,
  } = useAuth();

  const [isLoginMode, setIsLoginMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    adminName: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    password: '',
    confirmPassword: '',
  });
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isRouterReady || authLoading || loading) return;
    if (!isAuthenticated || !authService.getValidToken()) return;

    const destination =
      queryRedirect && queryRedirect.startsWith('/')
        ? queryRedirect
        : getDashboardRouteByRole(userRole);
    safeReplace(destination);
  }, [
    authLoading,
    isAuthenticated,
    isRouterReady,
    loading,
    queryRedirect,
    safeReplace,
    userRole,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateMobileLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateMobileLayout();
    mediaQuery.addEventListener('change', updateMobileLayout);
    return () => mediaQuery.removeEventListener('change', updateMobileLayout);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'phone' ? sanitizePhoneInput(value) : value;
    setFormData({ ...formData, [name]: nextValue });
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();

    if (isLoginMode) {
      const loginError = validateLoginForm({
        email: formData.email,
        password: formData.password,
      });
      if (loginError) {
        notify.error(loginError);
        return;
      }

      setLoading(true);
      const email = formData.email.trim().toLowerCase();
      const password = formData.password;

      const result = await loginCompany(email, password);

      if (result.success && authService.getValidToken()) {
        const companyRoute =
          queryRedirect && queryRedirect.startsWith('/company')
            ? queryRedirect
            : '/company/dashboard';
        await notify.successAndNavigate('Login successful', () =>
          safeReplace(companyRoute),
        );
        setLoading(false);
        return;
      }

      try {
        // Super Admin accounts use /api/auth/login (users collection).
        const adminUser = await login(email, password, { expectedRole: 'admin' });
        const dashboardRoute =
          queryRedirect && queryRedirect.startsWith('/')
            ? queryRedirect
            : getDashboardRouteByRole(adminUser.role, adminUser.email);
        await notify.successAndNavigate('Login successful', () =>
          safeReplace(dashboardRoute),
        );
      } catch (adminErr) {
        notify.error(
          adminErr.status === 429
            ? adminErr.message ||
                'Too many login attempts. Please wait a few minutes and try again.'
            : adminErr.message || result.message || 'Invalid email or password',
        );
      }

      setLoading(false);
      return;
    }

    setErrorMessage('');
    const validationError = validateCompanySignup(formData, { requireAdminName: true });
    if (validationError) {
      notify.warning(validationError);
      return;
    }

    setLoading(true);
    const submissionPayload = {
      companyName: formData.companyName.trim(),
      adminName: formData.adminName.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      website: formData.website.trim(),
      password: formData.password,
      confirmPassword: formData.confirmPassword,
    };

    const result = await registerCompany(submissionPayload);

    if (result.success && authService.getValidToken()) {
      setErrorMessage('');
      await notify.successAndNavigate('Company Registration Successful', () =>
        safePush('/company/dashboard'),
      );
    } else {
      let message =
        result.message ||
        'An error occurred during registration. Please verify your details and try again.';
      if (result.status === 409) {
        if (result.field === 'email') {
          message = 'This email is already registered. Use Sign In or Forgot Password to recover access.';
        } else if (result.field === 'phone') {
          message = 'This phone number is already registered. Use Sign In or Forgot Password to recover access.';
        }
      }
      setErrorMessage(message);
      setLoading(false);
      notify.error(message);
      return;
    }
    setLoading(false);
  };

  const canSubmitLogin = isLoginMode
    ? hasLoginCredentials({ email: formData.email, password: formData.password })
    : true;

  return (
    <div style={styles.pageContainer}>
      <div style={{ ...styles.mainCard, flexDirection: isMobileLayout ? 'column' : 'row' }}>
        {!isMobileLayout && (
          <div style={styles.leftSidebar}>
            <h1 style={styles.sidebarTitle}>Partner With Us</h1>
            <p style={styles.sidebarSub}>
              Join thousands of corporate partners connecting through MBK Carrierz.
              Recruit top talent and provide industry training.
            </p>
            <div style={styles.bulletList}>
              <div style={styles.bulletItem}>✓ Verified Student Profiles</div>
              <div style={styles.bulletItem}>✓ Manage Placement Pipelines</div>
              <div style={styles.bulletItem}>✓ Drive Corporate Innovation</div>
            </div>
          </div>
        )}

        <div style={styles.rightFormSection}>
          <h2 style={styles.formTitle}>
            {isLoginMode ? 'Corporate Sign In' : 'Corporate Registration'}
          </h2>
          <p style={styles.formSub}>
            {isLoginMode
              ? 'Sign in with your company or MBK Super Admin credentials'
              : 'Create your company account to hire top talent'}
          </p>

          <form method="post" action="/company/auth" onSubmit={handleAuthSubmit} style={styles.formControl} noValidate>
            {errorMessage ? (
              <div style={styles.errorBox}>{errorMessage}</div>
            ) : null}
            {!isLoginMode && (
              <>
                <input type="text" name="companyName" placeholder="Company Name *" value={formData.companyName} onChange={handleInputChange} style={styles.inputField} required minLength={2} maxLength={200} disabled={loading} />
                <input type="text" name="adminName" placeholder="Admin Full Name *" value={formData.adminName} onChange={handleInputChange} style={styles.inputField} required minLength={2} maxLength={100} autoComplete="name" disabled={loading} />
                <input type="tel" name="phone" placeholder="Contact Phone (10 digits) *" value={formData.phone} onChange={handleInputChange} style={styles.inputField} required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel" disabled={loading} />
                <input type="text" name="address" placeholder="Corporate Address *" value={formData.address} onChange={handleInputChange} style={styles.inputField} required minLength={5} maxLength={300} disabled={loading} />
                <input type="url" name="website" placeholder="Website URL (optional)" value={formData.website} onChange={handleInputChange} style={styles.inputField} disabled={loading} />
              </>
            )}

            <input type="email" name="email" placeholder="Email Address *" value={formData.email} onChange={handleInputChange} style={styles.inputField} required autoComplete="email" disabled={loading} />

            <PasswordInputWithToggle
              name="password"
              placeholder={isLoginMode ? 'Password *' : `Password (min ${PASSWORD_MIN_LENGTH} characters) *`}
              value={formData.password}
              onChange={handleInputChange}
              style={styles.passwordField}
              required
              disabled={loading}
              minLength={isLoginMode ? undefined : PASSWORD_MIN_LENGTH}
              autoComplete={isLoginMode ? 'current-password' : 'new-password'}
              showPassword={showPassword}
              onToggleVisibility={() => setShowPassword(!showPassword)}
            />

            {!isLoginMode && (
              <PasswordInputWithToggle
                name="confirmPassword"
                placeholder="Confirm Password *"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                style={styles.passwordField}
                required
                disabled={loading}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                showPassword={showConfirmPassword}
                onToggleVisibility={() => setShowConfirmPassword(!showConfirmPassword)}
              />
            )}

            <CTAButton
              type="submit"
              variant="company"
              size="lg"
              fullWidth
              loading={loading}
              disabled={loading || (isLoginMode && !canSubmitLogin)}
              loadingText="Please wait..."
              className="mt-2 rounded-xl"
            >
              {isLoginMode ? 'Sign In' : 'Create Account'}
            </CTAButton>
          </form>

          <p style={styles.toggleText}>
            {isLoginMode ? "Don't have an account? " : 'Already have an account? '}
            <span style={styles.toggleLink} onClick={() => {
              if (loading) return;
              setIsLoginMode(!isLoginMode);
              setErrorMessage('');
              setShowPassword(false);
              setShowConfirmPassword(false);
            }}>
              {isLoginMode ? 'Sign Up' : 'Sign In'}
            </span>
          </p>

        </div>
      </div>
    </div>
  );
}

const styles = {
  pageContainer: { display: 'flex', width: '100%', minHeight: '100dvh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9', fontFamily: '"Inter", sans-serif', padding: 'clamp(12px, 3vw, 16px)' },
  mainCard: { display: 'flex', width: '100%', maxWidth: '1040px', backgroundColor: '#ffffff', borderRadius: 'clamp(16px, 3vw, 24px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.07)', overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  leftSidebar: { flex: '1 1 280px', background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#ffffff', minWidth: 0 },
  sidebarTitle: { fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: '800', marginBottom: '22px', lineHeight: '1.2' },
  sidebarSub: { fontSize: '15.5px', lineHeight: '1.65', opacity: '0.92', marginBottom: '32px' },
  bulletList: { display: 'flex', flexDirection: 'column', gap: '18px' },
  bulletItem: { fontSize: '15px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '12px' },
  rightFormSection: { flex: '1 1 280px', padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 },
  formTitle: { fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: '700', color: '#0f172a', marginBottom: '8px' },
  formSub: { fontSize: '14px', color: '#64748b', marginBottom: '28px' },
  formControl: { display: 'flex', flexDirection: 'column', gap: '14px' },
  errorBox: { width: '100%', borderRadius: '16px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', padding: '14px 16px', marginBottom: '8px', fontSize: '14px' },
  inputField: { width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  passwordField: { width: '100%', padding: '14px 44px 14px 16px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  submitButton: { width: '100%', padding: '15px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  toggleText: { textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#64748b' },
  toggleLink: { color: '#3b82f6', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' },
};
