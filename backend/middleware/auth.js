const jwt = require("jsonwebtoken");
const { normalizeRoleValue } = require("../services/auth/authRoles.js");

// Without a fallback, jwt.verify(token, undefined) always throws when
// JWT_SECRET is unset, making every protected API return 401.
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key_change_in_production";

const normalizeRequestRole = (value) => {
  const normalized = normalizeRoleValue(String(value || "").trim());
  return String(normalized || "").trim().toLowerCase();
};

const buildUserFromDecodedToken = (decoded = {}) => {
  const role = decoded.role || decoded.userRole || decoded.portalRole || decoded.portal_role || decoded.roleLabel || decoded.portalRoleLabel || null;
  return {
    ...decoded,
    id: decoded.id || decoded.userId,
    userId: decoded.userId || decoded.id,
    role,
  };
};

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ message: "No token" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (verifyErr) {
      console.error('[AUTH] JWT verify error:', verifyErr && verifyErr.message ? verifyErr.message : verifyErr);
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = buildUserFromDecodedToken(decoded);
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

const authenticateOptional = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = buildUserFromDecodedToken(decoded);
    }
    next();
  } catch (err) {
    // If token is invalid, we still proceed but without req.user
    next();
  }
};

const authorize = (roles = []) => {
  if (typeof roles === "string") {
    roles = [roles];
  }

  return (req, res, next) => {
    const userRole = normalizeRequestRole(req.user?.role);
    const allowedRoles = roles.map(normalizeRequestRole);

    if (!req.user || (allowedRoles.length && !allowedRoles.includes(userRole))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};

module.exports = { 
  auth, 
  authenticate: auth,
  authenticateOptional,
  authorize,
  checkRole: authorize
};
