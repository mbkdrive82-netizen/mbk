"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from 'next/navigation';
import { safeRouterReplace } from '@/utils/safeRouterNavigation';

import SignatureCanvas from "react-signature-canvas";
import {
  checkTrainerEmail,
  registrationInit,
  resendTrainerOtp,
  verifyOtp,
} from "@/services/authService";
import {
  uploadDocument,
  createStep1,
  updateStep2,
  updateStep3,
  submitFinal,
  getTrainerProgress,
  saveRegistrationStep,
  getNdaTemplate,
} from "@/services/trainerService";
import { getCities } from "@/services/cityService";
import { getTrainingColleges } from "@/services/trainingCollegeService";
import { getTrainingCourses } from "@/services/courseService";
import {
  getDocumentImagePreviewCandidates,
  getImagePreviewUrl,
} from "@/utils/imageUtils";
import {
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  Upload,
  Loader,
  RefreshCw,
  Pen,
  Trash2,
  Mail,
  User,
  FileText,
  Camera,
  RotateCcw,
} from "lucide-react";
import SelfieCapture from "@/components/SelfieCapture";
import DocumentUploadLoadingState from "@/components/common/DocumentUploadLoadingState";
import notify from "@/lib/toast";
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE, isValidPassword } from "@/utils/authValidation";

const TRAINER_SIGNUP_SESSION_KEY = "trainer_signup_session";

