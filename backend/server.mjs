import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import session from "express-session";
import compression from "compression";
import mongoose from "mongoose";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import rateLimiter from "./middleware/rateLimiter.js";
import requestLogger from "./middleware/requestLogger.js";
import healthCheck from "./middleware/healthCheck.js";
import routes from "./routes/index.mjs";
import globalErrorHandler from "./middleware/globalErrorHandler.js";
import { createRequire } from "module";
import { connectToDatabase } from './config/database.mjs';
import socketManager from './services/socketManager.mjs';

// CommonJS require bridge (for CJS-only packages)
const require = createRequire(import.meta.url);
const { startAnalyticsWorker } = require("./workers/analyticsWorker.js");
const { redis, isAvailable: isRedisAvailable } = require('./config/redis.js');
const errorTracker = require('./middleware/errorTracker.js');

// Redis session store — gracefully falls back to MemoryStore if unavailable
let RedisStore = null;
try {
  const connectRedis = require('connect-redis');
  // connect-redis v7+ exports a class directly; older versions export a factory
  RedisStore = connectRedis.default ?? connectRedis.RedisStore ?? (typeof connectRedis === 'function' ? connectRedis(session) : null);
} catch {
  // connect-redis not installed or misconfigured; sessions will use MemoryStore
}


// Load environment variables in development-friendly order:
// 1) root repo .env provides local development values
// 2) M-server/.env fills in missing service-specific values
const rootEnvPath = fileURLToPath(new URL("../.env", import.meta.url));
const localEnvPath = fileURLToPath(new URL("./.env", import.meta.url));
console.log("🔧 Loading env files:", { rootEnvPath, localEnvPath });
dotenv.config({ path: rootEnvPath });
dotenv.config({ path: localEnvPath, override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production";

const normalizeOrigin = (value = "") => value.trim().replace(/\/+$/, "");
const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://mbktechnologies.info",
  "https://www.mbktechnologies.info",
  "https://*.mbktechnologies.info",
];
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = new Set(
  [...defaultAllowedOrigins, ...configuredOrigins].map(normalizeOrigin),
);

const isLocalDevOrigin = (origin = "") =>
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(
    normalizeOrigin(origin),
  );

const getDefaultPort = (protocol = "") => {
  if (protocol === "https:") return "443";
  if (protocol === "http:") return "80";
  return "";
};

const wildcardOriginPattern = /^([a-z]+):\/\/\*\.(.+?)(?::(\d+))?$/i;

const matchesAllowedOriginPattern = (origin, allowedOriginPattern) => {
  const wildcardMatch = wildcardOriginPattern.exec(allowedOriginPattern);
  if (!wildcardMatch) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const [, protocol, hostSuffix, explicitPort = ""] = wildcardMatch;
    const normalizedSuffix = hostSuffix.toLowerCase().replace(/^\.+/, "");
    const originProtocol = parsedOrigin.protocol.toLowerCase();
    const originHost = parsedOrigin.hostname.toLowerCase();
    const originPort = parsedOrigin.port || getDefaultPort(originProtocol);
    const allowedProtocol = `${protocol.toLowerCase()}:`;
    const allowedPort = explicitPort || getDefaultPort(allowedProtocol);

    return (
      originProtocol === allowedProtocol &&
      originPort === allowedPort &&
      originHost.endsWith(`.${normalizedSuffix}`)
    );
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Allows same-server calls, curl, and health checks.
  const normalizedOrigin = normalizeOrigin(origin);

  // In local development, allow localhost/127.0.0.1 across ports
  // so frontend port auto-switches (3000/3001/etc.) do not break API calls.
  if (!isProduction && isLocalDevOrigin(normalizedOrigin)) {
    return true;
  }

  return (
    allowedOrigins.has(normalizedOrigin) ||
    Array.from(allowedOrigins).some((allowedOrigin) =>
      matchesAllowedOriginPattern(normalizedOrigin, allowedOrigin),
    )
  );
};

const corsOriginHandler = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Not allowed by CORS: ${origin}`));
};

const app = express();
let server = null;
let io = null;

const sanitizeRequestInput = (req, res, next) => {
  for (const key of ['body', 'params', 'headers', 'query']) {
    if (req[key]) {
      mongoSanitize.sanitize(req[key]);
    }
  }
  next();
};

// Initialize Socket.io
// Socket.io will be initialized after the HTTP server is created in startServer().
// The `io` variable declared above will be assigned inside startServer():
//   io = new Server(server, { ... })

app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
}));
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
// Allow the separate frontend origin (e.g. :3000) to embed images/files served
// by this API in <img> tags. Helmet's default Cross-Origin-Resource-Policy is
// "same-origin", which makes the browser block cross-origin asset loads with
// ERR_BLOCKED_BY_RESPONSE.NotSameOrigin.
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(rateLimiter);
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));   // Uploads use Multer streams; 10MB is enough for JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeRequestInput);
app.use(cookieParser());
app.set("trust proxy", 1);

// Build session store — prefer Redis to avoid in-memory session bloat at 70K users
const buildSessionStore = () => {
  if (RedisStore && isRedisAvailable()) {
    try {
      return new RedisStore({ client: redis, prefix: 'sess:', ttl: 86400 });
    } catch (e) {
      console.warn('[Session] Redis store init failed, using memory store:', e.message);
    }
  }
  return undefined; // express-session default = MemoryStore
};

app.use(session({
  store: buildSessionStore(),
  secret: process.env.SESSION_SECRET || "mbk-secret",
  resave: false,
  saveUninitialized: false,  // ← prevents empty sessions for every unauthenticated request
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));


// Attach io to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Global Caching Middleware
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
  next();
});

// Static Files
const uploadsDir = path.join(__dirname, 'uploads');
const uploadsStaticOptions = {
  maxAge: '1y',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
};

// Secure file serving for trainer documents.
// Accepts optional `?token=<JWT>` query parameter. If REQUIRE_UPLOAD_AUTH=true,
// requests without a valid token are rejected. Otherwise files may be served publicly.
import fs from 'fs';
import jwt from 'jsonwebtoken';
const REQUIRE_UPLOAD_AUTH = String(process.env.REQUIRE_UPLOAD_AUTH || '').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key_change_in_production";

const extractDriveFileId = (value) => {
  if (!value || typeof value !== 'string') return null;
  const patterns = [/\/file\/d\/([^/?#]+)/i, /\/d\/([^/?#]+)/i, /[?&]id=([^&#]+)/i];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
};

app.get('/api/uploads/trainer-documents/:filename', async (req, res, next) => {
  const { filename } = req.params || {};

  // Let the SPA (separate origin) embed this asset in <img> tags.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // If token provided via query, validate it and attach user
  if (req.query && req.query.token) {
    try {
      const decoded = jwt.verify(String(req.query.token), JWT_SECRET);
      req.user = { ...decoded, id: decoded.id || decoded.userId, userId: decoded.userId || decoded.id };
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  } else if (REQUIRE_UPLOAD_AUTH) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const filePath = path.join(uploadsDir, 'trainer-documents', filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Failed to send trainer document file:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Failed to send file' });
        }
      }
    });
  }

  // Local file missing (most documents now live on Google Drive). Resolve the
  // canonical Drive copy by filename and redirect there so the <img> still loads
  // instead of producing a noisy, repeating 404.
  try {
    const TrainerDocument = require('./models/TrainerDocument.js');
    const doc = await TrainerDocument.findOne({ fileName: filename })
      .select('driveFileId driveViewLink driveDownloadLink')
      .lean();
    const driveId =
      doc?.driveFileId ||
      extractDriveFileId(doc?.driveViewLink) ||
      extractDriveFileId(doc?.driveDownloadLink);
    if (driveId) {
      return res.redirect(302, `https://lh3.googleusercontent.com/d/${driveId}=w1200`);
    }
  } catch (e) {
    console.warn('trainer-document Drive fallback failed:', e?.message);
  }

  return res.status(404).json({ success: false, message: 'File not found' });
});

