import mongoose from "mongoose";
import net from 'net';

const redactMongoUri = (uri = "") => {
  try {
    const normalized = uri.replace(/\s+/g, "");
    const parsed = new URL(normalized);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return uri.replace(/(?<=\/\/)([^@]+)@/, "***@");
  }
};

// Background reconnect loop. Mongoose's automatic reconnection only kicks in
// AFTER a first successful connection; if the very first connect fails (e.g. a
// DNS/network blip at startup) the app would otherwise stay permanently in
// "offline mode" until a manual restart. This keeps retrying in the background
// so the app self-heals once connectivity returns.
let reconnectTimer = null;

const startBackgroundReconnect = (mongoUri, connectOptions) => {
  if (reconnectTimer || !mongoUri) return;
  const RETRY_MS = 10000;

  const attempt = async () => {
    reconnectTimer = null;
    // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (mongoose.connection.readyState === 1) return;
    if (mongoose.connection.readyState === 2) {
      reconnectTimer = setTimeout(attempt, RETRY_MS);
      return;
    }
    try {
      await mongoose.connect(mongoUri, connectOptions);
      console.log('✅ MongoDB connected successfully (background retry)');
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.warn(`⏳ MongoDB still unreachable, retrying in ${RETRY_MS / 1000}s: ${msg}`);
      reconnectTimer = setTimeout(attempt, RETRY_MS);
    }
  };

  reconnectTimer = setTimeout(attempt, RETRY_MS);
};

const connectToDatabase = async () => {
  const atlasUri = process.env.MONGO_URI?.trim();
  const localUri = process.env.MONGO_URI_LOCAL?.trim();
  const useLocalFirst = process.env.NODE_ENV !== "production" && Boolean(localUri);
  const mongoUri = useLocalFirst ? localUri : atlasUri || localUri;
  const selectedMongoUri = mongoUri || null;
  const selectedMongoSource = mongoUri === localUri ? "local" : mongoUri === atlasUri ? "atlas" : "none";

  console.log("🔧 MongoDB configuration:", {
    atlasUri: Boolean(atlasUri),
    localUri: Boolean(localUri),
    nodeEnv: process.env.NODE_ENV || "development",
    selected: selectedMongoSource,
    selectedUri: selectedMongoUri ? redactMongoUri(selectedMongoUri) : null,
  });

  if (!mongoUri) {
    console.error("❌ No MongoDB URI found – check .env");
    const allowOffline = (process.env.ALLOW_OFFLINE === '1') || (process.env.NODE_ENV !== 'production');
    if (allowOffline) {
      console.warn('⚠️ Continuing without MongoDB (offline mode enabled)');
      return { mongoose: null, selectedMongoUri: null };
    }
    process.exit(1);
  }

  console.log("🔌 Attempting MongoDB connection …");

  // Connection pool tuned for 70K users across 2 replicas (100 × 2 = 200 total connections)
  const connectOptions = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 15000,  // REDUCED from 45s to prevent long hangs
    maxPoolSize: 100,             // 100 per replica × 2 replicas = 200 total
    minPoolSize: 10,              // Keep 10 warm connections
    maxIdleTimeMS: 30000,         // Close idle connections after 30s
    heartbeatFrequencyMS: 10000,  // Detect dead connections every 10s (default: 10s)
    compressors: ['zstd', 'snappy', 'zlib'], // Wire compression
    retryWrites: true,
    retryReads: true,
    w: 'majority',               // Write concern for consistency
    autoIndex: process.env.NODE_ENV !== 'production', // Disable in prod — prevents slow startups
  };

  mongoose.connection.on('connected', () => console.log('✅ MongoDB pool connected'));
  mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err.message));

  try {
    // If selected URI is local (localhost / 127.0.0.1), probe the port first
    const isLocal = /(^mongodb:\/\/localhost)|(^mongodb:\/\/127\.0\.0\.1)|localhost:|127\.0\.0\.1:/.test(mongoUri || '');
    if (isLocal) {
      const hostMatch = mongoUri.match(/mongodb:\/\/([^:/]+)(?::(\d+))?/);
      const host = hostMatch ? hostMatch[1] : '127.0.0.1';
      const port = hostMatch && hostMatch[2] ? parseInt(hostMatch[2], 10) : 27017;

      const probe = () => new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        socket.setTimeout(1500);
        socket.once('connect', () => { settled = true; socket.destroy(); resolve(true); });
        socket.once('timeout', () => { if (!settled) { settled = true; socket.destroy(); resolve(false); } });
        socket.once('error', () => { if (!settled) { settled = true; resolve(false); } });
        socket.connect(port, host);
      });

      const reachable = await probe();
      if (!reachable) {
        console.warn(`⚠️ MongoDB at ${host}:${port} appears unreachable; skipping mongoose connect (offline).`);
        const allowOffline = (process.env.ALLOW_OFFLINE === '1') || (process.env.NODE_ENV !== 'production');
        if (allowOffline) return { mongoose: null, selectedMongoUri: mongoUri };
        // proceed to try mongoose.connect anyway (will likely fail)
      }
    }

    await mongoose.connect(mongoUri, connectOptions);
    console.log("✅ MongoDB connected successfully");
    return { mongoose, selectedMongoUri: mongoUri };
  } catch (err) {
    // Log a concise, helpful message for common connection failures
    const msg = err && err.message ? err.message : String(err);
    console.warn(`❌ MongoDB connection error: ${msg}`);

    // If Atlas was selected and a local URI exists, try local fallback
    if (mongoUri === atlasUri && localUri) {
      console.warn("⚠️ Trying local fallback MongoDB URI …");
      try {
        await mongoose.connect(localUri, connectOptions);
        console.log("✅ Local MongoDB connected");
        return { mongoose, selectedMongoUri: localUri };
      } catch (fallbackErr) {
        const fmsg = fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr);
        console.warn(`❌ Local fallback also failed: ${fmsg}`);
        const allowOffline = (process.env.ALLOW_OFFLINE === '1') || (process.env.NODE_ENV !== 'production');
        if (allowOffline) {
          console.warn('⚠️ Continuing without MongoDB (offline mode enabled)');
          startBackgroundReconnect(mongoUri, connectOptions);
          return { mongoose: null, selectedMongoUri: localUri };
        }
        throw fallbackErr;
      }
    }

    // If DB connection fails and offline is allowed, continue running (dev only)
    const allowOffline = (process.env.ALLOW_OFFLINE === '1') || (process.env.NODE_ENV !== 'production');
    if (allowOffline) {
      console.warn('⚠️ Continuing without MongoDB (offline mode enabled)');
      startBackgroundReconnect(mongoUri, connectOptions);
      return { mongoose: null, selectedMongoUri: mongoUri };
    }

    throw err;
  }
};

export default mongoose;
export { connectToDatabase };
