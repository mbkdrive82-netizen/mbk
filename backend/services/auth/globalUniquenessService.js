/**
 * Global Uniqueness Service
 * 
 * Enforces strict global uniqueness for email addresses and mobile numbers
 * across ALL user collections (User, Student, Trainer, Company) regardless of role.
 * 
 * POLICY: One email and one mobile number can be used ONLY ONCE across the entire platform.
 */

const mongoose = require('mongoose');

const getUser = () => mongoose.models.User || require("../../models/User");
const getStudent = () => mongoose.models.Student || require("../../models/Student");
const getTrainer = () => mongoose.models.Trainer || require("../../models/Trainer");
const getCompany = () => mongoose.models.Company || require("../../models/Company");

/**
 * Normalize email to lowercase and trim whitespace
 * @param {string} email - Email to normalize
 * @returns {string|null} - Normalized email or null
 */
const normalizeEmail = (email) => {
  if (!email) return null;
  return String(email).trim().toLowerCase();
};

/**
 * Normalize phone number by removing all non-digit characters except + at start
 * @param {string} phone - Phone number to normalize
 * @returns {string|null} - Normalized phone or null
 */
const normalizePhone = (phone) => {
  if (!phone) return null;
  const cleaned = String(phone).trim();
  if (!cleaned) return null;
  
  // Remove all spaces, dashes, parentheses
  const normalized = cleaned.replace(/[\s\-()]/g, '');
  
  // Must have at least 10 digits
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length < 10) return null;
  
  return normalized;
};

/**
 * Check if email exists in any collection
 * @param {string} email - Email to check
 * @param {string} excludeId - Document ID to exclude from search (for updates)
 * @param {string} excludeModel - Model name to exclude ('User', 'Student', 'Trainer', 'Company')
 * @returns {Promise<{exists: boolean, foundIn: string|null, message: string}>}
 */
const checkEmailExists = async (email, excludeId = null, excludeModel = null) => {
  const normalizedEmail = normalizeEmail(email);
  
  if (!normalizedEmail) {
    return {
      exists: false,
      foundIn: null,
      message: "Email is required",
      isValid: false,
    };
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return {
      exists: false,
      foundIn: null,
      message: "Please provide a valid email address",
      isValid: false,
    };
  }

  // Returns { email } query, or an impossible query when this model is excluded.
  // IMPORTANT: never return null — Model.findOne(null) matches the first document.
  const buildQuery = (model) => {
    if (excludeModel === model) {
      return { _id: null }; // impossible query — findOne returns null safely
    }

    const query = { email: normalizedEmail };
    if (excludeId && excludeModel === model) {
      query._id = { $ne: excludeId };
    }
    return query;
  };

  try {
    // Check User collection
    const userQuery = buildQuery('User');
    const userExists = await getUser().findOne(userQuery).select('_id role').lean();
    if (userExists) {
      return {
        exists: true,
        foundIn: 'User',
        role: userExists.role,
        message: "This email address is already registered in the system. Please use a different email or login if you already have an account.",
      };
    }

    // Check Student collection
    const studentExists = await getStudent().findOne(buildQuery('Student')).select('_id').lean();
    if (studentExists) {
      return {
        exists: true,
        foundIn: 'Student',
        role: 'Student',
        message: "This email address is already registered in the system. Please use a different email or login if you already have an account.",
      };
    }

    // Check Trainer collection
    const trainerExists = await getTrainer().findOne(buildQuery('Trainer')).select('_id').lean();
    if (trainerExists) {
      return {
        exists: true,
        foundIn: 'Trainer',
        role: 'Trainer',
        message: "This email address is already registered in the system. Please use a different email or login if you already have an account.",
      };
    }

    // Check Company collection
    const companyExists = await getCompany().findOne(buildQuery('Company')).select('_id').lean();
    if (companyExists) {
      return {
        exists: true,
        foundIn: 'Company',
        role: 'Company',
        message: "This email address is already registered in the system. Please use a different email or login if you already have an account.",
      };
    }

    return {
      exists: false,
      foundIn: null,
      message: "Email is available",
      isValid: true,
    };
  } catch (error) {
    console.error("[UNIQUENESS] Error checking email existence:", error);
    throw error;
  }
};

/**
 * Check if phone number exists in any collection
 * @param {string} phone - Phone number to check
 * @param {string} excludeId - Document ID to exclude from search (for updates)
 * @param {string} excludeModel - Model name to exclude ('User', 'Student', 'Trainer', 'Company')
 * @returns {Promise<{exists: boolean, foundIn: string|null, message: string}>}
 */
