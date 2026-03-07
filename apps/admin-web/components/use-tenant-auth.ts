'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getTenantTokenKey } from '../lib/tenant-session';

interface UseTenantAuthResult {
  token: string | null;
  loading: boolean;
  logout: () => void;
}

export function useTenantAuth(subdomain: string | null, redirectPath = '/'): UseTenantAuthResult {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subdomain) {
      router.replace(redirectPath);
      return;
    }

    const stored = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!stored) {
      router.replace(redirectPath);
      return;
    }

    setToken(stored);
    setLoading(false);
  }, [redirectPath, router, subdomain]);

  function logout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    setToken(null);
    router.replace('/');
  }

  return { token, loading, logout };
}
