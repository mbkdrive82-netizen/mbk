'use client';

import { startTransition } from 'react';

const ROUTER_NOT_READY = 'before initialization';
const RETRY_DELAYS_MS = [0, 16, 48, 120, 250, 500, 1000];
const ROUTER_READY_POLL_MS = 16;
const ROUTER_READY_TIMEOUT_MS = 5000;

let routerReadyPromise = null;

// The App Router client is usable once the document is "interactive"
// (DOM parsed + hydration can run) — we do NOT need to wait for the full
// "complete"/load event (all images/fonts/etc.). Waiting for full load made
// post-login redirects linger on heavy pages (e.g. the landing page) for
// seconds before navigating. Any genuine "router not ready" error is still
// caught and retried by runDeferred below.
const isDocumentComplete = () =>
  typeof document !== 'undefined' &&
  (document.readyState === 'interactive' || document.readyState === 'complete');

export const isRouterNotReadyError = (error) =>
  String(error?.message || error).includes(ROUTER_NOT_READY);

export const isChunkLoadError = (error) => {
  const message = String(error?.message || error || '');
  const name = String(error?.name || '');
  return (
    name === 'ChunkLoadError'
    || message.includes('ChunkLoadError')
    || message.includes('Failed to load chunk')
    || message.includes('Loading chunk')
  );
};

/**
 * Wait until the App Router client runtime has finished bootstrapping.
 * Safe to call multiple times; resolves once per page load.
 */
export const waitForAppRouterReady = () => {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (routerReadyPromise) {
    return routerReadyPromise;
  }

  routerReadyPromise = new Promise((resolve) => {
    const finish = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    };

    if (isDocumentComplete()) {
      finish();
      return;
    }

    const onReady = () => {
      document.removeEventListener('DOMContentLoaded', onReady);
      window.removeEventListener('load', onReady);
      finish();
    };

    // Resolve as soon as the DOM is parsed (interactive) instead of waiting for
    // every sub-resource to finish downloading.
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
    window.addEventListener('load', onReady, { once: true });

    const startedAt = Date.now();
    const poll = () => {
      if (isDocumentComplete()) {
        onReady();
        return;
      }

      if (Date.now() - startedAt >= ROUTER_READY_TIMEOUT_MS) {
        finish();
        return;
      }

      window.setTimeout(poll, ROUTER_READY_POLL_MS);
    };

    poll();
  });

  return routerReadyPromise;
};

const runDeferred = (action, remainingRetries, retryIndex = 0) => {
  startTransition(() => {
    try {
      action();
    } catch (error) {
      if (isRouterNotReadyError(error) && remainingRetries > 0) {
        const delay = RETRY_DELAYS_MS[retryIndex] ?? 1000;
        window.setTimeout(
          () => runDeferred(action, remainingRetries - 1, retryIndex + 1),
          delay,
        );
        return;
      }

      if (isRouterNotReadyError(error)) {
        return;
      }

      throw error;
    }
  });
};

/**
 * Defer navigation until after hydration / App Router initialization.
 * Use for router.push/replace inside useEffect — never during render.
 */
export const deferRouterAction = (action, { retries = RETRY_DELAYS_MS.length - 1 } = {}) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (isDocumentComplete()) {
    try {
      action();
      return;
    } catch (error) {
      if (!isRouterNotReadyError(error)) {
        throw error;
      }
    }
  }

  void waitForAppRouterReady().then(() => {
    runDeferred(action, retries);
  });
};

export const safeRouterReplace = (router, href) => {
  if (!router || !href) return;
  deferRouterAction(() => router.replace(href));
};

export const safeRouterPush = (router, href) => {
  if (!router || !href) return;
  deferRouterAction(() => router.push(href));
};

export const safeRouterPrefetch = (router, href) => {
  if (!router?.prefetch || !href) return;
  deferRouterAction(() => {
    try {
      const result = router.prefetch(href);
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          if (!isRouterNotReadyError(error) && !isChunkLoadError(error)) {
            console.warn('[router] Prefetch failed:', href, error);
          }
        });
      }
    } catch (error) {
      if (!isRouterNotReadyError(error) && !isChunkLoadError(error)) {
        throw error;
      }
    }
  }, { retries: 2 });
};
