const crypto = require("crypto");
const Otp = require("../../models/Otp");
const { sendRegistrationOTP } = require("../../utils/emailService");

const OTP_PURPOSE = {
  TRAINER_REGISTRATION: "trainer_registration",
  COMPANY_ADMIN_VERIFY: "company_admin_verify",
};

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 3;

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const hashOtp = (rawOtp) =>
  crypto.createHash("sha256").update(String(rawOtp)).digest("hex");

const generateRawOtp = () =>
  Math.floor(10 ** (OTP_LENGTH - 1) + Math.random() * 9 * 10 ** (OTP_LENGTH - 1)).toString();

const assertRateLimit = async (record) => {
  const now = Date.now();
  const hourWindowStart = record?.hourWindowStart
    ? new Date(record.hourWindowStart).getTime()
    : now;
  const withinHour = now - hourWindowStart < 60 * 60 * 1000;
  const requestCount = withinHour ? Number(record?.requestCount || 0) : 0;

  if (withinHour && requestCount >= MAX_SENDS_PER_HOUR) {
    const err = new Error(
      "Too many OTP requests. Please wait before requesting another code.",
    );
    err.statusCode = 429;
    throw err;
  }

  return {
    requestCount: withinHour ? requestCount + 1 : 1,
    hourWindowStart:
      withinHour && record?.hourWindowStart
        ? record.hourWindowStart
        : new Date(now),
  };
};

/**
 * Creates a hashed OTP for the given email and sends it only to that address.
 */
const sendEmailOtp = async ({
  email,
  purpose,
  recipientName = "User",
  ipAddress = "unknown",
}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const err = new Error("Email is required");
    err.statusCode = 400;
    throw err;
  }

  const existing = await Otp.findOne({ email: normalizedEmail, purpose });
  const rate = await assertRateLimit(existing);

  const rawOtp = generateRawOtp();
  const hashedOtp = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await Otp.findOneAndUpdate(
    { email: normalizedEmail, purpose },
    {
      hashedOtp,
      expiresAt,
      verified: false,
      used: false,
      attempts: 0,
      ipAddress,
      requestCount: rate.requestCount,
      hourWindowStart: rate.hourWindowStart,
    },
    { upsert: true, new: true },
  );

  let deliveryMode = "email";
  let debugOtp = null;
  const allowDebugMode = String(process.env.ALLOW_OTP_DEBUG || "").trim() === "1";

  if (allowDebugMode) {
    deliveryMode = "debug";
    debugOtp = rawOtp;
    console.log(
      '[AUTH-OTP] ALLOW_OTP_DEBUG=1 enabled — returning debug OTP without SMTP send',
    );
  } else {
    try {
      const sendResult = await sendRegistrationOTP(normalizedEmail, recipientName, rawOtp);
      if (!sendResult.success) {
        if (process.env.NODE_ENV === "production") {
          const err = new Error(
            sendResult.error || "Failed to deliver OTP to your email address",
          );
          err.statusCode = 502;
          throw err;
        }
        deliveryMode = "debug";
        debugOtp = rawOtp;
        console.warn(
          "[AUTH-OTP] Email delivery failed in non-production:",
          sendResult.error || "unknown error",
        );
      }
    } catch (emailError) {
      if (process.env.NODE_ENV === "production") {
        const err = new Error(
          emailError?.message || "Failed to deliver OTP to your email address",
        );
        err.statusCode = 502;
        throw err;
      }
      deliveryMode = "debug";
      debugOtp = rawOtp;
      console.warn(
        "[AUTH-OTP] Email delivery failed in non-production:",
        emailError?.message || emailError,
      );
    }
  }

  const result = {
    email: normalizedEmail,
    expiresAt,
    deliveryMode,
  };

  if (debugOtp) {
    result.debugOtp = debugOtp;
  }

  return result;
};

/**
 * Verifies OTP for the registering user's email only.
 */
const verifyEmailOtp = async ({ email, otp, purpose }) => {
  const normalizedEmail = normalizeEmail(email);
  const rawOtp = String(otp || "").trim();

  if (!normalizedEmail || !rawOtp) {
    const err = new Error("Email and OTP are required");
    err.statusCode = 400;
    throw err;
  }

  const record = await Otp.findOne({ email: normalizedEmail, purpose });
  if (!record) {
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  if (record.used) {
    const err = new Error("OTP has already been used. Request a new one.");
    err.statusCode = 400;
    throw err;
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await Otp.deleteOne({ _id: record._id });
    const err = new Error("Too many failed attempts. Request a new OTP.");
    err.statusCode = 400;
    throw err;
  }

  if (!record.expiresAt || record.expiresAt.getTime() <= Date.now()) {
    await Otp.deleteOne({ _id: record._id });
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  const hashedInput = hashOtp(rawOtp);
  if (hashedInput !== record.hashedOtp) {
    record.attempts += 1;
    await record.save();
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  record.used = true;
  record.verified = true;
  await record.save();

  return { email: normalizedEmail, verified: true };
};

module.exports = {
  OTP_PURPOSE,
  normalizeEmail,
  hashOtp,
  sendEmailOtp,
  verifyEmailOtp,
};
