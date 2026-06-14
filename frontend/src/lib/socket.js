// src/lib/socket.js
import { io } from "socket.io-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5006";

let socketInstance = null;

/**
 * Initialize socket connection (lazy). Returns a connected socket.
 * It registers the user (if auth info is available) and sets up basic listeners.
 */
export function getSocket(userId = null, token = null) {
  if (socketInstance) return socketInstance;

  socketInstance = io(BACKEND_URL, {
    transports: ["websocket"],
    autoConnect: false,
    path: "/socket.io",
  });

  // Register once connected
  socketInstance.on("connect", () => {
    if (userId) {
      socketInstance.emit("register", { userId, token });
    }
  });

  // Optional: handle auth errors
  socketInstance.on("auth_error", (payload) => {
    console.error("Socket auth error:", payload);
    // Force reconnect with fresh token if needed
  });

  // Auto‑connect
  socketInstance.connect();

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
