"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeRouterPush } from '@/utils/safeRouterNavigation';
import { useAuth } from '@/context/AuthContext';
import authService from '@/services/authService';
import { studentPortalService } from '@/services/studentPortalService';
import notify from '@/lib/toast';
import CTAButton from '@/components/common/CTAButton';
import PasswordInputWithToggle from '@/components/common/PasswordInputWithToggle';
import {
  sanitizePhoneInput,
  validateStudentSignup,
  validateCompanySignup,
  PASSWORD_MIN_LENGTH,
} from '@/utils/authValidation';

const FALLBACK_COURSES = [
  { value: 'PCB', label: 'PCB' },
  { value: 'IoT', label: 'IoT' },
  { value: 'Employability', label: 'Employability' },
  { value: 'Surface Modelling', label: 'Surface Modelling' },
  { value: 'Solid Works', label: 'Solid Works' },
];

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registerStudent, registerCompany } = useAuth();
  const [courses, setCourses] = useState(FALLBACK_COURSES);
  const [isCoursesLoading, setIsCoursesLoading] = useState(true);
  const [courseLoadError, setCourseLoadError] = useState('');

  const [activeTab, setActiveTab] = useState('student');

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'company') {
      setActiveTab('company');
    } else if (type === 'trainer') {
      setActiveTab('trainer');
    } else {
      setActiveTab('student');
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadCourses = async () => {
      setIsCoursesLoading(true);
      setCourseLoadError('');

      try {
        const data = await studentPortalService.getCourses();
        const activeCourses = Array.isArray(data) ? data : data?.data || [];
        if (!cancelled && activeCourses.length > 0) {
          setCourses(
            activeCourses.map((course) => {
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

  // Student form state
  const [studentForm, setStudentForm] = useState({
    name: '',
    email: '',
    phone: '',
    college: '',
    course: '',
    password: '',
    confirmPassword: '',
  });

  // Company form state
  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    email: '',
    address: '',
    website: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const [error, setError] = useState('');
  const [errorHint, setErrorHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleStudentChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'phone' ? sanitizePhoneInput(value) : value;
    setStudentForm((prev) => ({ ...prev, [name]: nextValue }));
    setError('');
  };

  const handleCompanyChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'phone' ? sanitizePhoneInput(value) : value;
    setCompanyForm((prev) => ({ ...prev, [name]: nextValue }));
    setError('');
  };

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const v = validateStudentSignup(studentForm);
    if (v) {
      setError(v);
      notify.warning(v);
      return;
    }

    try {
      setLoading(true);
      const response = await registerStudent({
        fullName: studentForm.name.trim(),
        email: studentForm.email.trim(),
        phone: studentForm.phone.trim(),
        college: studentForm.college.trim(),
        course: studentForm.course.trim(),
        password: studentForm.password,
        confirmPassword: studentForm.confirmPassword,
      });
      if (response.success && authService.getValidToken()) {
        notify.success('Student Registration Successful');
        safeRouterPush(router, '/student/dashboard');
      } else {
        const message = response.message || 'Registration failed.';
        setError(message);
        notify.error(message);
      }
    } catch (err) {
      const message = err?.message || 'Registration failed.';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySubmit = async (e) => {
    e.preventDefault();
    setError('');
    const v = validateCompanySignup(companyForm);
    if (v) {
      setError(v);
      notify.warning(v);
      return;
    }

    try {
      setLoading(true);
      const response = await registerCompany({
        companyName: companyForm.companyName.trim(),
        adminName: `${companyForm.companyName.trim()} Admin`,
        email: companyForm.email.trim(),
        address: companyForm.address.trim(),
        website: companyForm.website.trim(),
        phone: companyForm.phone.trim(),
        password: companyForm.password,
        confirmPassword: companyForm.confirmPassword,
      });
      if (response.success && authService.getValidToken()) {
        notify.success('Company Registration Successful');
        safeRouterPush(router, '/company/dashboard');
      } else {
        setErrorHint('');
        let message = response.message || 'Registration failed. Please try again.';
        if (response.status === 409) {
          setErrorHint('company-exists');
          if (response.field === 'email') {
            message = 'This email is already registered. Use Company Sign In or Forgot Password to recover access.';
          } else if (response.field === 'phone') {
            message = 'This phone number is already registered. Use Company Sign In or Forgot Password to recover access.';
          } else {
            message = `${message} If this account already exists, use Sign In or Forgot Password to recover access.`;
          }
        }
        setError(message);
        notify.error(message);
      }
    } catch (err) {
      setErrorHint('');
      const message = err?.message || 'Registration failed.';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-amber-50/30 to-slate-50 flex items-center justify-center px-4 py-8 md:py-16">
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-xl border border-orange-100 overflow-hidden grid lg:grid-cols-2">
        
        {/* Left Column (Brand banner) */}
        <div className="hidden lg:flex flex-col justify-center bg-gradient-to-br from-orange-500 via-orange-600 to-amber-700 text-white p-12 gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-orange-400/15 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10">
            <h1 className="text-5xl font-bold leading-tight">Start Your Career Journey</h1>
            <p className="mt-6 text-lg opacity-90 leading-relaxed">
              Join thousands of students and leading business partners connecting through MBK Carrierz. Discover training programs, internships, and placement opportunities.
            </p>
          </div>
          <div className="space-y-4 text-sm font-semibold relative z-10">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">✓</span>
              Verified Employers & Corporate Partners
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">✓</span>
              Industry Standard Training & Certification
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">✓</span>
              Placement Pipelines & Career Mentorship
            </div>
          </div>
        </div>

        {/* Right Column (Form container) */}
        <div className="p-6 md:p-12 flex flex-col justify-center">
          
          {/* Tabs Selector */}
          <div className="flex border-b border-gray-150 mb-8 gap-4 justify-center md:justify-start">
            <button
              type="button"
              onClick={() => {
                setActiveTab('student');
                setError('');
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
              className={`pb-3 text-lg font-bold border-b-2 transition-all px-2 ${
                activeTab === 'student'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Student Register
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('trainer');
                setError('');
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
              className={`pb-3 text-lg font-bold border-b-2 transition-all px-2 ${
                activeTab === 'trainer'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Trainer Register
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('company');
                setError('');
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
              className={`pb-3 text-lg font-bold border-b-2 transition-all px-2 ${
                activeTab === 'company'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Company Register
            </button>
          </div>

          <div className="text-center md:text-left mb-6">
            <h2 className="text-3xl font-bold text-gray-900">
              {activeTab === 'student'
                ? 'Student Registration'
                : activeTab === 'trainer'
                ? 'Trainer Registration'
                : 'Company Registration'}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">
              {activeTab === 'student'
                ? 'Create your account to access training and career support'
                : activeTab === 'trainer'
                ? 'Register as a trainer to manage sessions, attendance, and delivery operations.'
                : 'Register your company profile to access our recruitment pipelines'}
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
              {error}
              {errorHint === 'company-exists' && (
                <p className="mt-2 font-normal text-red-600">
                  Go to{' '}
                  <Link href="/company/auth" className="font-semibold underline">
                    Company Sign In
                  </Link>{' '}
                  and use <strong>Forgot Password</strong> to set your password, or open the onboarding link from your invite email.
                </p>
              )}
            </div>
          )}

          {activeTab === 'trainer' && (
            <div className="space-y-6">
              <div className="rounded-3xl bg-orange-50 p-6 border border-orange-100">
                <h3 className="text-2xl font-semibold text-gray-900">Trainer Registration</h3>
                <p className="mt-3 text-gray-600 leading-relaxed">
                  Register as a trainer to manage sessions, attendance, and delivery operations in the MBK CarrierZ platform. Your account will be reviewed by the admin team.
                </p>
                <div className="mt-6 sm:flex sm:items-center sm:gap-4">
                  <CTAButton
                    type="button"
                    variant="brand"
                    size="lg"
                    fullWidth
                    onClick={() => router.push('/trainer-signup')}
                  >
                    Continue to Trainer Signup
                  </CTAButton>
                </div>
                <p className="mt-4 text-sm text-gray-500">
                  Already registered?{' '}
                  <Link href="/login" className="text-orange-600 font-semibold underline">
                    Sign in instead
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* Student Signup Form */}
          {activeTab === 'student' && (
            <form className="md:grid md:grid-cols-2 md:gap-4 md:space-y-0 space-y-4" onSubmit={handleStudentSubmit} noValidate>
              <div className="md:col-span-2">
                <input
                  name="name"
                  type="text"
                  placeholder="Full Name *"
                  value={studentForm.name}
                  onChange={handleStudentChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  disabled={loading}
                />
              </div>

              <div>
                <input
                  name="email"
                  type="email"
                  placeholder="Email Address *"
                  value={studentForm.email}
                  onChange={handleStudentChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div>
                <input
                  name="phone"
                  type="tel"
                  placeholder="Phone Number (10 digits) *"
                  value={studentForm.phone}
                  onChange={handleStudentChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  autoComplete="tel"
                  disabled={loading}
                />
              </div>

              <div className="md:col-span-2">
                <input
                  name="college"
                  type="text"
                  placeholder="College / Institute Name *"
                  value={studentForm.college}
                  onChange={handleStudentChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={2}
                  maxLength={200}
                  disabled={loading}
                />
              </div>

              <div className="md:col-span-2">
                <select
                  name="course"
                  value={studentForm.course}
                  onChange={handleStudentChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  disabled={loading || isCoursesLoading}
                >
                  <option value="">
                    {isCoursesLoading ? 'Loading course options...' : 'Select a Course'}
                  </option>
                  {courses.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {courseLoadError ? (
                  <p className="mt-2 text-sm text-red-600">{courseLoadError}</p>
                ) : null}
              </div>

              <div>
                <PasswordInputWithToggle
                  name="password"
                  placeholder={`Password (min ${PASSWORD_MIN_LENGTH} chars) *`}
                  value={studentForm.password}
                  onChange={handleStudentChange}
                  className="w-full h-12 pl-4 pr-11 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  disabled={loading}
                  showPassword={showPassword}
                  onToggleVisibility={() => setShowPassword(!showPassword)}
                />
              </div>

              <div>
                <PasswordInputWithToggle
                  name="confirmPassword"
                  placeholder="Confirm Password *"
                  value={studentForm.confirmPassword}
                  onChange={handleStudentChange}
                  className="w-full h-12 pl-4 pr-11 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  disabled={loading}
                  showPassword={showConfirmPassword}
                  onToggleVisibility={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              </div>

              <div className="md:col-span-2 pt-2">
                <CTAButton
                  type="submit"
                  variant="brand"
                  size="lg"
                  fullWidth
                  loading={loading}
                  loadingText="Signing Up..."
                  className="rounded-xl"
                >
                  Sign Up
                </CTAButton>
              </div>
            </form>
          )}

          {/* Company Signup Form */}
          {activeTab === 'company' && (
            <form className="md:grid md:grid-cols-2 md:gap-4 md:space-y-0 space-y-4" onSubmit={handleCompanySubmit} noValidate>
              <div className="md:col-span-2">
                <input
                  name="companyName"
                  type="text"
                  placeholder="Company Name *"
                  value={companyForm.companyName}
                  onChange={handleCompanyChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={2}
                  maxLength={200}
                  disabled={loading}
                />
              </div>

              <div>
                <input
                  name="email"
                  type="email"
                  placeholder="Official Mail Address *"
                  value={companyForm.email}
                  onChange={handleCompanyChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div>
                <input
                  name="phone"
                  type="tel"
                  placeholder="Phone Number (10 digits) *"
                  value={companyForm.phone}
                  onChange={handleCompanyChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  autoComplete="tel"
                  disabled={loading}
                />
              </div>

              <div className="md:col-span-2">
                <input
                  name="address"
                  type="text"
                  placeholder="Address *"
                  value={companyForm.address}
                  onChange={handleCompanyChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={5}
                  maxLength={300}
                  disabled={loading}
                />
              </div>

              <div className="md:col-span-2">
                <input
                  name="website"
                  type="url"
                  placeholder="Website URL (optional)"
                  value={companyForm.website}
                  onChange={handleCompanyChange}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <PasswordInputWithToggle
                  name="password"
                  placeholder={`Password (min ${PASSWORD_MIN_LENGTH} chars) *`}
                  value={companyForm.password}
                  onChange={handleCompanyChange}
                  className="w-full h-12 pl-4 pr-11 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  disabled={loading}
                  showPassword={showPassword}
                  onToggleVisibility={() => setShowPassword(!showPassword)}
                />
              </div>

              <div>
                <PasswordInputWithToggle
                  name="confirmPassword"
                  placeholder="Confirm Password *"
                  value={companyForm.confirmPassword}
                  onChange={handleCompanyChange}
                  className="w-full h-12 pl-4 pr-11 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-sm"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  disabled={loading}
                  showPassword={showConfirmPassword}
                  onToggleVisibility={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              </div>

              <div className="md:col-span-2 pt-2">
                <CTAButton
                  type="submit"
                  variant="brand"
                  size="lg"
                  fullWidth
                  loading={loading}
                  loadingText="Signing Up..."
                  className="rounded-xl"
                >
                  Sign Up
                </CTAButton>
              </div>
            </form>
          )}

          <div className="text-center mt-6 text-sm">
            <span className="text-gray-500">Already have an account?</span>
            <Link href="/login" className="ml-2 text-orange-600 font-semibold hover:underline">
              Sign In
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
