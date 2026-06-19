// File: c:/mbk_project/frontend/src/app/logout/page.jsx

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function LogoutPage() {
  const { logout } = useAuth();

  useEffect(() => {
    const performLogout = async () => {
      try {
        await logout();
      } finally {
        if (typeof window !== 'undefined') {
          window.location.replace('/');
        }
      }
    };
    performLogout();
  }, [logout]);

  return null; // No UI needed
}
