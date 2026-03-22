'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { tenantChangePassword } from '../lib/api';
import { buildDriverTenantLoginPath, driverTokenKey, isForcePasswordChangeToken } from '../lib/session';

interface DriverChangePasswordProps {
  host: string | null;
  subdomain: string | null;
}

export function DriverChangePassword({ host, subdomain }: DriverChangePasswordProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subdomain) {
      router.replace(buildDriverTenantLoginPath(subdomain));
      return;
    }
    const stored = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!stored) {
      router.replace(buildDriverTenantLoginPath(subdomain));
      return;
    }
    if (!isForcePasswordChangeToken(stored)) {
      router.replace(`/dashboard?tenant=${encodeURIComponent(subdomain)}`);
      return;
    }
    setToken(stored);
  }, [router, subdomain]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !host || !subdomain) {
      return;
    }
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      const updated = await tenantChangePassword(host, token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      window.localStorage.setItem(driverTokenKey(subdomain), updated.access_token);
      router.replace(`/dashboard?tenant=${encodeURIComponent(subdomain)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Driver app</p>
        <h1>Password update required</h1>
        <p>Set a new password before using checklist and fuel workflows.</p>
      </section>
      <section className="panel">
        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={10}
              required
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={10}
              required
            />
          </label>
          <button className="button" type="submit" disabled={saving || !token}>
            {saving ? 'Updating…' : 'Update password'}
          </button>
          {error ? <p className="status error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
