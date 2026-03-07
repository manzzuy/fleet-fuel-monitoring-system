'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiClientError, tenantLogin } from '../lib/api';
import { driverTokenKey } from '../lib/session';

interface DriverLoginProps {
  host: string | null;
  subdomain: string | null;
}

export function DriverLogin({ host, subdomain }: DriverLoginProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!subdomain) {
      return;
    }
    const existing = window.localStorage.getItem(driverTokenKey(subdomain));
    if (existing) {
      router.replace('/dashboard');
    }
  }, [router, subdomain]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!host || !subdomain) {
      setError('Tenant host could not be resolved.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const login = await tenantLogin(host, { identifier, password });

      if (login.actor_type !== 'DRIVER') {
        setError('This account is not allowed in the driver app.');
        setLoading(false);
        return;
      }

      window.localStorage.setItem(driverTokenKey(subdomain), login.access_token);
      router.replace('/dashboard');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setError(caught instanceof Error ? caught.message : 'Driver login failed.');
      }
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Driver app</p>
        <h1>{subdomain ?? 'tenant'} sign in</h1>
        <p>Field-ready driver workflow access for checklist and fuel submission.</p>
      </section>
      <section className="panel">
        <form className="stack" data-hydrated={hydrated ? 'true' : 'false'} data-testid="driver-login-form" method="post" onSubmit={onSubmit}>
          <label className="field">
            <span>Username</span>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="text"
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="driver username"
              required
              type="text"
              value={identifier}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="button" disabled={loading || !hydrated} type="submit">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          {error ? <p className="status error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
