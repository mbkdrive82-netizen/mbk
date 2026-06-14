export const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
  // Ensure AbortController is available (Node 16+ / browsers)
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

export default fetchWithTimeout;
