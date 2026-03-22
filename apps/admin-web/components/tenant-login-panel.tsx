'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { tenantLogin, tenantRequestPasswordReset } from '../lib/api';
import {
  getTenantTokenKey,
  isForcePasswordChangeToken,
  setForcePasswordChangeCookie,
} from '../lib/tenant-session';

interface TenantLoginPanelProps {
  host: string;
  subdomain: string;
}

export function TenantLoginPanel({ host, subdomain }: TenantLoginPanelProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));

    if (token) {
      if (isForcePasswordChangeToken(token)) {
        setForcePasswordChangeCookie(subdomain, true);
        router.replace('/change-password');
      } else {
        setForcePasswordChangeCookie(subdomain, false);
        router.replace('/dashboard');
      }
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
      const requiresPasswordChange = (response as { force_password_change?: boolean }).force_password_change === true;
      window.localStorage.setItem(getTenantTokenKey(subdomain), response.access_token);
      if (requiresPasswordChange) {
        setForcePasswordChangeCookie(subdomain, true);
        router.push('/change-password');
      } else {
        setForcePasswordChangeCookie(subdomain, false);
        router.push('/dashboard');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
    }
  }

  async function handleResetRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetStatus(null);
    setError(null);
    setResetBusy(true);
    try {
      const response = await tenantRequestPasswordReset(host, { identifier: resetIdentifier.trim() });
      setResetStatus(response.message);
      setResetIdentifier('');
    } catch (caught) {
      setResetStatus(caught instanceof Error ? caught.message : 'Unable to submit password reset request.');
    } finally {
      setResetBusy(false);
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
        <form className="stack" onSubmit={handleResetRequest}>
          <label className="field">
            <span>Forgot Password / Request Password Reset</span>
            <input
              type="text"
              name="reset_identifier"
              value={resetIdentifier}
              onChange={(event) => setResetIdentifier(event.target.value)}
              placeholder="Email or username"
              required
            />
          </label>
          <button className="button button-secondary" disabled={resetBusy} type="submit">
            {resetBusy ? 'Submitting…' : 'Submit reset request'}
          </button>
          <p className="status">
            Your request is routed to tenant governance for review.
          </p>
          {resetStatus ? <p className="status">{resetStatus}</p> : null}
        </form>
      </section>
    </>
  );
}
