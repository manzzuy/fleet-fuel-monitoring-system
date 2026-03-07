'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { getTenantTokenKey } from '../lib/tenant-session';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantPlaceholderPageProps {
  host: string | null;
  subdomain: string | null;
  title: string;
  description: string;
}

export function TenantPlaceholderPage({ host, subdomain, title, description }: TenantPlaceholderPageProps) {
  const router = useRouter();

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
    }
  }, [host, router, subdomain]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    router.replace('/');
  }

  return (
    <TenantSidebarLayout subdomain={subdomain ?? 'tenant'} title={title} description={description} onSignOut={handleLogout}>
      <section className="card">
        <h2>Coming soon</h2>
        <p>This module will be implemented in a follow-up phase. Tenant routing and auth are already enforced.</p>
      </section>
    </TenantSidebarLayout>
  );
}