// Serve static uploads (fallback for other upload types)
app.use('/uploads', express.static(uploadsDir, uploadsStaticOptions));
// Backward-compatible alias for clients using API base URL + file path.
app.use('/api/uploads', express.static(uploadsDir, uploadsStaticOptions));

// Simple health check (load balancers / frontend connectivity probes)
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Backend Running" });
});

// Routes
app.get("/api/health", healthCheck);
app.get("/api/health/ready", healthCheck);
app.get("/api/health/deep", healthCheck);

// Metrics endpoint (Prometheus + JSON)
const { router: metricsRouter, requestCounterMiddleware } = require('./routes/metricsRoutes.js');
app.use(requestCounterMiddleware);
app.use("/api/metrics", metricsRouter);

app.use("/api", routes);

// Root
app.get("/", (req, res) => res.send("MBK API is running..."));

// Global error tracker
app.use(errorTracker);

// Global error handler — final middleware to catch all errors
app.use(globalErrorHandler);



// Prevent memory leaks / process crashes
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});

// Graceful shutdown handling
const shutdown = async (signal) => {
  console.log(`🛑 ${signal}: Graceful shutdown initiated...`);
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed.');
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
      process.exit(0);
    });
  } else {
    console.log('HTTP server was not running.');
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  }
  setTimeout(() => {
    console.error('Forcing exit after 10s timeout...');
    process.exit(1);
  }, 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || process.env.BACKEND_PORT || 5005;
const HOST = process.env.HOST || "localhost";
const PROTOCOL = process.env.NODE_ENV === "production" ? "https" : "http";
const SERVER_URL = `${PROTOCOL}://${HOST}:${PORT}`;
const FRONTEND_HOST = process.env.FRONTEND_HOST || "localhost";
const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;
const FRONTEND_PROTOCOL = process.env.FRONTEND_PROTOCOL || "http";
const FRONTEND_URL = `${FRONTEND_PROTOCOL}://${FRONTEND_HOST}:${FRONTEND_PORT}`;

const redactUri = (uri = "") => {
  try {
    const parsed = new URL(uri);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return uri.replace(/(?<=\/\/)([^@]+)@/, "***@");
  }
};

const printStartupBanner = (backendUrl, mongoUri) => {
  console.log("====================================================");
  console.log(`🚀 Backend: ${backendUrl}`);
  console.log(`🌐 Frontend: ${FRONTEND_URL}`);
  if (mongoUri) {
    console.log(`🗄️ MongoDB: ${redactUri(mongoUri)}`);
  } else {
    console.log("🗄️ MongoDB: not configured or running in offline mode");
  }
  console.log("====================================================");
};

const startServer = async (port = Number(process.env.PORT || process.env.BACKEND_PORT) || 5005) => {
  try {
    const dbContext = await connectToDatabase();

    server = http.createServer(app);
    io = new Server(server, {
      cors: {
        origin: corsOriginHandler,
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        const preferredPort = Number(process.env.PORT || process.env.BACKEND_PORT) || 5005;
        if (port === preferredPort && process.env.NODE_ENV !== "production") {
          console.error(
            `❌ Port ${port} is already in use. Run "npm run predev --prefix backend" or stop the stale process, then retry.`,
          );
          process.exit(1);
        }
        console.log(`⚠️ Port ${port} is busy. Trying ${port + 1}...`);
        startServer(port + 1);
        return;
      }
      console.error(err);
      process.exit(1);
    });

    server.listen(port, () => {
      const backendUrl = `${PROTOCOL}://${HOST}:${port}`;
      console.log(`🚀 Server running at ${backendUrl}`);
      printStartupBanner(backendUrl, dbContext?.selectedMongoUri ?? null);

      // Keep-alive tuning — prevents Nginx 502 errors under load.
      // keepAliveTimeout must be > Nginx's keepalive_timeout (default 75s).
      server.keepAliveTimeout = 65_000;
      server.headersTimeout = 66_000;

      // Start the Event-Driven Background Workers
      startAnalyticsWorker();
      socketManager.init(io);
    });
  } catch (error) {
    console.error('❌ Failed to start server due to MongoDB connection issue:', error);
    process.exit(1);
  }
};

// Start Express Server
startServer();

