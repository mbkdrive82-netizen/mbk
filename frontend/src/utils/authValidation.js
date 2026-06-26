export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;
export const FULL_NAME_REGEX = /^[a-zA-Z][a-zA-Z\s.'-]{1,99}$/;
export const WEBSITE_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be ${PASSWORD_MIN_LENGTH}+ characters with uppercase, lowercase, digit, and special character.`;

export const sanitizePhoneInput = (value) =>
  String(value || '').replace(/\D/g, '').slice(0, 10);

export const isValidEmail = (email) =>
  EMAIL_REGEX.test(String(email || '').trim().toLowerCase());

export const isValidIndianPhone = (phone) =>
  INDIAN_PHONE_REGEX.test(sanitizePhoneInput(phone));

// Require at least one lowercase, one uppercase, one digit and one special char
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const isValidPassword = (password) =>
  PASSWORD_COMPLEXITY_REGEX.test(String(password || ''));

export const isValidFullName = (name) => {
  const trimmed = String(name || '').trim();
  return trimmed.length >= 2 && FULL_NAME_REGEX.test(trimmed);
};

export const isValidTrainerEmailOrLoginId = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (trimmed.includes('@')) return isValidEmail(trimmed);
  return /^[a-zA-Z0-9._-]{3,50}$/.test(trimmed);
};

export const isValidWebsite = (website) => {
  const trimmed = String(website || '').trim();
  if (!trimmed) return true;
  return WEBSITE_REGEX.test(trimmed);
};

export const validateLoginForm = ({ email, password }) => {
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '');
  if (!trimmedEmail) return 'Email is required.';
  if (!isValidEmail(trimmedEmail)) return 'Please enter a valid email address.';
  if (!trimmedPassword.trim()) return 'Password is required.';
  return '';
};

/** True when email + password are present and valid enough to attempt login. */
export const hasLoginCredentials = (credentials) =>
  validateLoginForm(credentials) === '';

export const validateStudentSignup = (form) => {
  if (!isValidFullName(form.fullName || form.name)) {
    return 'Please enter a valid full name (letters only, min 2 characters).';
  }
  if (!isValidEmail(form.email)) return 'Please enter a valid email address.';
  if (!isValidIndianPhone(form.phone || form.phoneNumber)) {
    return 'Please enter a valid 10-digit mobile number starting with 6–9.';
  }
  if (!String(form.college || form.collegeName || '').trim()) {
    return 'Please enter your college or institute.';
  }
  if (!String(form.course || '').trim()) return 'Please select a course.';
  if (!isValidPassword(form.password)) {
    return PASSWORD_MIN_LENGTH_MESSAGE;
  }
  if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  return '';
};

export const validateCompanySignup = (form, { requireAdminName = false } = {}) => {
  if (!String(form.companyName || '').trim()) return 'Please enter company name.';
  if (requireAdminName && !isValidFullName(form.adminName)) {
    return 'Please enter a valid admin full name.';
  }
  if (!isValidEmail(form.email)) return 'Please enter a valid email address.';
  if (!isValidIndianPhone(form.phone)) {
    return 'Please enter a valid 10-digit mobile number starting with 6–9.';
  }
  if (!String(form.address || '').trim()) return 'Please enter company address.';
  if (!isValidWebsite(form.website)) return 'Please enter a valid website URL.';
  if (!isValidPassword(form.password)) {
    return PASSWORD_MIN_LENGTH_MESSAGE;
  }
  if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  return '';
};

export const validateTrainerSignup = (form) => {
  if (!isValidFullName(form.name)) {
    return 'Please enter a valid full name (letters only, min 2 characters).';
  }
  if (!isValidTrainerEmailOrLoginId(form.email)) {
    return 'Please enter a valid email address or login ID (min 3 characters).';
  }
  if (!isValidIndianPhone(form.phoneNumber || form.phone)) {
    return 'Please enter a valid 10-digit mobile number starting with 6–9.';
  }
  if (!isValidPassword(form.password)) {
    return PASSWORD_MIN_LENGTH_MESSAGE;
  }
  return '';
};
