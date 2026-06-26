import toast from 'react-hot-toast';

const DEFAULT_LOADING_LABEL = 'Please wait...';

const TOAST_STYLES = {
  success: {
    background: '#16a34a',
    color: '#ffffff',
    border: '1px solid #15803d',
  },
  error: {
    background: '#dc2626',
    color: '#ffffff',
    border: '1px solid #b91c1c',
  },
  warning: {
    background: '#ea580c',
    color: '#ffffff',
    border: '1px solid #c2410c',
  },
  info: {
    background: '#2563eb',
    color: '#ffffff',
    border: '1px solid #1e40af',
  },
};

export const notify = {
  success: (message, options = {}) =>
    toast.success(message, {
      style: TOAST_STYLES.success,
      ...options,
    }),
  error: (message, options = {}) =>
    toast.error(message, {
      style: TOAST_STYLES.error,
      ...options,
    }),
  warning: (message, options = {}) =>
    toast(message, {
      icon: '!',
      style: TOAST_STYLES.warning,
      ...options,
    }),
  info: (message, options = {}) =>
    toast(message, {
      style: TOAST_STYLES.info,
      ...options,
    }),
  loading: (message = DEFAULT_LOADING_LABEL, options = {}) =>
    toast.loading(message, options),
  dismiss: (id) => toast.dismiss(id),
  promise: (promise, messages, options = {}) =>
    toast.promise(promise, messages, options),
  /**
   * Navigate immediately and show a success toast in parallel.
   * Navigation is not blocked by the toast, so the dashboard loads instantly
   * after login while the confirmation toast stays visible during the transition.
   */
  successAndNavigate: async (message, navigateFn, delayMs = 0) => {
    toast.success(message, { style: TOAST_STYLES.success });
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (typeof navigateFn === 'function') {
      await navigateFn();
    }
  },
};

export default notify;
