'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '../../../src/context/AuthContext';
import authService from '../../../src/services/authService';
import { studentPortalService } from '../../../src/services/studentPortalService';
import notify from '../../../src/lib/toast';
import CTAButton from '../../../src/components/common/CTAButton';
import PasswordInputWithToggle from '../../../src/components/common/PasswordInputWithToggle';
import {
  sanitizePhoneInput,
  validateLoginForm,
  validateStudentSignup,
  hasLoginCredentials,
  PASSWORD_MIN_LENGTH,
} from '../../../src/utils/authValidation';

export default function StudentAuthPage() {
  const { safeReplace, safePush, isRouterReady } = useSafeRouter();
  const { registerStudent, loginStudent, isAuthenticated, userRole, loading: authLoading } = useAuth();

  const FALLBACK_COURSES = [
    { value: 'PCB', label: 'PCB Circuit Design' },
    { value: 'IoT', label: 'IoT' },
    { value: 'Employability', label: 'Employability' },
    { value: 'Surface Modelling', label: 'Surface Modelling' },
    { value: 'Full Stack Dev', label: 'MERN Full Stack Development' },
  ];

  const [isLoginMode, setIsLoginMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [courses, setCourses] = useState(FALLBACK_COURSES);
  const [isCoursesLoading, setIsCoursesLoading] = useState(false);
  const [courseLoadError, setCourseLoadError] = useState('');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    collegeName: '',
    course: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (!isRouterReady || authLoading || loading) return;
    if (isAuthenticated && userRole === 'student' && authService.getValidToken()) {
      safeReplace('/student/dashboard');
    }
  }, [authLoading, isRouterReady, loading, isAuthenticated, userRole, safeReplace]);

  useEffect(() => {
    let cancelled = false;
    const loadCourses = async () => {
      setIsCoursesLoading(true);
      setCourseLoadError('');
      try {
        const data = await studentPortalService.getCourses();
        const availableCourses = Array.isArray(data) ? data : data?.data || [];
        if (!cancelled && availableCourses.length > 0) {
          setCourses(
            availableCourses.map((course) => {
              const rawTitle = String(course.title || course.name || course.label || '').trim();
              const normalizedTitle = rawTitle || String(course._id || course.id || '').trim();
              const displayName = normalizedTitle || 'Untitled Course';
              return {
                value: displayName,
                label: displayName,
              };
            }),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setCourseLoadError('Unable to load course options. Please try again later.');
        }
      } finally {
        if (!cancelled) {
          setIsCoursesLoading(false);
        }
      }
    };

    loadCourses();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'phoneNumber' ? sanitizePhoneInput(value) : value;
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
      const result = await loginStudent(formData.email.trim(), formData.password);

      if (result.success && authService.getValidToken()) {
        await notify.successAndNavigate('Login successful', () =>
          safePush('/student/dashboard'),
        );
      } else {
        notify.error(result.message || 'Invalid email or password');
      }
      setLoading(false);
      return;
    }

    const validationError = validateStudentSignup(formData);
    if (validationError) {
      notify.warning(validationError);
      return;
    }

    setLoading(true);
    const submissionPayload = {
      fullName: formData.fullName.trim(),
      email: formData.email.trim(),
      phone: formData.phoneNumber.trim(),
      college: formData.collegeName.trim(),
      course: formData.course,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
    };

    const result = await registerStudent(submissionPayload);

    if (result.success && authService.getValidToken()) {
      await notify.successAndNavigate('Student Registration Successful', () =>
        safePush('/student/dashboard'),
      );
    } else {
      notify.error(result.message || 'An error occurred during registration.');
    }
    setLoading(false);
  };

  const canSubmitLogin = isLoginMode
    ? hasLoginCredentials({ email: formData.email, password: formData.password })
    : true;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.mainCard}>
        <div style={styles.leftSidebar}>
          <h1 style={styles.sidebarTitle}>Start Your Career Journey</h1>
          <p style={styles.sidebarSub}>
            Join thousands of students and leading business partners connecting through MBK Carrierz.
            Discover training programs, internships, and placement opportunities.
          </p>
          <div style={styles.bulletList}>
            <div style={styles.bulletItem}>✓ Verified Employers & Corporate Partners</div>
            <div style={styles.bulletItem}>✓ Industry Standard Training & Certification</div>
            <div style={styles.bulletItem}>✓ Placement Pipelines & Career Mentorship</div>
          </div>
        </div>

        <div style={styles.rightFormSection}>
          <h2 style={styles.formTitle}>
            {isLoginMode ? 'Student Sign In' : 'Student Registration'}
          </h2>
          <p style={styles.formSub}>
            {isLoginMode ? 'Sign in to access student modules' : 'Create your account to access training and career support'}
          </p>

          <form method="post" action="/student/auth" onSubmit={handleAuthSubmit} style={styles.formControl} noValidate>
            {!isLoginMode && (
              <>
                <input type="text" name="fullName" placeholder="Full Name *" value={formData.fullName} onChange={handleInputChange} style={styles.inputField} required minLength={2} maxLength={100} autoComplete="name" disabled={loading} />
                <input type="tel" name="phoneNumber" placeholder="Phone Number (10 digits) *" value={formData.phoneNumber} onChange={handleInputChange} style={styles.inputField} required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel" disabled={loading} />
                <input type="text" name="collegeName" placeholder="College / Institute Name *" value={formData.collegeName} onChange={handleInputChange} style={styles.inputField} required minLength={2} maxLength={200} disabled={loading} />
                <select
                  name="course"
                  value={formData.course}
                  onChange={handleInputChange}
                  style={styles.selectField}
                  required
                  disabled={loading || isCoursesLoading}
                  aria-required="true"
                >
                  <option value="">Select a Course</option>
                  {courses.map((course) => (
                    <option key={course.value} value={course.value}>
                      {course.label}
                    </option>
                  ))}
                </select>
                {courseLoadError ? (
                  <p style={styles.errorText}>{courseLoadError}</p>
                ) : null}
                {isCoursesLoading ? (
                  <p style={styles.infoText}>Loading course options...</p>
                ) : null}
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

            {isLoginMode ? (
              <p style={styles.forgotWrap}>
                <Link href="/student/forgot-password" style={styles.forgotLink}>
                  Forgot password?
                </Link>
              </p>
            ) : null}

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
              variant="brand"
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
  leftSidebar: { flex: '1 1 280px', background: 'linear-gradient(135deg, #ff4e00 0%, #ec6100 100%)', padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#ffffff', minWidth: 0 },
  sidebarTitle: { fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: '800', marginBottom: '22px', lineHeight: '1.2' },
  sidebarSub: { fontSize: '15.5px', lineHeight: '1.65', opacity: '0.92', marginBottom: '32px' },
  bulletList: { display: 'flex', flexDirection: 'column', gap: '18px' },
  bulletItem: { fontSize: '15px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '12px' },
  rightFormSection: { flex: '1 1 280px', padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 },
  formTitle: { fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: '700', color: '#0f172a', marginBottom: '8px' },
  formSub: { fontSize: '14px', color: '#64748b', marginBottom: '28px' },
  formControl: { display: 'flex', flexDirection: 'column', gap: '14px' },
  inputField: { width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  passwordField: { width: '100%', padding: '14px 44px 14px 16px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  selectField: { width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', color: '#475569', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' },
  submitButton: { width: '100%', padding: '15px', background: '#ff5e00', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  toggleText: { textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#64748b' },
  toggleLink: { color: '#ff5e00', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' },
  forgotWrap: { margin: '-4px 0 0', textAlign: 'right' },
  forgotLink: { color: '#ff5e00', fontWeight: '700', fontSize: '13px', textDecoration: 'underline' },
};