const checkPhoneExists = async (phone, excludeId = null, excludeModel = null) => {
  const normalizedPhone = normalizePhone(phone);
  
  if (!normalizedPhone) {
    return {
      exists: false,
      foundIn: null,
      message: "Phone number is required",
      isValid: false,
    };
  }

  // Phone validation - at least 10 digits
  const digitsOnly = normalizedPhone.replace(/\D/g, '');
  if (digitsOnly.length < 10) {
    return {
      exists: false,
      foundIn: null,
      message: "Please provide a valid phone number with at least 10 digits",
      isValid: false,
    };
  }

  const buildQuery = (model) => {
    const query = {
      $or: [
        { phoneNumber: normalizedPhone },
        { phone: normalizedPhone },
        { mobile: normalizedPhone },
        { 'profile.phone': normalizedPhone },
      ]
    };
    if (excludeId && excludeModel === model) {
      query._id = { $ne: excludeId };
    }
    return query;
  };

  try {
    // Check User collection (phoneNumber, profile.phone)
    const userExists = await getUser().findOne(buildQuery('User')).select('_id role').lean();
    if (userExists) {
      return {
        exists: true,
        foundIn: 'User',
        role: userExists.role,
        message: "This phone number is already registered in the system. Please use a different phone number or login if you already have an account.",
      };
    }

    // Check Student collection (phoneNumber)
    const studentExists = await getStudent().findOne(buildQuery('Student')).select('_id').lean();
    if (studentExists) {
      return {
        exists: true,
        foundIn: 'Student',
        role: 'Student',
        message: "This phone number is already registered in the system. Please use a different phone number or login if you already have an account.",
      };
    }

    // Check Trainer collection (mobile, phone)
    const trainerExists = await getTrainer().findOne(buildQuery('Trainer')).select('_id').lean();
    if (trainerExists) {
      return {
        exists: true,
        foundIn: 'Trainer',
        role: 'Trainer',
        message: "This phone number is already registered in the system. Please use a different phone number or login if you already have an account.",
      };
    }

    // Check Company collection (phone)
    const companyExists = await getCompany().findOne(buildQuery('Company')).select('_id').lean();
    if (companyExists) {
      return {
        exists: true,
        foundIn: 'Company',
        role: 'Company',
        message: "This phone number is already registered in the system. Please use a different phone number or login if you already have an account.",
      };
    }

    return {
      exists: false,
      foundIn: null,
      message: "Phone number is available",
      isValid: true,
    };
  } catch (error) {
    console.error("[UNIQUENESS] Error checking phone existence:", error);
    throw error;
  }
};

/**
 * Assert that email is unique across all collections
 * Throws error if email already exists
 * @param {string} email - Email to validate
 * @param {string} excludeId - Optional ID to exclude from check
 * @param {string} excludeModel - Optional model name to exclude
 * @throws {Error} If email already exists or is invalid
 */
const assertUniqueEmail = async (email, excludeId = null, excludeModel = null) => {
  const result = await checkEmailExists(email, excludeId, excludeModel);
  
  if (!result.isValid && !result.exists) {
    const err = new Error(result.message);
    err.statusCode = 400;
    err.field = 'email';
    throw err;
  }
  
  if (result.exists) {
    const err = new Error(result.message);
    err.statusCode = 409; // Conflict
    err.field = 'email';
    err.foundIn = result.foundIn;
    err.existingRole = result.role;
    throw err;
  }
  
  return normalizeEmail(email);
};

/**
 * Assert that phone is unique across all collections
 * Throws error if phone already exists
 * @param {string} phone - Phone to validate
 * @param {string} excludeId - Optional ID to exclude from check
 * @param {string} excludeModel - Optional model name to exclude
 * @throws {Error} If phone already exists or is invalid
 */
const assertUniquePhone = async (phone, excludeId = null, excludeModel = null) => {
  // Allow empty/null phone numbers (optional field)
  if (!phone) {
    return null;
  }
  
  const result = await checkPhoneExists(phone, excludeId, excludeModel);
  
  if (!result.isValid && !result.exists) {
    const err = new Error(result.message);
    err.statusCode = 400;
    err.field = 'phone';
    throw err;
  }
  
  if (result.exists) {
    const err = new Error(result.message);
    err.statusCode = 409; // Conflict
    err.field = 'phone';
    err.foundIn = result.foundIn;
    err.existingRole = result.role;
    throw err;
  }
  
  return normalizePhone(phone);
};

/**
 * Validate both email and phone uniqueness
 * @param {Object} options
 * @param {string} options.email - Email to validate
 * @param {string} options.phone - Phone to validate
 * @param {string} options.excludeId - Optional ID to exclude
 * @param {string} options.excludeModel - Optional model to exclude
 * @returns {Promise<{email: string, phone: string|null}>} Normalized values
 * @throws {Error} If validation fails
 */
const validateUniqueness = async ({ email, phone, excludeId, excludeModel }) => {
  const normalizedEmail = await assertUniqueEmail(email, excludeId, excludeModel);
  const normalizedPhone = await assertUniquePhone(phone, excludeId, excludeModel);
  
  return {
    email: normalizedEmail,
    phone: normalizedPhone,
  };
};

/**
 * Check uniqueness without throwing errors
 * Useful for API endpoints that need to return validation status
 * @param {Object} options
 * @param {string} options.email - Email to check
 * @param {string} options.phone - Phone to check
 * @param {string} options.excludeId - Optional ID to exclude
 * @param {string} options.excludeModel - Optional model to exclude
 * @returns {Promise<{emailAvailable: boolean, phoneAvailable: boolean, errors: Array}>}
 */
const checkUniqueness = async ({ email, phone, excludeId, excludeModel }) => {
  const errors = [];
  let emailAvailable = false;
  let phoneAvailable = false;

  if (email) {
    const emailResult = await checkEmailExists(email, excludeId, excludeModel);
    emailAvailable = !emailResult.exists && emailResult.isValid !== false;
    if (emailResult.exists || emailResult.isValid === false) {
      errors.push({
        field: 'email',
        message: emailResult.message,
        foundIn: emailResult.foundIn,
      });
    }
  }

  if (phone) {
    const phoneResult = await checkPhoneExists(phone, excludeId, excludeModel);
    phoneAvailable = !phoneResult.exists && phoneResult.isValid !== false;
    if (phoneResult.exists || phoneResult.isValid === false) {
      errors.push({
        field: 'phone',
        message: phoneResult.message,
        foundIn: phoneResult.foundIn,
      });
    }
  }

  return {
    emailAvailable,
    phoneAvailable,
    errors,
    isValid: errors.length === 0,
  };
};

module.exports = {
  normalizeEmail,
  normalizePhone,
  checkEmailExists,
  checkPhoneExists,
  assertUniqueEmail,
  assertUniquePhone,
  validateUniqueness,
  checkUniqueness,
};
