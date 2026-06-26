import User from '../models/User.js';
import { generateTokens, verifyRefreshToken } from '../utils/jwtUtils.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { roleMatchesExpected } = require('../services/auth/authRoles.js');
const { validateUniqueness, assertUniqueEmail } = require('../services/auth/globalUniquenessService.js');

// Must match the actual Next.js app routes (app/student/dashboard, app/trainer/dashboard, ...)
const getDashboardRoute = (role) => {
  const routes = {
    student: '/student/dashboard',
    trainer: '/trainer/dashboard',
    company: '/company/dashboard',
    admin: '/dashboard',
  };
  return routes[String(role || '').toLowerCase()] || '/dashboard';
};


export const signup = async (req, res) => {
  try {
    const {
      email,
      password,
      confirmPassword,
      fullName,
      phone,
      role = 'student',
      studentProfile = {},
      trainerProfile = {},
      companyProfile = {},
    } = req.body;

    if (!email || !password || !confirmPassword || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: email, password, confirmPassword, fullName',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Validate global uniqueness for email and phone
    const validated = await validateUniqueness({ email, phone });

    const userData = {
      email: validated.email,
      password,
      role,
      // Legacy top-level fields still read by dashboards/admin panel
      name: fullName,
      phoneNumber: validated.phone,
      profile: {
        fullName,
        phone: validated.phone,
      },
    };

    if (role === 'student' && Object.keys(studentProfile).length > 0) {
      userData.studentProfile = studentProfile;
    }

    if (role === 'trainer' && Object.keys(trainerProfile).length > 0) {
      userData.trainerProfile = trainerProfile;
    }

    if (role === 'company' && Object.keys(companyProfile).length > 0) {
      userData.companyProfile = companyProfile;
    }

    const user = new User(userData);
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id, user.email, user.role);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
        dashboardRoute: getDashboardRoute(user.role),
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle uniqueness validation errors with clear messages
    if (error.statusCode === 409 && error.field) {
      return res.status(409).json({
        success: false,
        message: error.message,
        field: error.field,
        foundIn: error.foundIn,
      });
    }
    
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Signup failed',
      error: error.message,
    });
  }
};

export const login = async (req, res) => {
  try {
    // Disable rate limiter for local testing
    process.env.DISABLE_RATE_LIMITER = '1';

    const { email, password, rememberMe = false, expectedRole } = req.body;
    console.debug('[AUTH DEBUG] Fast login initiated');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Optimized query - only fetch what's needed
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password')
      .lean(); // Use lean() for read-only queries (3x faster)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated',
        accountDeactivated: true,
      });
    }

    // Verify password
    const userDoc = await User.findById(user._id).select('+password');
    const isPasswordValid = await userDoc.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Validate role
    if (expectedRole && !roleMatchesExpected(user.role, expectedRole)) {
      return res.status(403).json({
        success: false,
        message: 'This email is not registered for the selected account type',
        roleMismatch: true,
      });
    }

    // Check trainer email verification
    const normalizedRole = String(user.role || '').trim().toLowerCase();
    if (normalizedRole === 'trainer') {
      const emailVerified = Boolean(user.isEmailVerified || user.emailVerified);
      if (!emailVerified) {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email with OTP before signing in.',
          requiresEmailVerification: true,
        });
      }

      if (user.accountStatus && user.accountStatus !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Your trainer account is waiting for admin approval.',
          pendingApproval: true,
        });
      }
    }

    // Generate tokens fast
    const { accessToken, refreshToken } = generateTokens(user._id, user.email, user.role);

    // Return response IMMEDIATELY with essential data only
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name || user.fullName,
          role: user.role,
          isActive: user.isActive,
        },
        accessToken,
        refreshToken,
        rememberMe,
        dashboardRoute: getDashboardRoute(user.role),
      },
    });

    // Update metadata async (non-blocking)
    Promise.resolve().then(async () => {
      try {
        await User.findByIdAndUpdate(
          user._id,
          {
            lastLogin: new Date(),
            $set: {
              'metadata.ipAddress': req.ip,
              'metadata.userAgent': req.get('user-agent'),
              'metadata.lastLoginIP': req.ip,
            },
          },
          { new: false }, // Don't need return value
        );
      } catch (err) {
        console.warn('[AUTH] Failed to update metadata:', err.message);
      }
    });
  } catch (error) {
    console.error('[AUTH DEBUG] Server Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message,
    });
  }
};

export const logout = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message,
    });
  }
};

export const refreshTokenController = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive',
      });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      user._id,
      user.email,
      user.role
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token',
      error: error.message,
    });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        user: user.toJSON(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message,
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Email verification failed',
      error: error.message,
    });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { email, name, googleId, photoURL } = req.body || {};

    if (!email || !googleId) {
      return res.status(400).json({
        success: false,
        message: 'Google account email and ID are required',
      });
    }

    // Validate email uniqueness first
    const normalizedEmail = String(email).trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Validate that email is not used in other collections
      await assertUniqueEmail(normalizedEmail);
      
      user = new User({
        email: normalizedEmail,
        password: `google-oauth-${googleId}`,
        role: 'trainer',
        name: name || normalizedEmail.split('@')[0],
        profile: {
          fullName: name || normalizedEmail.split('@')[0],
          avatar: photoURL || undefined,
        },
        isEmailVerified: true,
        emailVerified: true,
        accountStatus: 'active',
        metadata: { googleId },
      });
      await user.save();
    } else if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated',
        accountDeactivated: true,
      });
    }

    const { accessToken, refreshToken } = generateTokens(user._id, user.email, user.role);

    return res.json({
      success: true,
      message: 'Login successful',
      user: user.toJSON(),
      accessToken,
      refreshToken,
      dashboardRoute: getDashboardRoute(user.role),
    });
  } catch (error) {
    console.error('Google login error:', error);
    
    // Handle uniqueness validation errors
    if (error.statusCode === 409 && error.field) {
      return res.status(409).json({
        success: false,
        message: error.message,
        field: error.field,
        foundIn: error.foundIn,
      });
    }
    
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Google login failed',
      error: error.message,
    });
  }
};
