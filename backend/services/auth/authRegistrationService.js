const crypto = require("crypto");
const User = require("../../models/User");
const Trainer = require("../../models/Trainer");
const Company = require("../../models/Company");
const Student = require("../../models/Student");
const Notification = require("../../models/Notification");
const {
  sendTrainerRegistrationNotificationEmail,
} = require("../../utils/emailService");
const {
  OTP_PURPOSE,
  normalizeEmail,
  hashOtp,
  sendEmailOtp,
  verifyEmailOtp,
} = require("./authEmailOtpService");
const {
  createRegistrationStepToken,
  issueAuthSession,
  toPublicUser,
} = require("./authTokenService");
const { normalizeRoleValue } = require("./authRoles");
const {
  assertUniqueEmail,
  assertUniquePhone,
  validateUniqueness,
  checkEmailExists,
} = require("./globalUniquenessService");

const PASSWORD_MIN_LENGTH = 6;

const createSystemGeneratedPassword = () =>
  `MBK#${crypto.randomBytes(24).toString("hex")}`;

const assertPassword = (password) => {
  const value = String(password || "");
  if (value.length < PASSWORD_MIN_LENGTH) {
    const err = new Error(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
    err.statusCode = 400;
    throw err;
  }
  return value;
};

const assertNewEmail = async (email) => {
  // Use centralized global uniqueness validation
  return await assertUniqueEmail(email);
};

const registerStudent = async ({
  name,
  email,
  password,
  phone = "",
  college = "",
  course = "",
  res,
  ipAddress,
}) => {
  // Validate global uniqueness for both email and phone
  const validated = await validateUniqueness({ email, phone });
  assertPassword(password);

  // Check if student already exists
  const existingStudent = await Student.findOne({ email: validated.email });
  if (existingStudent) {
    const err = new Error("A student account with this email already exists");
    err.statusCode = 409;
    throw err;
  }

  const user = await User.create({
    name: String(name || "").trim(),
    email: validated.email,
    password,
    role: "Student",
    phoneNumber: validated.phone,
    phone: validated.phone,
    collegeName: String(college || "").trim(),
    courseName: String(course || "").trim(),
    isActive: true,
    accountStatus: "active",
  });

  const session = await issueAuthSession({ user, res, ipAddress });

  return {
    success: true,
    message: "Student account created successfully",
    ...session,
  };
};

const registerCompany = async ({
  name,
  email,
  password,
  companyName = "",
  address = "",
  phone = "",
  website = "",
  res,
  ipAddress,
}) => {
  // Validate global uniqueness for both email and phone
  const validated = await validateUniqueness({ email, phone });
  assertPassword(password);

  const displayName = String(companyName || name || "").trim();

  // Check if company already exists
  const existingCompany = await Company.findOne({ email: validated.email });
  if (existingCompany) {
    const err = new Error("A company account with this email already exists");
    err.statusCode = 409;
    throw err;
  }

  const user = await User.create({
    name: displayName,
    email: validated.email,
    password,
    role: "CompanyAdmin",
    phoneNumber: validated.phone,
    phone: validated.phone,
    isActive: true,
    accountStatus: "active",
    emailVerified: true,
    isEmailVerified: true,
  });

  await Company.create({
    userId: user._id,
    name: displayName,
    address: String(address || "").trim(),
    phone: validated.phone,
    email: validated.email,
    website: String(website || "").trim(),
    password, // Company model will hash it
    isVerified: false,
  });

  const session = await issueAuthSession({ user, res, ipAddress });

  return {
    success: true,
    message: "Company account created successfully",
    ...session,
  };
};

const initTrainerRegistration = async ({
  email,
  password,
  ipAddress,
  buildTrainerRegistrationState,
}) => {
  // Validate email uniqueness across all collections
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const err = new Error("Email is required");
    err.statusCode = 400;
    throw err;
  }

  const emailCheck = await checkEmailExists(normalizedEmail, null, "Trainer");
  if (emailCheck.isValid === false) {
    const err = new Error(emailCheck.message);
    err.statusCode = 400;
    throw err;
  }
  if (emailCheck.exists) {
    const existingUser = await User.findOne({ email: normalizedEmail });
    const normalizedRole = String(existingUser?.role || "").toLowerCase();
    const isTrainerUser =
      existingUser &&
      (normalizedRole === "trainer" || normalizedRole.includes("trainer"));

    if (!isTrainerUser) {
      const err = new Error(emailCheck.message);
      err.statusCode = 409;
      throw err;
    }
  }

  let user = await User.findOne({ email: normalizedEmail });
  let trainer = await Trainer.findOne({ email: normalizedEmail });

  const registrationState = trainer
    ? await buildTrainerRegistrationState(trainer)
    : null;
  const registrationStep =
    registrationState?.currentStep || trainer?.registrationStep || 1;

  const normalizedRole = String(user?.role || "").toLowerCase();
  if (user && normalizedRole === "trainer" && user.accountStatus === "active" && (user.emailVerified || user.isEmailVerified)) {
    const err = new Error("This email is already registered and active. Please log in.");
    err.statusCode = 400;
    throw err;
  }

  if (
    user &&
    normalizedRole &&
    normalizedRole !== "trainer" &&
    !normalizedRole.includes("trainer")
  ) {
    const err = new Error(
      "This email is already registered with a different account type",
    );
    err.statusCode = 400;
    throw err;
  }

  const passwordValue = password ? assertPassword(password) : null;

  if (user) {
    if (passwordValue) {
      user.password = passwordValue;
    } else if (!user.password) {
      user.password = createSystemGeneratedPassword();
    }
    user.emailVerified = false;
    user.isEmailVerified = false;
    user.role = "Trainer";
    if (user.accountStatus !== "active") {
      user.accountStatus = "pending";
    }
    await user.save();
  } else {
    user = await User.create({
      email: normalizedEmail,
      password: passwordValue || createSystemGeneratedPassword(),
      role: "Trainer",
      accountStatus: "pending",
      emailVerified: false,
      isEmailVerified: false,
      name: "Pending Trainer",
    });
  }

  trainer = await Trainer.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $setOnInsert: {
        email: normalizedEmail,
        status: "PENDING",
        registrationStep: 1,
      },
      $set: {
        emailVerified: false,
        userId: user._id,
        registrationStatus:
          registrationState?.registrationStatus === "under_review"
            ? "under_review"
            : "pending",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Auto-create Google Drive folder structure for the trainer
  try {
    const { ensureTrainerFolderStructure } = await import("../trainerGoogleDriveAutoSaveService.mjs");
    await ensureTrainerFolderStructure(
      trainer._id,
      `${trainer.firstName || "Trainer"}_${trainer.lastName || trainer.email.split("@")[0]}`
    );
  } catch (driveError) {
    console.warn("[AUTO-SAVE] Failed to create Google Drive folders for trainer:", driveError.message);
    // Don't fail registration if Drive fails
  }

  const otpResult = await sendEmailOtp({
    email: normalizedEmail,
    purpose: OTP_PURPOSE.TRAINER_REGISTRATION,
    recipientName: user.name || "Trainer Candidate",
    ipAddress,
  });

  user.emailOtp = null;
  user.emailOtpExpires = otpResult.expiresAt;
  await user.save();

  return {
    success: true,
    message:
      trainer && registrationStep > 1
        ? "OTP sent to continue your registration."
        : "OTP sent to your email address.",
    email: normalizedEmail,
    registrationStep: trainer?.registrationStep || 1,
    canResume: Boolean(trainer && registrationStep > 1),
    deliveryMode: otpResult.deliveryMode,
    ...(otpResult.debugOtp ? { debugOtp: otpResult.debugOtp } : {}),
  };
};

const verifyTrainerRegistrationOtp = async ({
  email,
  otp,
  buildTrainerRegistrationState,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  try {
    await verifyEmailOtp({
      email: normalizedEmail,
      otp,
      purpose: OTP_PURPOSE.TRAINER_REGISTRATION,
    });
  } catch (hashedError) {
    // Backward compatibility with legacy plain OTP on User document
    const legacyMatch = await User.findOne({
      email: normalizedEmail,
      emailOtp: String(otp || "").trim(),
      emailOtpExpires: { $gt: Date.now() },
    });
    if (!legacyMatch) {
      throw hashedError;
    }
  }

  user.emailVerified = true;
  user.isEmailVerified = true;
  user.emailOtp = null;
  user.emailOtpExpires = null;
  await user.save();

  let trainer = await Trainer.findOne({ email: normalizedEmail });
  let currentStep = 2;

  if (trainer) {
    const registrationState = await buildTrainerRegistrationState(trainer);
    currentStep = Math.max(registrationState.currentStep || 1, 2);
    trainer.emailVerified = true;
    trainer.registrationStep = currentStep;
    trainer.registrationStatus = registrationState.registrationStatus;
    trainer.documentStatus = registrationState.workflow?.documentStatus;
    await trainer.save();
  } else {
    trainer = await Trainer.create({
      email: normalizedEmail,
      userId: user._id,
      emailVerified: true,
      status: "PENDING",
      registrationStep: 2,
      registrationStatus: "pending",
    });
    currentStep = trainer.registrationStep;
  }

  const tempToken = createRegistrationStepToken(user, currentStep);

  return {
    success: true,
    message: "Email verified successfully. You may continue registration.",
    tempToken,
    currentStep,
    user: toPublicUser(user),
  };
};

const registerWithRole = async (payload, res, ipAddress) => {
  const role = normalizeRoleValue(payload.role || "Trainer");

  if (role === "Student") {
    return registerStudent({ ...payload, res, ipAddress });
  }
  if (role === "CompanyAdmin") {
    return registerCompany({ ...payload, res, ipAddress });
  }

  const err = new Error(
    "Trainer registration requires email OTP verification. Use /auth/register/trainer or /auth/trainer-reg-init.",
  );
  err.statusCode = 400;
  throw err;
};

const notifyAdminsOfTrainerSignup = async ({ name, email, phone, city }) => {
  try {
    const superAdmins = await User.find({ role: "SuperAdmin" });
    if (!superAdmins.length) return;

    const notifications = superAdmins.map((admin) => ({
      userId: admin._id,
      title: "New Trainer Registration",
      message: `New trainer ${name} has signed up and is awaiting approval.`,
      type: "info",
      link: "/dashboard/trainers",
    }));
    await Notification.insertMany(notifications);

    const superAdminEmails = superAdmins.map((admin) => admin.email).filter(Boolean);
    await sendTrainerRegistrationNotificationEmail(superAdminEmails, {
      name,
      email,
      phone: phone || "N/A",
      city: city || "N/A",
    });
  } catch (error) {
    console.error("[AUTH] Failed to notify admins of trainer signup:", error);
  }
};

module.exports = {
  PASSWORD_MIN_LENGTH,
  registerStudent,
  registerCompany,
  initTrainerRegistration,
  verifyTrainerRegistrationOtp,
  registerWithRole,
  notifyAdminsOfTrainerSignup,
  normalizeEmail,
  hashOtp,
};