const readSignupSession = () => {
  try {
    const raw = sessionStorage.getItem(TRAINER_SIGNUP_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Failed to read trainer signup session", error);
    return null;
  }
};

const writeSignupSession = (value) => {
  try {
    sessionStorage.setItem(TRAINER_SIGNUP_SESSION_KEY, JSON.stringify(value));
  } catch (error) {
    console.error("Failed to save trainer signup session", error);
  }
};

const clearSignupSession = () => {
  try {
    sessionStorage.removeItem(TRAINER_SIGNUP_SESSION_KEY);
  } catch (error) {
    console.error("Failed to clear trainer signup session", error);
  }
};

const normalizeAgreementState = (data) => {
  if (!data) return data;

  return {
    ...data,
    agreementAccepted: Boolean(
      data.agreementAccepted ?? data.agreementAccepted,
    ),
  };
};

const FALLBACK_ACCEPTANCE_CONDITION =
  "I have read and agree to the NDA Agreement terms and conditions.";

const FALLBACK_NDA_TEMPLATE = {
  title: "NDA Agreement & Signature",
  introText: "Please read the agreement carefully before signing.",
  content: `NON-DISCLOSURE AGREEMENT (NDA)

This agreement is entered into between MBK CarrierZ (the "Company") and the Trainer (the "Associate").

1. CONFIDENTIALITY
You shall not disclose any confidential information, including course materials, student records, pricing, or business processes, to any third party without prior written consent from the Company.

2. INTELLECTUAL PROPERTY
All training modules, presentations, and materials provided to you remain the exclusive property of MBK CarrierZ. You shall not reproduce or distribute any materials without written authorization.

3. CODE OF CONDUCT
You agree to maintain professional conduct at all times while representing MBK CarrierZ. This includes punctuality, dress code adherence, and respectful communication.

4. ATTENDANCE & COMMITMENT
You agree to honor all assigned sessions as confirmed. Any cancellations must be communicated at least 24 hours in advance through the official portal.

5. PAYMENT TERMS
Compensation will be processed monthly based on verified attendance records in the system. The Company reserves the right to deduct payment for unverified or absent sessions.

6. TERMINATION
Either party may terminate this agreement with 7 days written notice. The Company may terminate immediately in case of misconduct, breach of confidentiality, or repeated absence.

7. GOVERNING LAW
This agreement shall be governed by the laws of India.

By providing your signature below, you confirm that you have read, understood, and agree to all the terms and conditions stated in this agreement.`,
  checkboxLabel: FALLBACK_ACCEPTANCE_CONDITION,
  acceptanceConditions: [FALLBACK_ACCEPTANCE_CONDITION],
};

const getAcceptanceConditions = (template = FALLBACK_NDA_TEMPLATE) => {
  const normalizedConditions = Array.isArray(template?.acceptanceConditions)
    ? template.acceptanceConditions
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    : [];

  if (normalizedConditions.length > 0) {
    return normalizedConditions;
  }

  const fallbackCondition = String(
    template?.checkboxLabel || FALLBACK_ACCEPTANCE_CONDITION,
  ).trim();

  return [fallbackCondition || FALLBACK_ACCEPTANCE_CONDITION];
};

const normalizeAgreementTemplate = (template = FALLBACK_NDA_TEMPLATE) => {
  const acceptanceConditions = getAcceptanceConditions(template);

  return {
    ...FALLBACK_NDA_TEMPLATE,
    ...template,
    checkboxLabel: acceptanceConditions[0] || FALLBACK_ACCEPTANCE_CONDITION,
    acceptanceConditions,
  };
};

// --- Stepper Indicator Component ---
const StepIndicator = ({ currentStep, totalSteps }) => {
  const steps = REGISTRATION_FLOW_STEPS.map((step) => step.stepperLabel);
  return (
    <div className="tr-step-indicator">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isComplete = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        return (
          <React.Fragment key={label}>
            <div
              className={`tr-step-node ${isActive ? "active" : isComplete ? "done" : ""}`}
            >
              <div className="tr-step-circle">
                {isComplete ? <CheckCircle size={16} /> : stepNum}
              </div>
              <span className="tr-step-label">{label}</span>
            </div>
            {stepNum < totalSteps && (
              <div className={`tr-step-line ${isComplete ? "done" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const ExistingRegistrationStatusPanel = ({
  status,
  email,
  trainerName,
  message,
  onReset,
}) => {
  const router = useRouter();
  const isApproved = status === "approved";

  return (
    <div className="tr-status-screen">
      <div
        className={`tr-status-screen-icon ${isApproved ? "approved" : "review"}`}
      >
        {isApproved ? <CheckCircle size={40} /> : <FileText size={40} />}
      </div>
      <span className="tr-status-kicker">
        {isApproved ? "Registration Approved" : "Registration Submitted"}
      </span>
      <h2>
        {isApproved ? "Account Already Approved" : "Registration Under Review"}
      </h2>
      <p>
        {message ||
          (isApproved
            ? "Your trainer account is already approved. Use your approved email and password to continue."
            : "Your registration is complete and is currently waiting for Super Admin review.")}
      </p>
      <div className="tr-status-card">
        {trainerName && (
          <div className="tr-status-row">
            <span>Trainer</span>
            <span>{trainerName}</span>
          </div>
        )}
        <div className="tr-status-row">
          <span>Email</span>
          <span>{email}</span>
        </div>
        <div className="tr-status-row">
          <span>Status</span>
          <span
            className={`tr-status-badge ${isApproved ? "approved" : "pending"}`}
          >
            {isApproved ? "APPROVED" : "UNDER REVIEW"}
          </span>
        </div>
        <div className="tr-status-row">
          <span>Registration Step</span>
          <span>Completed</span>
        </div>
        <div className="tr-status-row">
          <span>Next Step</span>
          <span>
            {isApproved ? "Login to Dashboard" : "Wait for Admin Approval"}
          </span>
        </div>
      </div>
      <div className="tr-status-actions">
        <button onClick={onReset} className="tr-btn-outline">
          Use Different Email
        </button>
        <button
          onClick={() => router.push(isApproved ? "/login" : "/")}
          className="tr-btn-primary"
        >
          {isApproved ? "Go to Login" : "Go to Home"}
        </button>
      </div>
    </div>
  );
};

// --- Helper Function: Save Registration Step (As requested) ---
async function handleSaveStep(email, step, data = {}) {
  try {
    console.log("Saving step:", email, step);
    return await saveRegistrationStep({
      email,
      step,
      data,
    });
  } catch (err) {
    console.error("Save step failed", err);
    throw err;
  }
}

// --- Step 1: Email + OTP ---
const Step1 = ({ onComplete, onExistingStatusChange }) => {
  const [phase, setPhase] = useState("email"); // email | otp_sent
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resumeTarget, setResumeTarget] = useState("");
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let timer;
    if (countdown > 0)
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setResumeTarget("");
    onExistingStatusChange?.(null);

    // Validate password strength
    if (!isValidPassword(password)) {
      setError(PASSWORD_MIN_LENGTH_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const checkResponse = await checkTrainerEmail({ email });

      if (checkResponse.status === "review") {
        onExistingStatusChange?.({
          status: "review",
          email,
          trainerName: checkResponse.trainerName || "",
          message:
            checkResponse.message ||
            "Your registration is under review by Super Admin. You will receive approval soon.",
        });
        setLoading(false);
        return;
      }

      if (checkResponse.status === "approved") {
        onExistingStatusChange?.({
          status: "approved",
          email,
          trainerName: checkResponse.trainerName || "",
          message:
            checkResponse.message ||
            "Your trainer account is already approved. Please login to access dashboard.",
        });
        setLoading(false);
        return;
      }

      if (checkResponse.status === "resume") {
        setNotice(
          checkResponse.message ||
            "We found your existing registration. Verify OTP to continue.",
        );
        setResumeTarget(checkResponse.nextStepLabel || "");
      }

      const initResult = await registrationInit({ email, password });
      setPhase("otp_sent");
      setCountdown(60);
      if (initResult?.debugOtp) {
        setOtp(String(initResult.debugOtp));
        setNotice(`Verification code: ${initResult.debugOtp} (displayed due to email timeout)`);
        notify.success(`Verification code generated: ${initResult.debugOtp}`);
      } else {
        setNotice(
          "We sent a 6-digit code to your email. It may take up to a minute to arrive.",
        );
        notify.success("Verification code sent. Check your inbox.");
      }
    } catch (err) {
      const message = err.message || "Failed to send OTP. Please try again.";
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const initResult = await resendTrainerOtp({ email });
      setCountdown(60);
      if (initResult?.debugOtp) {
        setOtp(String(initResult.debugOtp));
        setNotice(`Verification code: ${initResult.debugOtp} (displayed due to email timeout)`);
        notify.success(`Verification code generated: ${initResult.debugOtp}`);
      } else {
        notify.success("Verification code resent to your email.");
      }
    } catch (err) {
      setError(err.message || "Failed to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit OTP.");
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOtp({ email, otp });
      if (res.success) {
        onComplete({ email, password, currentStep: res.currentStep || 2 });
        notify.success("Email verified successfully.");
      }
    } catch (err) {
      const message = err.message || "Invalid or expired OTP.";
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tr-form-wrapper">
      {phase === "email" ? (
        <form onSubmit={handleSendOtp} noValidate>
          <div className="tr-form-header">
            <Mail size={28} className="tr-form-icon" />
            <h3>Verify Your Email</h3>
            <p>
              Enter your email and password. We will send a verification code only
              to that email address before you continue.
            </p>
          </div>
          {notice && (
            <div className="tr-info-box">
              <CheckCircle size={16} />
              {notice}
            </div>
          )}
          {error && (
            <div className="tr-error-box">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <div className="tr-field">
            <label htmlFor="reg-email">Email Address*</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
                if (notice) setNotice("");
                onExistingStatusChange?.(null);
              }}
              placeholder="your@email.com"
              required
              autoFocus
            />
          </div>
          <div className="tr-field">
            <label htmlFor="reg-password">Password*</label>
            <div className="tr-pw-wrap">
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Password (min 8 characters)"
                required
                minLength={8}
              />
              <button
                type="button"
                className="tr-pw-toggle"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowPassword((prev) => !prev);
                }}
                onMouseDown={(event) => event.preventDefault()}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password && !isValidPassword(password) && (
              <div className="tr-pw-hint" style={{ marginTop: "8px", fontSize: "13px", color: "#ef4444" }}>
                <AlertCircle size={14} style={{ display: "inline", marginRight: "4px" }} />
                Password must contain: uppercase, lowercase, digit, and special character
              </div>
            )}
            {password && isValidPassword(password) && (
              <div className="tr-pw-hint" style={{ marginTop: "8px", fontSize: "13px", color: "#10b981" }}>
                <CheckCircle size={14} style={{ display: "inline", marginRight: "4px" }} />
                Password strength is good
              </div>
            )}
          </div>
          <div className="tr-field">
            <label htmlFor="reg-confirm-password">Confirm Password*</label>
            <div className="tr-pw-wrap">
              <input
                id="reg-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Re-enter password"
                required
                minLength={8}
              />
              <button
                type="button"
                className="tr-pw-toggle"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowConfirmPassword((prev) => !prev);
                }}
                onMouseDown={(event) => event.preventDefault()}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="tr-btn-primary">
            {loading ? (
              <>
                <Loader size={16} className="tr-spin" /> Sending OTP...
              </>
            ) : (
              "Send Verification Code →"
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} noValidate>
          <div className="tr-form-header">
            <div className="tr-otp-icon-wrap">✉️</div>
            <h3>Check Your Email</h3>
            <p>
              We sent a 6-digit verification code to <strong>{email}</strong>
            </p>
            {resumeTarget && (
              <p className="tr-otp-resume-note">
                After OTP verification, you will continue from{" "}
                <strong>{resumeTarget}</strong>.
              </p>
            )}
          </div>
          {error && (
            <div className="tr-error-box">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <div className="tr-field">
            <label htmlFor="reg-otp">Verification Code*</label>
            <input
              id="reg-otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="• • • • • •"
              className="tr-otp-input"
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="tr-btn-primary"
          >
            {loading ? (
              <>
                <Loader size={16} className="tr-spin" /> Verifying...
              </>
            ) : (
              "Verify & Continue →"
            )}
          </button>
          <div className="tr-resend-row">
            <span>Didn't receive code?</span>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={countdown > 0 || loading}
              className="tr-resend-btn"
            >
              {countdown > 0 ? (
                `Resend in ${countdown}s`
              ) : (
                <>
                  <RefreshCw size={14} /> Resend Code
                </>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPhase("email")}
            className="tr-back-link"
          >
            ← Change Email
          </button>
        </form>
      )}
    </div>
  );
};

// --- Step 2: Personal Details ---
const buildStep2FormState = (email = "", regData = {}) => ({
  email: email || regData.email || "",
  firstName: regData.firstName || "",
  lastName: regData.lastName || "",
  mobile: regData.mobile || regData.phone || "",
  qualification: regData.qualification || "",
  city: regData.city || "",
  cityId: regData.cityId || "",
  address: regData.address || "",
  specialization: regData.specialization || "",
  experience: regData.experience ?? "",
  college: regData.college || "",
  collegeId: regData.collegeId || "",
  course: regData.course || "",
  courseId: regData.courseId || "",
});

const Step2 = ({ email, regData, onComplete, onBack, onDraftChange }) => {
  const [form, setForm] = useState(() => buildStep2FormState(email, regData));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cities, setCities] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [courses, setCourses] = useState([]);
  const [collegeSearch, setCollegeSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");

  useEffect(() => {
    const nextForm = buildStep2FormState(email, regData);
    setForm((prev) =>
      JSON.stringify(prev) === JSON.stringify(nextForm) ? prev : nextForm,
    );
  }, [email, regData]);

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const data = await getCities();
        setCities(data || []);
      } catch (err) {
        console.error("Failed to fetch cities:", err);
      }
    };
    fetchCities();
  }, []);

  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const data = await getTrainingColleges();
        setColleges(data || []);
      } catch (err) {
        console.error("Failed to fetch colleges:", err);
        setColleges([]);
      }
    };
    fetchColleges();
  }, []);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const data = await getTrainingCourses();
        setCourses(data || []);
      } catch (err) {
        console.error("Failed to fetch courses:", err);
        setCourses([]);
      }
    };
    fetchCourses();
  }, []);

  useEffect(() => {
    if (!form.cityId || cities.length === 0) {
      return;
    }

    setForm((prev) => {
      if (prev.city) {
        return prev;
      }

      const matchedCity = cities.find(
        (city) => String(city._id) === String(prev.cityId),
      );
      if (!matchedCity) {
        return prev;
      }

      const next = { ...prev, city: matchedCity.name };
      onDraftChange?.(next);
      return next;
    });
  }, [cities, form.cityId, onDraftChange]);

  useEffect(() => {
    if (!form.collegeId || colleges.length === 0) {
      return;
    }

    setForm((prev) => {
      if (prev.college) {
        return prev;
      }

      const matchedCollege = colleges.find(
        (college) => String(college.id) === String(prev.collegeId),
      );
      if (!matchedCollege) {
        return prev;
      }

      const next = { ...prev, college: matchedCollege.name };
      onDraftChange?.(next);
      return next;
    });
  }, [colleges, form.collegeId, onDraftChange]);

  useEffect(() => {
    if (!form.courseId || courses.length === 0) {
      return;
    }

    setForm((prev) => {
      if (prev.course) {
        return prev;
      }

      const matchedCourse = courses.find(
        (course) => String(course.id) === String(prev.courseId),
      );
      if (!matchedCourse) {
        return prev;
      }

      const next = { ...prev, course: matchedCourse.name };
      onDraftChange?.(next);
      return next;
    });
  }, [courses, form.courseId, onDraftChange]);

  const handleCityChange = (event) => {
    const cityName = event.target.value;
    const matchedCity = cities.find(
      (city) =>
        String(city.name || "").trim().toLowerCase() === cityName.trim().toLowerCase(),
    );
    const next = {
      ...form,
      city: cityName,
      cityId: matchedCity?._id || "",
    };
    setForm(next);
    onDraftChange?.(next);
  };

  const handleCollegeChange = (event) => {
    const collegeName = event.target.value;
    const matchedCollege = colleges.find(
      (college) =>
        String(college.name || "").trim().toLowerCase() === collegeName.trim().toLowerCase(),
    );
    const next = {
      ...form,
      college: collegeName,
      collegeId: matchedCollege?.id || "",
    };
    setForm(next);
    onDraftChange?.(next);
  };

  const handleCourseChange = (event) => {
    const courseName = event.target.value;
    const matchedCourse = courses.find(
      (course) =>
        String(course.name || "").trim().toLowerCase() === courseName.trim().toLowerCase(),
    );
    const next = {
      ...form,
      course: courseName,
      courseId: matchedCourse?.id || "",
    };
    setForm(next);
    onDraftChange?.(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.firstName || !form.lastName || !form.mobile || !form.city?.trim()) {
      setError("First name, last name, phone number, and city are required.");
      return;
    }
    if (!/^\d{10}$/.test(form.mobile)) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    setLoading(true);
    try {
      // ✅ SUCCESS: Profile updated (Parent onComplete calls updateStep2)
      await onComplete(form);
    } catch (err) {
      setError(err.message || "Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => {
    const value = e.target.value;
    const next = { ...form, [k]: value };
    setForm(next);
    onDraftChange?.(next);
  };

  const filteredColleges = colleges.filter((college) =>
    college.name.toLowerCase().includes(collegeSearch.toLowerCase()) ||
    college.city.toLowerCase().includes(collegeSearch.toLowerCase())
  );

  const filteredCourses = courses.filter((course) =>
    course.name.toLowerCase().includes(courseSearch.toLowerCase())
  );

  return (
    <div className="tr-form-wrapper">
      <form onSubmit={handleSubmit} noValidate>
        <div className="tr-form-header">
          <h3>Personal Details</h3>
          <p>
            Tell us more about yourself so we can set up your trainer profile.
          </p>
        </div>
        {error && (
          <div className="tr-error-box">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        <div className="tr-field-row">
          <div className="tr-field">
            <label>First Name*</label>
            <input
              type="text"
              value={form.firstName}
              onChange={set("firstName")}
              placeholder="John"
              required
            />
          </div>
          <div className="tr-field">
            <label>Last Name*</label>
            <input
              type="text"
              value={form.lastName}
              onChange={set("lastName")}
              placeholder="Doe"
              required
            />
          </div>
        </div>
        <div className="tr-field-row">
          <div className="tr-field">
            <label>Phone*</label>
            <input
              type="tel"
              value={form.mobile}
              onChange={set("mobile")}
              placeholder="10-digit number"
              maxLength={10}
              required
            />
          </div>
          <div className="tr-field">
            <label>City*</label>
            <input
              type="text"
              list="trainer-city-options"
              value={form.city}
              onChange={handleCityChange}
              placeholder="Type or select your city"
              required
            />
            <datalist id="trainer-city-options">
              {cities.map((cityOption) => (
                <option key={cityOption._id} value={cityOption.name} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="tr-field-row">
          <div className="tr-field">
            <label>College*</label>
            <input
              type="text"
              list="trainer-college-options"
              value={form.college}
              onChange={(e) => {
                setCollegeSearch(e.target.value);
                handleCollegeChange(e);
              }}
              placeholder="Search and select a college"
              required
            />
            <datalist id="trainer-college-options">
              {filteredColleges.slice(0, 20).map((collegeOption) => (
                <option key={collegeOption.id} value={collegeOption.name} />
              ))}
            </datalist>
          </div>
          <div className="tr-field">
            <label>Course*</label>
            <input
              type="text"
              list="trainer-course-options"
              value={form.course}
              onChange={(e) => {
                setCourseSearch(e.target.value);
                handleCourseChange(e);
              }}
              placeholder="Search and select a course"
              required
            />
            <datalist id="trainer-course-options">
              {filteredCourses.map((courseOption) => (
                <option key={courseOption.id} value={courseOption.name} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="tr-field-row">
          <div className="tr-field">
            <label>Qualification</label>
            <input
              type="text"
              value={form.qualification}
              onChange={set("qualification")}
              placeholder="e.g. B.Tech, MBA"
            />
          </div>
          <div className="tr-field">
            <label>Specialization</label>
            <input
              type="text"
              value={form.specialization}
              onChange={set("specialization")}
              placeholder="e.g. Python, IoT"
            />
          </div>
        </div>
        <div className="tr-field-row">
          <div className="tr-field">
            <label>Years of Experience</label>
            <input
              type="number"
              min="0"
              max="40"
              value={form.experience}
              onChange={set("experience")}
              placeholder="e.g. 5"
            />
          </div>
          <div className="tr-field">
            <label>Full Address</label>
            <input
              type="text"
              value={form.address}
              onChange={set("address")}
              placeholder="House no, Street, Area"
            />
          </div>
        </div>
        <div className="tr-btn-row">
          {typeof onBack === "function" && (
            <button type="button" onClick={onBack} className="tr-btn-secondary">
            ← Back
            </button>
          )}
          <button type="submit" disabled={loading} className="tr-btn-primary">
            {loading ? (
              <>
                <Loader size={16} className="tr-spin" /> Saving...
              </>
            ) : (
              "Save & Next →"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

// --- Step 3: Document Upload ---
const DOCS = [
  {
    key: "selfiePhoto",
    label: "Selfie Photo",
    hint: "Upload a clear front-facing photo of your face (Required for ID Card)",
    required: true,
  },
  {
    key: "aadharFront",
    label: "Aadhaar Card (Front)",
    hint: "JPG / PNG / PDF",
    required: true,
  },
  {
    key: "aadharBack",
    label: "Aadhaar Card (Back)",
    hint: "JPG / PNG / PDF",
    required: true,
  },
  { key: "pan", label: "PAN Card", hint: "JPG / PNG / PDF", required: true },
  {
    key: "degreePdf",
    label: "Degree (Certificate)",
    hint: "JPG / PNG / PDF",
    required: true,
  },
  {
    key: "passbook",
    label: "Bank Passbook / Cheque",
    hint: "JPG / PNG / PDF",
    required: true,
  },
  {
    key: "resumePdf",
    label: "Resume / CV",
    hint: "PDF only",
    required: true,
  },
  {
    key: "passportPhoto",
    label: "Passport Size Photo",
    hint: "Standard Photo Upload",
    required: true,
  },
];

const getDocumentChecklistMap = (regData = {}) => {
  const checklist = Array.isArray(regData?.documentChecklist)
    ? regData.documentChecklist
    : [];

  return checklist.reduce((accumulator, item) => {
    if (!item?.key) {
      return accumulator;
    }

    const reviewState = String(item.reviewState || "")
      .trim()
      .toUpperCase();
    const normalizedReviewState = reviewState || null;
    const isApproved = Boolean(
      item.isApproved || normalizedReviewState === "APPROVED",
    );
    const isRejected = Boolean(
      item.isRejected || normalizedReviewState === "REJECTED",
    );
    const isPendingReview = Boolean(
      item.isPendingReview ||
        (item.uploaded && !isApproved && !isRejected),
    );

    accumulator[item.key] = {
      ...item,
      reviewState: normalizedReviewState,
      isApproved,
      isRejected,
      isPendingReview,
      rejectionReason: item.rejectionReason || null,
    };

    return accumulator;
  }, {});
};

const buildStep3RestoreState = (regData = {}) => {
  const sourceDocuments =
    regData?.documents && typeof regData.documents === "object"
      ? regData.documents
      : regData && typeof regData === "object"
        ? regData
        : {};
  const documentProgress =
    regData?.documentProgress && typeof regData.documentProgress === "object"
      ? regData.documentProgress
      : {};
  const checklistMap = getDocumentChecklistMap(regData);
  const restoredDocPaths = {};
  const restoredStatus = {};
  const restoredPreviewUrls = {};

  DOCS.forEach((doc) => {
    const documentProgressItem = documentProgress[doc.key];
    const checklistItem = checklistMap[doc.key];
    const savedPath =
      sourceDocuments[doc.key] ||
      documentProgressItem?.filePath ||
      documentProgressItem?.url ||
      documentProgressItem?.driveViewLink ||
      documentProgressItem?.driveDownloadLink ||
      null;

    if (!savedPath && !checklistItem?.uploaded && !checklistItem?.isRejected) {
      return;
    }

    if (savedPath) {
      restoredDocPaths[doc.key] = savedPath;
      restoredStatus[doc.key] = "success";
    } else if (checklistItem?.isRejected) {
      restoredStatus[doc.key] = "error";
    }

    if (doc.isCamera && savedPath) {
      restoredPreviewUrls[doc.key] = getImagePreviewUrl(
        documentProgressItem || savedPath,
      );
    }
  });

  return {
    restoredDocPaths,
    restoredStatus,
    restoredPreviewUrls,
  };
};

const Step3 = ({
  email,
  regData,
  onComplete,
  onBack,
  onDraftChange,
  onStepConflict,
}) => {
  const initialStep3State = buildStep3RestoreState(regData);
  const [files, setFiles] = useState({});
  const [status, setStatus] = useState(initialStep3State.restoredStatus); // idle | uploading | success | error
  const [docPaths, setDocPaths] = useState(initialStep3State.restoredDocPaths);
  const [previewUrls, setPreviewUrls] = useState(
    initialStep3State.restoredPreviewUrls,
  );
  const [error, setError] = useState("");
  const [uploadErrors, setUploadErrors] = useState({});
  const [completing, setCompleting] = useState(false);
  const [refreshingProgress, setRefreshingProgress] = useState(false);
  const docPathsRef = useRef(initialStep3State.restoredDocPaths);
  const getDocLabel = (key) => DOCS.find((doc) => doc.key === key)?.label || key;
  const checklistMap = getDocumentChecklistMap(regData);
  const fallbackRequiredCount = DOCS.filter((doc) => doc.required).length;
  const requiredCount = Number(
    regData?.documentSummary?.requiredCount ?? fallbackRequiredCount,
  );
  const uploadedFromProgress = Number(regData?.documentSummary?.uploadedCount);
  const uploadedFromPaths = Object.values(docPaths).filter(Boolean).length;
  const uploaded = Math.max(
    uploadedFromPaths,
    Number.isFinite(uploadedFromProgress) ? uploadedFromProgress : 0,
  );
  const approvedCount = Object.values(checklistMap).filter(
    (item) => item.isApproved,
  ).length;
  const pendingReviewCount = Object.values(checklistMap).filter(
    (item) => item.isPendingReview,
  ).length;
  const rejectedCount = Array.isArray(regData?.rejectedDocuments)
    ? regData.rejectedDocuments.length
    : Object.values(checklistMap).filter((item) => item.isRejected).length;
  const hasAllUploaded = Boolean(
    regData?.hasAllRequiredDocuments ||
      uploaded >= requiredCount ||
      (Array.isArray(regData?.missingDocuments) &&
        regData.missingDocuments.length === 0 &&
        uploaded > 0),
  );
  const missingCount = hasAllUploaded
    ? 0
    : Math.max(requiredCount - uploaded, 0);
  const canProceedToAgreement = Boolean(
    regData?.canProceedToAgreement ||
      (hasAllUploaded && rejectedCount === 0) ||
      regData?.allRequiredDocumentsApproved ||
      regData?.documentStatus === "approved" ||
      Number(regData?.registrationStep || 1) >= 4,
  );
  const waitingForAdminReview =
    hasAllUploaded &&
    !canProceedToAgreement &&
    rejectedCount === 0 &&
    pendingReviewCount > 0 &&
    !regData?.allRequiredDocumentsApproved;
  const primaryButtonLabel = canProceedToAgreement
    ? "Continue to Agreement"
    : waitingForAdminReview
      ? "Waiting for Admin Verification"
      : rejectedCount > 0
        ? "Re-upload Rejected Documents"
        : hasAllUploaded
          ? "Continue to Agreement"
          : `Upload All Required Documents (${uploaded}/${requiredCount})`;

  useEffect(() => {
    const nextState = buildStep3RestoreState(regData);
    setDocPaths((prev) => ({ ...nextState.restoredDocPaths, ...prev }));
    setStatus((prev) => ({ ...nextState.restoredStatus, ...prev }));
    setPreviewUrls((prev) => ({ ...nextState.restoredPreviewUrls, ...prev }));
  }, [regData]);

  useEffect(() => {
    docPathsRef.current = docPaths;
  }, [docPaths]);

  useEffect(() => {
    if (!email) return;

    let ignore = false;

    const loadProgress = async () => {
      try {
        const progressData = await getTrainerProgress(email);
        if (!ignore && progressData?.email) {
          onDraftChange?.(progressData);
        }
      } catch (progressError) {
        console.error("Failed to sync trainer progress", progressError);
      }
    };

    loadProgress();

    return () => {
      ignore = true;
    };
  }, [email]);

  const refreshProgress = async ({ silent = false } = {}) => {
    if (!email) return null;

    if (!silent) {
      setRefreshingProgress(true);
      setError("");
    }

    try {
      const progressData = await getTrainerProgress(email);
      if (progressData?.email) {
        onDraftChange?.(progressData);
        return progressData;
      }
      return null;
    } catch (progressError) {
      if (!silent) {
        setError(
          progressError.message || "Failed to refresh document review status.",
        );
      }
      return null;
    } finally {
      if (!silent) {
        setRefreshingProgress(false);
      }
    }
  };

  const handlePick = (key) => (e) => {
    const file = e.target.files[0];
    if (file) {
      setError("");
      setUploadErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setFiles((f) => ({ ...f, [key]: file }));
      setStatus((s) => ({ ...s, [key]: "idle" }));
      if (key === "selfiePhoto") {
        try {
          const dataUrl = URL.createObjectURL(file);
          setPreviewUrls((prev) => ({ ...prev, selfiePhoto: dataUrl }));
        } catch (e) {
          console.error("Failed to generate preview URL", e);
        }
      }
    }
  };

  const handleCameraCapture = async (file, dataUrl) => {
    setError("");
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next.selfiePhoto;
      return next;
    });
    setFiles((f) => ({ ...f, selfiePhoto: file }));
    setPreviewUrls((prev) => ({ ...prev, selfiePhoto: dataUrl }));
    await handleUpload("selfiePhoto", file, dataUrl);
  };

  const handleSelfieRetake = () => {
    setError("");
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next.selfiePhoto;
      return next;
    });
    setFiles((prev) => {
      const next = { ...prev };
      delete next.selfiePhoto;
      return next;
    });
    setStatus((prev) => ({ ...prev, selfiePhoto: "idle" }));
    setPreviewUrls((prev) => {
      const next = { ...prev };
      delete next.selfiePhoto;
      return next;
    });
    const nextDocPaths = { ...docPathsRef.current };
    delete nextDocPaths.selfiePhoto;
    docPathsRef.current = nextDocPaths;
    setDocPaths(nextDocPaths);

    const nextDraft = { documents: nextDocPaths };

    if (
      regData?.documentProgress &&
      typeof regData.documentProgress === "object"
    ) {
      const nextDocumentProgress = { ...regData.documentProgress };
      delete nextDocumentProgress.selfiePhoto;
      nextDraft.documentProgress = nextDocumentProgress;
    }

    if (Array.isArray(regData?.documentChecklist)) {
      nextDraft.documentChecklist = regData.documentChecklist.filter(
        (item) => item?.key !== "selfiePhoto",
      );
    }

    if (
      regData?.documentSummary &&
      typeof regData.documentSummary === "object"
    ) {
      nextDraft.documentSummary = {
        ...regData.documentSummary,
        uploadedCount: Object.values(nextDocPaths).filter(Boolean).length,
      };
    }

    onDraftChange?.(nextDraft);
  };

  const handleUpload = async (key, fileOverride = null, previewUrl = null) => {
    const file = fileOverride || files[key];
    if (!file) return false;

    setError("");
    setUploadErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setStatus((s) => ({ ...s, [key]: "uploading" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentType", key);
      if (email) fd.append("email", email);
      const res = await uploadDocument(fd);
      if (res.success && res.data) {
        const savedPath = res.data.filePath || res.data.fileLink;
        const nextDocPaths = {
          ...docPathsRef.current,
          [key]: savedPath,
        };
        docPathsRef.current = nextDocPaths;
        setDocPaths(nextDocPaths);
        onDraftChange?.({ documents: nextDocPaths });
        if (previewUrl) {
          setPreviewUrls((prev) => ({ ...prev, [key]: previewUrl }));
        }
        setFiles((currentFiles) => {
          const nextFiles = { ...currentFiles };
          delete nextFiles[key];
          return nextFiles;
        });
      }
      setStatus((s) => ({ ...s, [key]: "success" }));
      await refreshProgress({ silent: true });
      return true;
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: "error" }));
      const uploadMessage =
        err?.response?.message ||
        err?.message ||
        `Failed to upload ${getDocLabel(key)}. Please try again.`;
      setUploadErrors((prev) => ({ ...prev, [key]: uploadMessage }));
      setError(`Failed to upload ${getDocLabel(key)}: ${uploadMessage}`);
      if (err?.status === 409 && err?.data?.registrationStep) {
        onStepConflict?.(err.data);
      }
      return false;
    }
  };

  const handleContinue = async () => {
    setError("");

    if (!hasAllUploaded) {
      setError(
        `Please upload all required documents before continuing (${uploaded}/${requiredCount} completed).`,
      );
      return;
    }

    if (rejectedCount > 0) {
      setError("Please re-upload the rejected documents before continuing.");
      return;
    }

    setCompleting(true);

    try {
      const latestProgress = await refreshProgress({ silent: true });
      const canContinue = Boolean(
        latestProgress?.canProceedToAgreement ||
          latestProgress?.hasAllRequiredDocuments ||
          canProceedToAgreement,
      );

      if (!canContinue) {
        setError(
          "All documents are not synced yet. Please refresh status and try again.",
        );
        return;
      }

      await onComplete({
        docPaths,
        canProceedToAgreement: true,
      });
    } catch (continueError) {
      setError(
        continueError.message ||
          "Failed to continue to the Agreement step. Please refresh and try again.",
      );
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="tr-form-wrapper">
      <div className="tr-form-header">
        <h3>Upload Documents</h3>
        <p>
          Upload the required documents. Your live selfie will be used for your
          trainer profile and ID card.
        </p>
      </div>
      {error && (
        <div className="tr-error-box">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {rejectedCount > 0 && (
        <div className="tr-error-box">
          <AlertCircle size={16} />
          Some documents were rejected by admin. Re-upload only the rejected
          items to continue.
        </div>
      )}
      {hasAllUploaded && !canProceedToAgreement && rejectedCount > 0 && (
        <div className="tr-error-box">
          <AlertCircle size={16} />
          All required documents are uploaded, but some items were rejected.
          Re-upload only the rejected documents to continue.
        </div>
      )}
      {hasAllUploaded && canProceedToAgreement && !regData?.allRequiredDocumentsApproved && (
        <div className="tr-info-box">
          <FileText size={16} />
          All required documents are uploaded. You can continue to the Agreement
          step while Super Admin reviews your documents.
        </div>
      )}
      {waitingForAdminReview && (
        <div className="tr-info-box">
          <FileText size={16} />
          All required documents are uploaded and currently under admin review.
        </div>
      )}
      {canProceedToAgreement && regData?.allRequiredDocumentsApproved && (
        <div className="tr-info-box">
          <CheckCircle size={16} />
          All required documents are approved. You can continue to the
          Agreement step.
        </div>
      )}

      <div className="tr-upload-progress-bar-wrap">
        <div
          className="tr-upload-progress-bar"
          style={{ width: `${(uploaded / requiredCount) * 100}%` }}
        />
        <span>
          {uploaded} / {requiredCount} documents uploaded
        </span>
      </div>

      <div className="tr-doc-summary-shell">
        <div className="tr-doc-summary-grid">
          <div className="tr-doc-summary-card">
            <span>Uploaded</span>
            <strong>
              {uploaded}/{requiredCount}
            </strong>
          </div>
          <div className="tr-doc-summary-card">
            <span>Approved</span>
            <strong>{approvedCount}</strong>
          </div>
          <div className="tr-doc-summary-card">
            <span>In Review</span>
            <strong>{pendingReviewCount}</strong>
          </div>
          <div className="tr-doc-summary-card">
            <span>{rejectedCount > 0 ? "Rejected" : "Missing"}</span>
            <strong>{rejectedCount > 0 ? rejectedCount : missingCount}</strong>
          </div>
        </div>
        <button
          type="button"
          className="tr-btn-outline tr-doc-refresh-btn"
          onClick={() => refreshProgress()}
          disabled={refreshingProgress || !email}
        >
          {refreshingProgress ? (
            <>
              <Loader size={14} className="tr-spin" /> Refreshing...
            </>
          ) : (
            <>
              <RefreshCw size={14} /> Refresh Status
            </>
          )}
        </button>
      </div>

      <div className="tr-doc-list">
        {DOCS.map((doc) => {
          const s = status[doc.key] || "idle";
          const checklistItem = checklistMap[doc.key];
          const isApproved = Boolean(checklistItem?.isApproved);
          const isRejected = Boolean(checklistItem?.isRejected);
          const hasUploadedPath = Boolean(docPaths[doc.key]);
          const isPendingReview =
            Boolean(checklistItem?.isPendingReview) ||
            (hasUploadedPath && !isApproved && !isRejected);
          const docState =
            s === "uploading"
              ? "uploading"
              : isRejected
                ? "rejected"
                : isApproved
                  ? "approved"
                  : isPendingReview
                    ? "review"
                    : s === "error"
                      ? "error"
                      : "idle";
          const needsUpload = !hasUploadedPath || isRejected;
          const canPickFile = !doc.isCamera && needsUpload;
          const fileInputLabel = files[doc.key]
            ? files[doc.key].name.length > 18
              ? `${files[doc.key].name.slice(0, 18)}...`
              : files[doc.key].name
            : isRejected
              ? "Choose Replacement"
              : "Choose File";

          if (doc.key === "selfiePhoto") {
            const hasPreview = Boolean(
              previewUrls.selfiePhoto ||
              regData?.documentProgress?.selfiePhoto ||
              docPaths.selfiePhoto
            );
            const previewSrc =
              previewUrls.selfiePhoto ||
              getImagePreviewUrl(
                regData?.documentProgress?.selfiePhoto ||
                  docPaths.selfiePhoto,
              );

            return (
              <React.Fragment key={doc.key}>
                <div className={`tr-selfie-upload-wrapper ${docState}`}>
                  <div className="tr-selfie-header-info">
                    <strong>{doc.label}</strong>
                    <span className="tr-doc-hint">{doc.hint}</span>
                    {checklistItem?.rejectionReason && (
                      <span className="tr-doc-reason">
                        Reason: {checklistItem.rejectionReason}
                      </span>
                    )}
                  </div>

                  <div className="tr-selfie-body">
                    <div className="tr-selfie-preview-column">
                      {hasPreview ? (
                        <div className="tr-selfie-avatar-container">
                          <img loading="lazy"
                            src={previewSrc}
                            alt="Selfie Preview"
                            className="tr-selfie-preview-img"
                          />
                          {isApproved && (
                            <div className="tr-selfie-success-badge">
                              <CheckCircle size={16} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="tr-selfie-avatar-placeholder">
                          <User size={36} className="text-slate-400" />
                        </div>
                      )}
                    </div>

                    <div className="tr-selfie-actions-column">
                      {(isApproved || isPendingReview || s === "uploading") && (
                        <span className={`tr-doc-status ${docState}`}>
                          {s === "uploading" ? (
                            <Loader size={16} className="tr-spin" />
                          ) : isApproved ? (
                            <CheckCircle size={16} />
                          ) : (
                            <FileText size={16} />
                          )}
                          {s === "uploading"
                            ? "Uploading..."
                            : isApproved
                              ? "Approved"
                              : "Under Review"}
                        </span>
                      )}

                      {isRejected && (
                        <span className="tr-doc-status rejected">
                          <AlertCircle size={16} /> Rejected
                        </span>
                      )}

                      {needsUpload && (
                        <div className="tr-selfie-input-group">
                          <label className="tr-file-label" htmlFor="file-selfiePhoto">
                            <Upload size={14} /> {fileInputLabel}
                            <input
                              id="file-selfiePhoto"
                              type="file"
                              accept="image/jpeg,image/png"
                              onChange={handlePick("selfiePhoto")}
                              className="tr-file-hidden"
                            />
                          </label>

                          <button
                            type="button"
                            className="tr-doc-upload-btn"
                            disabled={!files.selfiePhoto || s === "uploading"}
                            onClick={() => handleUpload("selfiePhoto")}
                          >
                            {s === "uploading" ? (
                              <Loader size={14} className="tr-spin" />
                            ) : (
                              <Upload size={14} />
                            )}
                            {s === "uploading" ? "Uploading..." : "Upload Photo"}
                          </button>
                        </div>
                      )}

                      {hasPreview && needsUpload && (
                        <button
                          type="button"
                          className="tr-sig-clear mt-2 w-fit"
                          onClick={handleSelfieRetake}
                        >
                          Clear / Choose Another
                        </button>
                      )}
                    </div>
                  </div>

                  {s === "uploading" && (
                    <div className="tr-doc-uploading-panel">
                      <DocumentUploadLoadingState
                        compact
                        title={doc.label}
                        hint="Scanning and securely uploading your profile photo."
                        steps={["Scanning file", "Securing upload", "Updating profile"]}
                      />
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={doc.key}>
              <div className={`tr-doc-item ${docState}`}>
                <div className="tr-doc-info">
                  <strong>{doc.label}</strong>
                  <span className="tr-doc-hint">{doc.hint}</span>
                  {checklistItem?.rejectionReason && (
                    <span className="tr-doc-reason">
                      Reason: {checklistItem.rejectionReason}
                    </span>
                  )}
                </div>
                <div className="tr-doc-actions">
                  {(isApproved || isPendingReview || s === "uploading") && (
                    <span className={`tr-doc-status ${docState}`}>
                      {s === "uploading" ? (
                        <Loader size={16} className="tr-spin" />
                      ) : isApproved ? (
                        <CheckCircle size={16} />
                      ) : (
                        <FileText size={16} />
                      )}
                      {s === "uploading"
                        ? "Uploading..."
                        : isApproved
                          ? "Approved"
                          : "Under Review"}
                    </span>
                  )}
                  {isRejected && (
                    <span className="tr-doc-status rejected">
                      <AlertCircle size={16} /> Rejected
                    </span>
                  )}
                  {doc.isCamera && needsUpload && (
                    <div className="tr-camera-trigger-wrap">
                      <span className="tr-doc-hint-inline">
                        {s === "uploading"
                          ? "Saving to profile..."
                          : isRejected
                            ? "Capture a new live selfie and upload again"
                            : "Capture saves directly to trainer profile"}
                      </span>
                    </div>
                  )}
                  {canPickFile && (
                    <label className="tr-file-label" htmlFor={`file-${doc.key}`}>
                      <Upload size={14} /> {fileInputLabel}
                      <input
                        id={`file-${doc.key}`}
                        type="file"
                        accept={
                          doc.key === "resumePdf"
                            ? ".pdf"
                            : doc.key === "passportPhoto" ||
                                doc.key === "selfiePhoto"
                              ? "image/jpeg,image/png"
                              : "image/jpeg,image/png,application/pdf"
                        }
                        onChange={handlePick(doc.key)}
                        className="tr-file-hidden"
                      />
                    </label>
                  )}
                  {!doc.isCamera && needsUpload && (
                    <button
                      type="button"
                      className="tr-doc-upload-btn"
                      disabled={!files[doc.key] || s === "uploading"}
                      onClick={() => handleUpload(doc.key)}
                    >
                      {s === "uploading" ? (
                        <Loader size={14} className="tr-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      {s === "uploading"
                        ? "Uploading..."
                        : isRejected
                          ? "Upload Replacement"
                          : s === "error"
                            ? "Retry"
                            : "Upload"}
                    </button>
                  )}
                  {doc.isCamera && s === "error" && files[doc.key] && (
                    <button
                      type="button"
                      className="tr-doc-upload-btn"
                      disabled={s === "uploading"}
                      onClick={() =>
                        handleUpload(
                          doc.key,
                          files[doc.key],
                          previewUrls[doc.key],
                        )
                      }
                    >
                      <Upload size={14} />
                      Retry Save
                    </button>
                  )}
                </div>
                {s === "uploading" && (
                  <div className="tr-doc-uploading-panel">
                    <DocumentUploadLoadingState
                      compact
                      title={doc.label}
                      hint={
                        doc.isCamera
                          ? "Saving your live capture to the trainer profile."
                          : "Scanning and securely uploading this document."
                      }
                      steps={
                        doc.isCamera
                          ? ["Preparing capture", "Securing upload", "Updating profile"]
                          : ["Scanning file", "Securing upload", "Updating registration"]
                      }
                    />
                  </div>
                )}
              </div>
              {doc.isCamera && (
                <div className="tr-camera-wrapper-active">
                  <SelfieCapture
                    value={
                      previewUrls.selfiePhoto ||
                      getImagePreviewUrl(
                        regData?.documentProgress?.selfiePhoto ||
                          docPaths.selfiePhoto,
                      )
                    }
                    previewCandidates={
                      previewUrls.selfiePhoto
                        ? [previewUrls.selfiePhoto]
                        : getDocumentImagePreviewCandidates(
                            regData?.documentProgress?.selfiePhoto ||
                              docPaths.selfiePhoto,
                          )
                    }
                    uploading={s === "uploading"}
                    status={s}
                    uploadError={uploadErrors.selfiePhoto}
                    readOnly={Boolean(hasUploadedPath && !isRejected)}
                    allowRetake
                    onCapture={handleCameraCapture}
                    onRetake={handleSelfieRetake}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="tr-btn-row">
        {typeof onBack === "function" && (
          <button type="button" onClick={onBack} className="tr-btn-secondary">
          ← Back
          </button>
        )}
        <button
          type="button"
          onClick={handleContinue}
          disabled={
            completing ||
            !hasAllUploaded ||
            rejectedCount > 0
          }
          className="tr-btn-primary"
        >
          {completing ? (
            <>
              <Loader size={16} className="tr-spin" /> Checking Progress...
            </>
          ) : (
            primaryButtonLabel
          )}
        </button>
      </div>
    </div>
  );
};

// --- Step 4: NDA Agreement + Signature ---
const Step4 = ({
  regData,
  onComplete,
  onBack,
  agreementTemplate = FALLBACK_NDA_TEMPLATE,
  agreementTemplateLoading = false,
}) => {
  const sigRef = useRef(null);
  const initialAgreementAccepted = Boolean(
    regData?.agreementAccepted ?? regData?.agreementAccepted,
  );
  const acceptanceConditions = getAcceptanceConditions(agreementTemplate);
  const [acceptedConditions, setAcceptedConditions] = useState(() =>
    acceptanceConditions.map(() => initialAgreementAccepted),
  );
  const [hasSig, setHasSig] = useState(Boolean(regData?.signature));
  const [error, setError] = useState("");
  const allConditionsAccepted =
    acceptanceConditions.length > 0 && acceptedConditions.every(Boolean);

  useEffect(() => {
    if (regData?.signature && sigRef.current) {
      try {
        sigRef.current.fromDataURL(regData.signature);
        setHasSig(true);
      } catch (loadError) {
        console.error("Failed to restore signature", loadError);
      }
    }
  }, [regData?.signature]);

  useEffect(() => {
    setAcceptedConditions((current) => {
      if (current.length === acceptanceConditions.length) {
        return current;
      }

      return acceptanceConditions.map(
        (_, index) => current[index] ?? initialAgreementAccepted,
      );
    });
  }, [acceptanceConditions.length, initialAgreementAccepted]);

  const handleClear = () => {
    sigRef.current?.clear();
    setHasSig(false);
  };

  const handleConditionToggle = (index, checked) => {
    setAcceptedConditions((current) =>
      current.map((value, itemIndex) =>
        itemIndex === index ? checked : value,
      ),
    );
    setError("");
  };

  const handleSubmit = async () => {
    if (!allConditionsAccepted) {
      setError("Please accept all agreement conditions to continue.");
      return;
    }
    if (!hasSig || sigRef.current?.isEmpty()) {
      setError("Please provide your signature.");
      return;
    }
    setError("");
    try {
      const signatureDataUrl = sigRef.current
        .getCanvas()
        .toDataURL("image/png");
      await onComplete({
        signature: signatureDataUrl,
        agreementAccepted: true,
        agreementDate: new Date().toISOString(),
      });
    } catch (err) {
      setError(
        err.message || "Failed to save agreement. Please try again.",
      );
    }
  };

  return (
    <div className="tr-form-wrapper">
      <div className="tr-form-header">
        <Pen size={28} className="tr-form-icon" />
        <h3>{agreementTemplate?.title || FALLBACK_NDA_TEMPLATE.title}</h3>
        <p>{agreementTemplate?.introText || FALLBACK_NDA_TEMPLATE.introText}</p>
      </div>
      {error && (
        <div className="tr-error-box">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="tr-agreement-scroll">
        {agreementTemplateLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader size={16} className="animate-spin" />
            Loading latest NDA content...
          </div>
        ) : (
          <pre className="tr-agreement-text">
            {agreementTemplate?.content || FALLBACK_NDA_TEMPLATE.content}
          </pre>
        )}
      </div>

      <div className="tr-checkbox-group">
        {acceptanceConditions.map((condition, index) => (
          <label
            key={`agreement-condition-${index}`}
            className="tr-checkbox-row"
          >
            <input
              type="checkbox"
              checked={acceptedConditions[index] || false}
              onChange={(e) =>
                handleConditionToggle(index, e.target.checked)
              }
            />
            <span>{condition}</span>
          </label>
        ))}
      </div>

      <div className="tr-sig-area">
        <div className="tr-sig-header">
          <span>Draw Your Signature Below</span>
          <button type="button" onClick={handleClear} className="tr-sig-clear">
            <Trash2 size={14} /> Clear
          </button>
        </div>
        <SignatureCanvas
          ref={sigRef}
          penColor="#1a1a2e"
          onEnd={() => setHasSig(true)}
          canvasProps={{
            className: "tr-sig-canvas",
            id: "signature-canvas",
          }}
        />
        <p className="tr-sig-hint">Sign above using your mouse or touch</p>
      </div>

      <div className="tr-btn-row">
        {typeof onBack === "function" && (
          <button type="button" onClick={onBack} className="tr-btn-secondary">
          ← Back
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allConditionsAccepted || !hasSig}
          className="tr-btn-primary"
        >
          Save Agreement & Continue →
        </button>
      </div>
    </div>
  );
};

const REGISTRATION_FLOW_STEPS = [
  {
    step: 1,
    stepperLabel: "Email Verify",
    resumeLabel: "Email Verified",
  },
  {
    step: 2,
    stepperLabel: "Details",
    resumeLabel: "Details",
  },
  {
    step: 3,
    stepperLabel: "Documents",
    resumeLabel: "Upload Documents",
  },
  {
    step: 4,
    stepperLabel: "Agreement",
    resumeLabel: "Agreement",
  },
  {
    step: 5,
    stepperLabel: "Password",
    resumeLabel: "Password",
  },
];

const getSafeRegistrationStep = (value) => {
  const numericStep = Number(value) || 1;
  return Math.min(Math.max(numericStep, 1), 6);
};

const getTrainerSignupStepPath = (value = 1) => {
  const safeStep = getSafeRegistrationStep(value);
  return safeStep <= 1 ? "/trainer-signup" : `/trainer-signup/step${safeStep}`;
};

const navigateIntoSignupStep = (router, step, regData = {}) => {
  const safeStep = getSafeRegistrationStep(step);

  writeSignupSession({
    step: safeStep,
    regData: normalizeAgreementState({
      ...regData,
      registrationStep: safeStep,
    }),
    resumedData: null,
    showResumePrompt: false,
  });

  safeRouterReplace(router, getTrainerSignupStepPath(safeStep));
};

const getTrainerSignupRouteStep = (stepSlug = "") => {
  const match = String(stepSlug || "")
    .trim()
    .match(/^step(\d+)$/i);

  return match ? getSafeRegistrationStep(match[1]) : 1;
};

const isCompletedStepConflict = (error, minimumStep) =>
  Number(error?.status || 0) === 409 &&
  Number(error?.data?.registrationStep || 0) >= minimumStep;

const getResumeProgress = (registrationStep) => {
  const safeStep = getSafeRegistrationStep(registrationStep);
  const completedCount = Math.max(
    0,
    Math.min(safeStep - 1, REGISTRATION_FLOW_STEPS.length),
  );

  return {
    safeStep,
    completedCount,
    percent: Math.round(
      (completedCount / REGISTRATION_FLOW_STEPS.length) * 100,
    ),
    nextStep:
      safeStep <= REGISTRATION_FLOW_STEPS.length
        ? REGISTRATION_FLOW_STEPS[safeStep - 1]
        : null,
  };
};

const Step5 = ({ regData, onComplete, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState(regData.password || "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (loading || submitted) return;

    setError("");

    if (!isValidPassword(password)) {
      const msg = PASSWORD_MIN_LENGTH_MESSAGE;
      setError(msg);
      notify.error(msg);
      return;
    }

    if (password !== confirmPassword) {
      const msg = "Passwords do not match.";
      setError(msg);
      notify.error(msg);
      return;
    }

    setLoading(true);
    try {
      await onComplete({ password });
      setSubmitted(true);
    } catch (err) {
      const message = err.message || "Failed to complete registration.";
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tr-form-wrapper">
      <h3 style={{ marginBottom: "8px", color: "var(--primary-blue, #174264)" }}>
        Create Your Password
      </h3>
      <p style={{ marginBottom: "20px", color: "#64748B", fontSize: "14px" }}>
        Set a secure password for your trainer account.
      </p>

      {error && (
        <div className="tr-error-box">
          <AlertCircle size={16} />{error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="tr-field-group">
          <label htmlFor="step5-password">Password*</label>
          <div className="tr-input-icon-wrapper">
            <input
              id="step5-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 characters)"
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="tr-toggle-password"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {password && !isValidPassword(password) && (
            <p className="tr-field-hint" style={{ color: "#EF4444" }}>
              Password must contain: uppercase, lowercase, digit, and special character
            </p>
          )}
          {password && isValidPassword(password) && (
            <p className="tr-field-hint" style={{ color: "#22C55E" }}>
              ✓ Password strength is good
            </p>
          )}
        </div>

        <div className="tr-field-group">
          <label htmlFor="step5-confirm-password">Confirm Password*</label>
          <div className="tr-input-icon-wrapper">
            <input
              id="step5-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="tr-toggle-password"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="tr-field-hint" style={{ color: "#EF4444" }}>
              Passwords do not match
            </p>
          )}
        </div>

        <div className="tr-btn-row" style={{ marginTop: "24px" }}>
          <button
            type="submit"
            className="tr-btn-primary"
            disabled={loading || submitted || !password || !confirmPassword}
          >
            {loading ? (
              <><Loader size={16} className="tr-spin" /> Submitting…</>
            ) : submitted ? (
              "Submitted ✓"
            ) : (
              "Complete Registration"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

// --- Final Step: Pending Approval ---
const StepSuccess = () => {
  const router = useRouter();
  return (
    <div className="tr-success-panel">
      <div className="tr-success-icon-wrap">
        <CheckCircle size={64} />
      </div>
      <h2>Registration Submitted!</h2>
      <p>Your profile and documents have been received successfully.</p>
      <div className="tr-status-card">
        <div className="tr-status-row">
          <span>Status</span>
          <span className="tr-status-badge pending">⏳ PENDING APPROVAL</span>
        </div>
        <div className="tr-status-row">
          <span>Next Step</span>
          <span>Super Admin Review</span>
        </div>
        <div className="tr-status-row">
          <span>After Approval</span>
          <span>Use your approved email and password to log in</span>
        </div>
      </div>
      <p className="tr-success-note">
        Our verification team will review your documents within 1–3 business
        days. Once approved, you will receive a confirmation email with your{" "}
        <strong>Trainer ID</strong> and account activation update.
      </p>
      <button
        onClick={() => router.push("/login?type=trainer")}
        className="tr-btn-primary"
        style={{ marginBottom: "12px" }}
      >
        Go to Trainer Login
      </button>
      <button onClick={() => router.push("/")} className="tr-btn-outline">
        ← Go to Home
      </button>
    </div>
  );
};

// --- Main Component ---
const TrainerRegistration = () => {
  const router = useRouter();
  const { stepSlug } = useParams();
  const [step, setStep] = useState(1);
  const [existingStatus, setExistingStatus] = useState(null);
  const [regData, setRegData] = useState({
    email: "",
    password: "",
    signature: "",
    agreementAccepted: false,
    agreementDate: null,
  });

  const [resumedData, setResumedData] = useState(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [agreementTemplate, setAgreementTemplate] = useState(
    FALLBACK_NDA_TEMPLATE,
  );
  const [agreementTemplateLoading, setAgreementTemplateLoading] =
    useState(true);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const hasTriggeredFinalSubmitRef = useRef(false);

  const hydrateRegistrationState = (data) => {
    if (!data) return;

    const safeStep = getSafeRegistrationStep(data.registrationStep || 1);
    const { registrationStep, ...rest } = normalizeAgreementState(data);

    setRegData((prev) => ({
      ...prev,
      ...rest,
      email: rest.email || prev.email,
    }));
    setExistingStatus(null);
    setStep(safeStep);
    setShowResumePrompt(false);
  };

  useEffect(() => {
    let isMounted = true;

    const fetchAgreementTemplate = async () => {
      try {
        setAgreementTemplateLoading(true);
        const response = await getNdaTemplate();
        const template = response?.data || response;

        if (isMounted && template) {
          setAgreementTemplate(normalizeAgreementTemplate(template));
        }
      } catch (error) {
        console.error("Failed to load NDA agreement template", error);
      } finally {
        if (isMounted) {
          setAgreementTemplateLoading(false);
        }
      }
    };

    fetchAgreementTemplate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const restoreSession = async () => {
      const sessionData = readSignupSession();
      if (!sessionData?.regData?.email) {
        if (!ignore) {
          setIsRestoringSession(false);
        }
        return;
      }

      const normalizedSessionData = normalizeAgreementState(sessionData.regData);

      if (!ignore) {
        setRegData((prev) => ({
          ...prev,
          ...normalizedSessionData,
          email: normalizedSessionData.email || prev.email,
        }));
      }

      try {
        const progressData = await getTrainerProgress(normalizedSessionData.email);

        if (ignore) {
          return;
        }

        if (progressData?.email) {
          const normalizedProgressData = normalizeAgreementState(progressData);

          if (sessionData.showResumePrompt) {
            const safeStep = getSafeRegistrationStep(
              normalizedProgressData.registrationStep || 1,
            );

            if (safeStep >= 6) {
              hydrateRegistrationState(normalizedProgressData);
            } else {
              setResumedData(normalizedProgressData);
              setShowResumePrompt(true);
              setExistingStatus(null);
              setStep(safeStep);
            }
          } else {
            hydrateRegistrationState(normalizedProgressData);
          }

          setIsRestoringSession(false);
          return;
        }
      } catch (error) {
        console.error("Failed to restore trainer progress from backend", error);
      }

      if (ignore) {
        return;
      }

      if (sessionData.showResumePrompt && sessionData.resumedData) {
        setResumedData(normalizeAgreementState(sessionData.resumedData));
        setShowResumePrompt(true);
      } else {
        const safeStep = getSafeRegistrationStep(sessionData.step || 1);
        if (safeStep > 1) {
          setStep(safeStep);
        }
      }

      setIsRestoringSession(false);
    };

    restoreSession();

    return () => {
      ignore = true;
    };
  }, []);

  const openResumePrompt = (data) => {
    if (!data) return;

    const safeStep = getSafeRegistrationStep(data.registrationStep || 1);
    const normalizedData = normalizeAgreementState({
      ...data,
      registrationStep: safeStep,
    });

    if (safeStep >= 6) {
      hydrateRegistrationState(normalizedData);
      return;
    }

    setResumedData(normalizedData);
    setShowResumePrompt(true);
  };

  const handleContinue = () => {
    if (resumedData) {
      hydrateRegistrationState(resumedData);
    }
  };

  const handleStartOver = () => {
    clearSignupSession();
    setResumedData(null);
    setRegData({
      email: "",
      password: "",
      signature: "",
      agreementAccepted: false,
      agreementDate: null,
    });
    setExistingStatus(null);
    setStep(1);
    setShowResumePrompt(false);
  };

  const syncProgressFromBackend = async (emailToSync) => {
    if (!emailToSync) {
      return null;
    }

    const progressData = await getTrainerProgress(emailToSync);
    if (progressData?.email) {
      hydrateRegistrationState(progressData);
      return progressData;
    }

    return null;
  };

  useEffect(() => {
    if (isRestoringSession) {
      return;
    }

    const routeStep = getTrainerSignupRouteStep(stepSlug);
    const visibleStep = existingStatus ? 6 : step;
    const currentPath = getTrainerSignupStepPath(routeStep);
    const targetPath = getTrainerSignupStepPath(visibleStep);

    if (currentPath !== targetPath) {
      safeRouterReplace(router, targetPath);
    }
  }, [existingStatus, isRestoringSession, router, step, stepSlug]);

  useEffect(() => {
    if (isRestoringSession) return;

    const shouldPersist =
      Boolean(regData.email) && (step > 1 || showResumePrompt);

    if (!shouldPersist) return;

    writeSignupSession({
      step,
      regData,
      resumedData,
      showResumePrompt,
    });
  }, [isRestoringSession, step, regData, resumedData, showResumePrompt]);

  const updateRegData = (newData) =>
    setRegData((prev) => ({ ...prev, ...newData }));

  const resumeProgress = getResumeProgress(resumedData?.registrationStep || 1);
  const resumeName =
    resumedData?.firstName ||
    resumedData?.name ||
    resumedData?.email?.split("@")[0] ||
    "Trainer";
  const displayStep = existingStatus ? 6 : step;

  return (
    <div className="tr-root">
      <div className="tr-bg-pattern" />
      <div className="tr-card">
        {/* --- Left Brand Panel --- */}
        <div className="tr-brand-panel">
          <div className="tr-brand-glow" />
          <img src="/logos/mbkz-256.png" alt="MBK Logo" className="tr-brand-logo" loading="lazy" />
          <div className="tr-brand-text">
            <h2>Trainer Registration</h2>
            <p>
              Join our expert network of trainers and make a lasting impact.
            </p>
          </div>
          <div className="tr-brand-steps">
            {[
              { icon: <Mail size={18} />, label: "Verify Email" },
              { icon: <User size={18} />, label: "Your Details" },
              { icon: <FileText size={18} />, label: "Upload Docs" },
              { icon: <Pen size={18} />, label: "Sign Agreement" },
              { icon: <User size={18} />, label: "Set Password" },
            ].map((s, i) => (
              <div
                key={s.label}
                className={`tr-brand-step ${displayStep > i + 1 ? "done" : displayStep === i + 1 ? "active" : ""}`}
              >
                <div className="tr-brand-step-icon">{s.icon}</div>
                <span className="tr-brand-step-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* --- Right Content Panel --- */}
        <div className="tr-content-panel">
          {showResumePrompt ? (
            <div className="tr-resume-prompt">
              <div className="tr-resume-icon">
                <CheckCircle size={36} />
              </div>
              <h3>Welcome back {resumeName}</h3>
              <p>
                Continue your registration from the last saved step. Your
                progress is already stored securely.
              </p>
              <div className="tr-resume-progress-card">
                <div className="tr-resume-progress-head">
                  <span>Registration Progress</span>
                  <strong>{resumeProgress.percent}%</strong>
                </div>
                <div className="tr-resume-progress-bar">
                  <span style={{ width: `${resumeProgress.percent}%` }} />
                </div>
                <div className="tr-resume-step-list">
                  {REGISTRATION_FLOW_STEPS.map((item) => {
                    const isDone = item.step < resumeProgress.safeStep;
                    const isNext = item.step === resumeProgress.safeStep;

                    return (
                      <div
                        key={item.step}
                        className={`tr-resume-step-item ${isDone ? "done" : isNext ? "next" : ""}`}
                      >
                        <span className="tr-resume-step-mark">
                          {isDone ? "✓" : isNext ? "→" : "○"}
                        </span>
                        <span>{item.resumeLabel}</span>
                      </div>
                    );
                  })}
                </div>
                {resumeProgress.nextStep && (
                  <div className="tr-resume-next-step">
                    <span>Next Step</span>
                    <strong>{resumeProgress.nextStep.resumeLabel}</strong>
                  </div>
                )}
              </div>
              <div className="tr-resume-actions">
                <button
                  onClick={handleContinue}
                  className="tr-btn tr-btn-primary"
                >
                  Continue Registration
                </button>
                <button onClick={handleStartOver} className="tr-btn tr-btn-sub">
                  Start Over
                </button>
              </div>
            </div>
          ) : existingStatus ? (
            <ExistingRegistrationStatusPanel
              {...existingStatus}
              onReset={() => setExistingStatus(null)}
            />
          ) : isRestoringSession ? (
            <div className="tr-form-wrapper">
              <div className="tr-form-header">
                <Loader size={28} className="tr-form-icon tr-spin" />
                <h3>Resuming Registration</h3>
                <p>Checking your saved progress and opening the correct step.</p>
              </div>
            </div>
          ) : (
            <>
              {step < 6 && <StepIndicator currentStep={step} totalSteps={5} />}

              {step === 1 && (
                <Step1
                  onExistingStatusChange={setExistingStatus}
                  onComplete={async (data) => {
                    const { registrationStep, ...rest } = data;
                    const safeStep = getSafeRegistrationStep(
                      registrationStep || 2,
                    );

                    try {
                      await createStep1({
                        email: rest.email,
                      });

                      if (safeStep === 2) {
                        navigateIntoSignupStep(router, 2, {
                          ...rest,
                          registrationStep: 2,
                        });
                        return;
                      }

                      if (safeStep > 2 && safeStep < 6) {
                        try {
                          const progressData = await getTrainerProgress(
                            rest.email,
                          );
                          hydrateRegistrationState(
                            progressData?.email
                              ? progressData
                              : {
                                  ...rest,
                                  registrationStep: safeStep,
                                },
                          );
                        } catch (progressError) {
                          console.error(
                            "Resume progress load error:",
                            progressError,
                          );
                          updateRegData(rest);
                          setStep(safeStep);
                        }
                      } else {
                        updateRegData(rest);
                        setStep(safeStep);
                      }
                    } catch (err) {
                      console.error("Step 1 create/save error:", err);
                      updateRegData(rest);
                      setStep(safeStep);
                    }
                  }}
                />
              )}
              {step === 2 && (
                <Step2
                  email={regData.email}
                  regData={regData}
                  onDraftChange={updateRegData}
                  onComplete={async (data) => {
                    // ✅ NEW ARCHITECTURE: Update Step-2 Profile
                    try {
                      const response = await updateStep2({
                        email: regData.email,
                        ...data,
                      });
                      const workflowData = response?.data || {};
                      const nextStep = getSafeRegistrationStep(
                        workflowData.registrationStep || 3,
                      );
                      updateRegData({
                        ...data,
                        ...workflowData,
                        registrationStep: nextStep,
                      });
                      setStep(nextStep);
                    } catch (err) {
                      if (isCompletedStepConflict(err, 3)) {
                        await syncProgressFromBackend(regData.email || data.email);
                        return;
                      }

                      console.error("Step 2 save error:", err);
                      await syncProgressFromBackend(regData.email || data.email).catch(
                        (progressError) => {
                          console.error(
                            "Step 2 progress sync error:",
                            progressError,
                          );
                        },
                      );
                      throw err;
                    }
                  }}
                />
              )}
              {step === 3 && (
                <Step3
                  email={regData.email}
                  regData={regData}
                  onDraftChange={updateRegData}
                  onStepConflict={(conflictData) => {
                    updateRegData(conflictData);
                    setStep(getSafeRegistrationStep(conflictData.registrationStep));
                  }}
                  onComplete={async ({
                    docPaths,
                    canProceedToAgreement,
                  }) => {
                    if (!canProceedToAgreement) {
                      return;
                    }

                    try {
                      const response = await updateStep3({
                        email: regData.email,
                        documents: docPaths,
                      });
                      const workflowData = response?.data || {};
                      const nextStep = getSafeRegistrationStep(
                        workflowData.registrationStep || 4,
                      );

                      updateRegData({
                        documents: docPaths,
                        ...workflowData,
                        registrationStep: nextStep,
                      });
                      setStep(nextStep);
                    } catch (err) {
                      if (isCompletedStepConflict(err, 4)) {
                        await syncProgressFromBackend(regData.email);
                        return;
                      }

                      console.error("Step 3 save error:", err);
                      await syncProgressFromBackend(regData.email).catch(
                        (progressError) => {
                          console.error(
                            "Step 3 progress sync error:",
                            progressError,
                          );
                        },
                      );
                      throw err;
                    }
                  }}
                />
              )}
              {step === 4 && (
                <Step4
                  regData={regData}
                  agreementTemplate={agreementTemplate}
                  agreementTemplateLoading={agreementTemplateLoading}
                  onComplete={async (agreementData) => {
                    try {
                      const response = await handleSaveStep(
                        regData.email,
                        5,
                        agreementData,
                      );
                      const workflowData = response?.data || {};
                      const nextStep = getSafeRegistrationStep(
                        workflowData.registrationStep || 5,
                      );

                      updateRegData({
                        ...agreementData,
                        ...workflowData,
                        registrationStep: nextStep,
                      });
                      setStep(nextStep);
                    } catch (err) {
                      if (isCompletedStepConflict(err, 5)) {
                        await syncProgressFromBackend(regData.email);
                        return;
                      }

                      console.error("Step 4 save error:", err);
                      await syncProgressFromBackend(regData.email).catch(
                        (progressError) => {
                          console.error(
                            "Step 4 progress sync error:",
                            progressError,
                          );
                        },
                      );
                      throw err;
                    }
                  }}
                />
              )}
              {step === 5 && (
                <Step5
                  regData={regData}
                  onComplete={async ({ password }) => {
                    if (hasTriggeredFinalSubmitRef.current) {
                      return;
                    }
                    hasTriggeredFinalSubmitRef.current = true;

                    try {
                      const res = await submitFinal({
                        email: regData.email,
                        password,
                        signature: regData.signature,
                        agreementAccepted: regData.agreementAccepted,
                        agreementDate: regData.agreementDate,
                      });

                      if (res.success) {
                        clearSignupSession();
                        localStorage.removeItem("accessToken");
                        localStorage.removeItem("tempRegToken");
                        updateRegData({ password });
                        notify.success("Trainer Registration Successful");
                        setStep(6);
                      }
                    } catch (err) {
                      hasTriggeredFinalSubmitRef.current = false;

                      if (isCompletedStepConflict(err, 6)) {
                        await syncProgressFromBackend(regData.email);
                        return;
                      }

                      console.error("Step 5 submit error:", err);
                      await syncProgressFromBackend(regData.email).catch(
                        (progressError) => {
                          console.error(
                            "Step 5 progress sync error:",
                            progressError,
                          );
                        },
                      );
                      throw err;
                    }
                  }}
                />
              )}
              {step === 6 && <StepSuccess />}
            </>
          )}
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        
        :root {
          --primary-blue: #174264;
          --primary-orange: #F97316;
          --card-bg: #FFFFFF;
          --page-bg: #F8FAFC;
          --border-grey: #D9E0E3;
          --text-white: #FFFFFF;
          --text-dark: #174264;
        }

        .tr-root {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--page-bg);
          padding: 24px;
          font-family: var(--font-inter, Inter), sans-serif;
          color: var(--text-dark);
        }

        /* --- Resume Prompt --- */
        .tr-resume-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 20px;
          animation: trFadeUp 0.6s ease-out;
          height: 100%;
        }

        .tr-resume-icon {
          font-size: 48px;
          margin-bottom: 20px;
          background: rgba(249, 115, 22, 0.1);
          color: var(--primary-orange);
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .tr-resume-prompt h3 {
          font-size: 24px;
          color: var(--text-dark);
          margin-bottom: 12px;
          font-family: var(--font-merriweather, Merriweather), serif;
        }

        .tr-resume-prompt p {
          color: #64748b;
          max-width: 360px;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .tr-resume-progress-card {
          width: 100%;
          max-width: 360px;
          background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 24px;
          text-align: left;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .tr-resume-progress-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-dark);
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .tr-resume-progress-head strong {
          color: var(--primary-orange);
          font-size: 15px;
        }

        .tr-resume-progress-bar {
          height: 10px;
          background: #e2e8f0;
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 16px;
        }

        .tr-resume-progress-bar span {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #F97316 0%, #FB923C 100%);
          border-radius: inherit;
          transition: width 0.3s ease;
        }

        .tr-resume-step-list {
          display: grid;
          gap: 10px;
          margin-bottom: 16px;
        }

        .tr-resume-step-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: #64748b;
          font-weight: 600;
        }

        .tr-resume-step-item.done {
          color: var(--primary-orange);
        }

        .tr-resume-step-item.next {
          color: var(--text-dark);
        }

        .tr-resume-step-mark {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          background: #e2e8f0;
          color: #475569;
          flex-shrink: 0;
        }

        .tr-resume-step-item.done .tr-resume-step-mark {
          background: rgba(249, 115, 22, 0.12);
          color: var(--primary-orange);
        }

        .tr-resume-step-item.next .tr-resume-step-mark {
          background: rgba(23, 66, 100, 0.12);
          color: var(--text-dark);
        }

        .tr-resume-next-step {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          font-size: 13px;
          color: #64748b;
          font-weight: 600;
        }

        .tr-resume-next-step strong {
          color: var(--text-dark);
          font-size: 14px;
        }

        .tr-resume-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          max-width: 280px;
        }

        .tr-btn-sub {
          background: transparent;
          color: #64748b;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .tr-btn-sub:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #475569;
        }

        .tr-bg-pattern {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle at 20% 20%, rgba(249,115,22,0.08) 0%, transparent 50%),
                            radial-gradient(circle at 80% 80%, rgba(251,146,60,0.08) 0%, transparent 50%);
          pointer-events: none;
        }

        .tr-card {
          display: flex;
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1080px;
          min-height: 600px;
          background: var(--card-bg);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 30px 80px -10px rgba(0,0,0,0.1);
          animation: tr-slideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes tr-slideUp {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* === BRAND PANEL === */
        .tr-brand-panel {
          flex: 0 0 320px;
          background: linear-gradient(135deg, #F97316 0%, #EA580C 50%, #B45309 100%);
          color: var(--text-white);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 28px;
          position: relative;
          overflow: hidden;
        }

        .tr-brand-glow {
          position: absolute;
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%);
          top: -60px; left: -60px;
          pointer-events: none;
        }

        .tr-brand-logo {
          width: 120px;
          height: auto;
          border-radius: 20px;
          margin-bottom: 24px;
          filter: drop-shadow(0 8px 20px rgba(0,0,0,0.3));
          z-index: 1;
        }

        .tr-brand-text {
          text-align: center;
          color: white;
          margin-bottom: 32px;
          z-index: 1;
        }
        .tr-brand-text h2 {
          font-family: var(--font-merriweather, Merriweather), serif;
          font-size: 22px;
          font-weight: 900;
          margin: 0 0 8px;
        }
        .tr-brand-text p {
          font-size: 13px;
          opacity: 0.85;
          line-height: 1.5;
          margin: 0;
        }

        .tr-brand-steps { display: flex; flex-direction: column; gap: 12px; width: 100%; z-index: 1; }
        .tr-brand-step {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(255,255,255,0.1);
          transition: all 0.3s;
        }
        .tr-brand-step.active {
          background: rgba(255,255,255,0.25);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .tr-brand-step.done {
          background: rgba(255,255,255,0.15);
          opacity: 0.7;
        }
        .tr-brand-step-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6);
          transition: all 0.3s;
        }
        .tr-brand-step.active .tr-brand-step-icon {
          background: var(--primary-orange);
          color: white;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }
        .tr-brand-step.done .tr-brand-step-icon {
          background: rgba(255,255,255,0.2);
          color: white;
        }
        .tr-brand-step-label { color: white; font-size: 13px; font-weight: 600; opacity: 0.7; transition: opacity 0.3s; }
        .tr-brand-step.active .tr-brand-step-label,
        .tr-brand-step.done .tr-brand-step-label { opacity: 1; }

        /* === CONTENT PANEL === */
        .tr-content-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-radius: 0 24px 24px 0;
          overflow-y: auto;
          max-height: 90vh;
          scrollbar-width: thin;
          scrollbar-color: #E91E63 #f1f1f1;
        }

        /* === STEP INDICATOR === */
        .tr-step-indicator {
          display: flex;
          align-items: center;
          padding: 20px 32px;
          background: #ffffff;
          border-bottom: 1px solid #f0f0f0;
          gap: 0;
        }
        .tr-step-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          flex: 0 0 auto;
        }
        .tr-step-circle {
          width: 32px; height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          background: #e5e7eb;
          color: #6b7280;
          transition: all 0.3s;
        }
        .tr-step-node.active .tr-step-circle {
          background: var(--primary-orange);
          color: white;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
        }
        .tr-step-node.done .tr-step-circle {
          background: var(--primary-orange);
          color: white;
        }
        .tr-step-label {
          font-size: 10px;
          font-weight: 600;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }
        .tr-step-node.active .tr-step-label { color: var(--primary-orange); }
        .tr-step-node.done .tr-step-label { color: var(--primary-orange); }
        .tr-step-line {
          flex: 1;
          height: 2px;
          background: #e5e7eb;
          margin: 0 4px;
          margin-bottom: 18px;
          transition: background 0.3s;
        }
        .tr-step-line.done { background: var(--primary-orange); }

        /* === FORM WRAPPER === */
        .tr-form-wrapper {
          padding: 28px 36px;
          flex: 1;
        }
        .tr-form-header {
          margin-bottom: 24px;
          text-align: center;
        }
        .tr-form-header h3 {
          font-size: 20px;
          font-weight: 800;
          color: #111827;
          margin: 6px 0 6px;
        }
        .tr-form-header p {
          color: #6b7280;
          font-size: 14px;
          margin: 0;
          line-height: 1.5;
        }
        .tr-form-icon {
          color: var(--primary-orange);
        }
        .tr-otp-icon-wrap {
          font-size: 40px;
          margin-bottom: 4px;
        }

        /* === ERROR === */
        .tr-error-box {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 10px 14px;
          color: #dc2626;
          font-size: 13px;
          margin-bottom: 16px;
          line-height: 1.4;
        }

        .tr-info-box {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-radius: 10px;
          padding: 10px 14px;
          color: #047857;
          font-size: 13px;
          margin-bottom: 16px;
          line-height: 1.4;
          font-weight: 600;
        }

        /* === FIELDS === */
        .tr-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-bottom: 14px;
          flex: 1;
        }
        .tr-field label {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .tr-field input,
        .tr-field select {
          padding: 10px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          color: #1f2937;
          background: #ffffff;
          transition: border-color 0.2s, box-shadow 0.2s;
          font-family: var(--font-inter, Inter), sans-serif;
          width: 100%;
        }
        .tr-field input:focus,
        .tr-field select:focus {
          outline: none;
          border-color: var(--primary-orange);
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }
        .tr-field-row {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }
        .tr-field-row .tr-field {
          min-width: 140px;
        }

        .tr-pw-wrap {
          position: relative;
        }
        .tr-pw-wrap input {
          width: 100%;
          padding-right: 44px;
        }
        .tr-pw-toggle {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
          padding: 6px;
          min-width: 36px;
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }
        .tr-pw-toggle:hover { color: var(--primary-orange); }

        /* OTP Input */
        .tr-otp-input {
          text-align: center !important;
          font-size: 28px !important;
          font-weight: 800 !important;
          letter-spacing: 12px !important;
          color: #1a1a2e !important;
          padding: 16px !important;
        }

        .tr-otp-resume-note {
          margin-top: 10px !important;
          color: #0f766e !important;
          font-size: 13px !important;
          font-weight: 600 !important;
        }

        /* Password hints */
        .tr-pw-hints {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          list-style: none;
          padding: 0;
          margin: 0 0 14px;
        }
        .tr-pw-hints li {
          font-size: 11px;
          color: #9ca3af;
          padding: 2px 8px;
          background: #f3f4f6;
          border-radius: 20px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s;
        }
        .tr-pw-hints li.ok {
          color: #059669;
          background: #ecfdf5;
          border-color: #a7f3d0;
        }

        /* Resend row */
        .tr-resend-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin: 12px 0;
          font-size: 13px;
          color: #6b7280;
        }
        .tr-resend-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--primary-orange);
          font-weight: 600;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0;
        }
        .tr-resend-btn:disabled { color: #9ca3af; cursor: not-allowed; }

        /* === BUTTONS === */
        .tr-btn-primary {
          width: 100%;
          padding: 13px 20px;
          background: var(--primary-orange);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          font-family: var(--font-inter, Inter), sans-serif;
          margin-top: 8px;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
        }
        .tr-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #EA580C;
          box-shadow: 0 6px 18px rgba(249, 115, 22, 0.25);
        }
        .tr-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .tr-btn-secondary {
          padding: 11px 20px;
          background: #f3f4f6;
          color: #374151;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: var(--font-inter, Inter), sans-serif;
        }
        .tr-btn-secondary:hover { background: #e5e7eb; }
        .tr-btn-row {
          display: flex;
          gap: 12px;
          margin-top: 12px;
        }
        .tr-btn-row .tr-btn-primary { flex: 1; width: auto; }
        .tr-back-link {
          display: block;
          text-align: center;
          margin-top: 10px;
          background: none;
          border: none;
          color: #6b7280;
          font-size: 13px;
          cursor: pointer;
          text-decoration: underline;
        }
        .tr-btn-outline {
          padding: 11px 28px;
          background: transparent;
          color: #6b7280;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tr-btn-outline:hover { border-color: var(--primary-orange); color: var(--primary-orange); }

        /* === UPLOAD STEP === */
        .tr-upload-progress-bar-wrap {
          position: relative;
          background: #f3f4f6;
          border-radius: 8px;
          height: 8px;
          margin-bottom: 20px;
          overflow: hidden;
        }
        .tr-upload-progress-bar-wrap span {
          position: absolute;
          top: 12px;
          right: 0;
          font-size: 11px;
          color: #6b7280;
        }
        .tr-upload-progress-bar {
          height: 100%;
          background: var(--primary-orange);
          border-radius: 8px;
          transition: width 0.4s ease;
        }

        .tr-doc-summary-shell {
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          gap: 12px;
          margin-top: 26px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }
        .tr-doc-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(110px, 1fr));
          gap: 10px;
          flex: 1;
          min-width: 280px;
        }
        .tr-doc-summary-card {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 14px 16px;
          background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }
        .tr-doc-summary-card span {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 8px;
        }
        .tr-doc-summary-card strong {
          display: block;
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
        }
        .tr-doc-refresh-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-width: 160px;
          white-space: nowrap;
        }

        .tr-doc-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 4px;
          margin-top: 20px;
        }
        .tr-doc-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #ffffff;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          transition: all 0.2s;
          gap: 8px;
          flex-wrap: wrap;
          position: relative;
        }
        .tr-doc-item.success { border-color: #a7f3d0; background: #f0fdf4; }
        .tr-doc-item.error { border-color: #fca5a5; background: #fef2f2; }
        .tr-doc-item.review { border-color: #bfdbfe; background: #eff6ff; }
        .tr-doc-item.uploading { border-color: #93c5fd; background: #eff6ff; }
        .tr-doc-item.rejected { border-color: #fca5a5; background: #fff1f2; }
        .tr-doc-item.approved { border-color: #86efac; background: #f0fdf4; }
        .tr-doc-info { display: flex; flex-direction: column; gap: 1px; }
        .tr-doc-info strong { font-size: 13px; color: #1f2937; }
        .tr-doc-hint { font-size: 11px; color: #9ca3af; }
        .tr-doc-reason {
          font-size: 11px;
          color: #dc2626;
          font-weight: 600;
          margin-top: 4px;
        }
        .tr-doc-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .tr-doc-uploading-panel {
          width: 100%;
          flex-basis: 100%;
          margin-top: 8px;
        }
        .tr-doc-status {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
        }
        .tr-doc-status.success { color: #059669; }
        .tr-doc-status.review,
        .tr-doc-status.uploading { color: #2563eb; }
        .tr-doc-status.approved { color: #059669; }
        .tr-doc-status.rejected { color: #dc2626; }
        .tr-file-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          padding: 6px 10px;
          border: 1.5px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          background: #f9fafb;
          white-space: nowrap;
          overflow: hidden;
          max-width: 160px;
          text-overflow: ellipsis;
        }
        .tr-file-label:hover { border-color: var(--primary-orange); color: var(--primary-orange); }
        .tr-file-hidden { display: none; }
        .tr-doc-upload-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          background: var(--primary-orange);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .tr-doc-upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* === SELFIE PHOTO UPLOAD UI === */
        .tr-selfie-upload-wrapper {
          display: flex;
          flex-direction: column;
          padding: 16px 20px;
          background: #ffffff;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          transition: all 0.2s;
          gap: 12px;
          position: relative;
        }
        .tr-selfie-upload-wrapper.success { border-color: #a7f3d0; background: #f0fdf4; }
        .tr-selfie-upload-wrapper.error { border-color: #fca5a5; background: #fef2f2; }
        .tr-selfie-upload-wrapper.review { border-color: #bfdbfe; background: #eff6ff; }
        .tr-selfie-upload-wrapper.uploading { border-color: #93c5fd; background: #eff6ff; }
        .tr-selfie-upload-wrapper.rejected { border-color: #fca5a5; background: #fff1f2; }
        .tr-selfie-upload-wrapper.approved { border-color: #86efac; background: #f0fdf4; }

        .tr-selfie-header-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .tr-selfie-body {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .tr-selfie-preview-column {
          flex-shrink: 0;
        }
        .tr-selfie-avatar-container {
          position: relative;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid #6366f1;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
          overflow: hidden;
        }
        .tr-selfie-preview-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .tr-selfie-success-badge {
          position: absolute;
          bottom: 2px;
          right: 2px;
          background: #10b981;
          color: white;
          padding: 2px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .tr-selfie-avatar-placeholder {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #f1f5f9;
          border: 2px dashed #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tr-selfie-actions-column {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-grow: 1;
        }
        .tr-selfie-input-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        /* === CAMERA UI === */
        .tr-camera-trigger-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--primary-orange);
          font-weight: 600;
        }
        .tr-doc-hint-inline {
          font-size: 11px;
          color: #64748b;
          font-style: italic;
        }
        .tr-camera-wrapper-active {
          width: 100%;
          background: #f8fafc;
          border: 1.5px dashed #cbd5e1;
          border-radius: 12px;
          padding: 16px;
          margin-top: -4px;
          margin-bottom: 12px;
          animation: trFadeIn 0.3s ease-out;
        }
        @keyframes trFadeIn { from { opacity: 0; } to { opacity: 1; } }

        .tr-camera-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .tr-camera-preview-wrapper {
          position: relative;
          width: 100%;
          max-width: 320px;
          border-radius: 12px;
          overflow: hidden;
          background: #000;
          aspect-ratio: 1/1; /* Square for selfie guide */
        }
        .tr-camera-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .tr-camera-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.3);
          pointer-events: none;
        }
        .tr-camera-guide-circle {
          width: 220px;
          height: 220px;
          border: 3px solid #22c55e; /* Green 500 */
          border-radius: 50%;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.4);
        }
        .tr-camera-guide-text {
          color: white;
          font-size: 14px;
          font-weight: 600;
          margin-top: 16px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
          z-index: 2;
        }
        .tr-camera-controls {
          display: flex;
          gap: 10px;
        }
        .tr-camera-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        .tr-camera-btn.capture {
          background: var(--primary-orange);
          color: white;
        }
        .tr-camera-btn.capture:hover { background: #EA580C; }
        .tr-camera-btn.retake {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
        }
        .tr-camera-btn.retake:hover { background: #e2e8f0; }

        .tr-camera-error {
          padding: 20px;
          text-align: center;
          color: #dc2626;
        }
        .tr-camera-error p { margin: 8px 0 16px; font-size: 13px; }

        /* === AGREEMENT === */
        .tr-agreement-scroll {
          max-height: 200px;
          overflow-y: auto;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          padding: 14px;
          background: #ffffff;
          margin-bottom: 14px;
          scrollbar-width: thin;
        }
        .tr-agreement-text {
          font-size: 11.5px;
          line-height: 1.7;
          color: #374151;
          white-space: pre-wrap;
          font-family: var(--font-inter, Inter), sans-serif;
          margin: 0;
        }
        .tr-checkbox-group {
          display: grid;
          gap: 10px;
          margin-bottom: 16px;
        }
        .tr-checkbox-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 13px;
          color: #374151;
          margin-bottom: 0;
          cursor: pointer;
          line-height: 1.4;
        }
        .tr-checkbox-row input[type="checkbox"] {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          margin-top: 2px;
          accent-color: #E91E63;
          cursor: pointer;
        }

        /* === SIGNATURE === */
        .tr-sig-area {
          margin-bottom: 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }
        .tr-sig-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
          font-size: 12px;
          font-weight: 600;
          color: #374151;
        }
        .tr-sig-clear {
          display: flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 11px;
          color: #6b7280;
          cursor: pointer;
        }
        .tr-sig-clear:hover { border-color: #dc2626; color: #dc2626; }
        .tr-sig-canvas {
          width: 100% !important;
          height: 140px !important;
          background: #fff;
          display: block;
          cursor: crosshair;
        }
        .tr-sig-hint {
          text-align: center;
          font-size: 11px;
          color: #9ca3af;
          padding: 6px;
          background: #f8fafc;
          border-top: 1px solid #e5e7eb;
          margin: 0;
        }

        /* === SUCCESS === */
        .tr-success-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 48px 40px;
          gap: 16px;
        }
        .tr-success-icon-wrap {
          color: #10b981;
          animation: tr-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes tr-pop {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .tr-success-panel h2 {
          font-size: 26px;
          font-weight: 800;
          color: #111827;
          margin: 0;
        }
        .tr-success-panel > p {
          color: #6b7280;
          font-size: 15px;
          margin: 0;
        }
        .tr-status-card {
          width: 100%;
          max-width: 420px;
          border: 1.5px solid #e5e7eb;
          border-radius: 14px;
          overflow: hidden;
          background: #ffffff;
        }
        .tr-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 18px;
          font-size: 14px;
          border-bottom: 1px solid #f3f4f6;
        }
        .tr-status-row:last-child { border-bottom: none; }
        .tr-status-row span:first-child { color: #6b7280; font-weight: 500; }
        .tr-status-row span:last-child { color: #111827; font-weight: 600; }
        .tr-status-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
        }
        .tr-status-badge.pending {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .tr-success-note {
          color: #6b7280;
          font-size: 13px;
          line-height: 1.6;
          max-width: 400px;
          margin: 0;
        }
        .tr-status-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 48px 40px;
          gap: 16px;
        }
        .tr-status-screen-icon {
          width: 84px;
          height: 84px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: tr-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .tr-status-screen-icon.review {
          background: #fff7ed;
          color: #d97706;
        }
        .tr-status-screen-icon.approved {
          background: #ecfdf5;
          color: #059669;
        }
        .tr-status-kicker {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 12px;
          border-radius: 999px;
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .tr-status-screen h2 {
          font-size: 26px;
          font-weight: 800;
          color: #111827;
          margin: 0;
        }
        .tr-status-screen > p {
          color: #6b7280;
          font-size: 15px;
          line-height: 1.6;
          max-width: 480px;
          margin: 0;
        }
        .tr-status-badge.approved {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #86efac;
        }
        .tr-status-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 12px;
        }

        /* === UTILS === */
        .tr-spin {
          animation: tr-rotate 1s linear infinite;
        }
        @keyframes tr-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* === RESPONSIVE === */
        @media (max-width: 768px) {
          .tr-card { flex-direction: column; max-height: none; min-height: auto; }
          .tr-brand-panel { flex: 0 0 auto; padding: 24px 20px; }
          .tr-brand-steps { display: none; }
          .tr-form-wrapper { padding: 20px; }
          .tr-field-row { flex-direction: column; gap: 0; }
          .tr-step-indicator { padding: 14px 16px; }
          .tr-step-label { display: none; }
          .tr-doc-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .tr-doc-refresh-btn { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default TrainerRegistration;
