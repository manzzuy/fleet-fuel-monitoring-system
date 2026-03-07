'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { tenantLogin } from '../lib/api';
import { getTenantTokenKey } from '../lib/tenant-session';

interface TenantLoginPanelProps {
  host: string;
  subdomain: string;
}

export function TenantLoginPanel({ host, subdomain }: TenantLoginPanelProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));

    if (token) {
      router.replace('/dashboard');
    }
  }, [router, subdomain]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const identifierValue = String(formData.get('identifier') ?? '').trim();
    const passwordValue = String(formData.get('password') ?? '');

    try {
      const response = await tenantLogin(host, { identifier: identifierValue, password: passwordValue });
      window.localStorage.setItem(getTenantTokenKey(subdomain), response.access_token);
      router.push('/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
    }
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Fleet Operations</p>
        <h1>{subdomain} operations sign in</h1>
        <p>Sign in with your operations account to access dashboard, alerts, and monitoring modules.</p>
      </section>
      <section className="card">
        <h2>Sign in</h2>
        <form className="stack" data-hydrated={hydrated ? 'true' : 'false'} data-testid="tenant-login-form" method="post" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email or username</span>
            <input
              type="text"
              name="identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="button" disabled={!hydrated} type="submit">
            Sign in
          </button>
          {error ? <p className="status error">{error}</p> : null}
        </form>
      </section>
    </>
  );
}
