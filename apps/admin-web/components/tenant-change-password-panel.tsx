'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { tenantChangePassword } from '../lib/api';
import {
  buildTenantLoginPath,
  getTenantTokenKey,
  isForcePasswordChangeToken,
  setForcePasswordChangeCookie,
} from '../lib/tenant-session';

interface TenantChangePasswordPanelProps {
  host: string;
  subdomain: string;
}

export function TenantChangePasswordPanel({ host, subdomain }: TenantChangePasswordPanelProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [forcedMode, setForcedMode] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!stored) {
      router.replace(buildTenantLoginPath(subdomain));
      return;
    }
    const isForced = isForcePasswordChangeToken(stored);
    setForcedMode(isForced);
    setToken(stored);
    setForcePasswordChangeCookie(subdomain, isForced);
  }, [router, subdomain]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await tenantChangePassword(host, token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      window.localStorage.setItem(getTenantTokenKey(subdomain), response.access_token);
      setForcePasswordChangeCookie(subdomain, false);
      router.replace(`/dashboard?tenant=${encodeURIComponent(subdomain)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card" data-testid="tenant-change-password-card">
      <h2>{forcedMode ? 'Password Update Required' : 'Change Password'}</h2>
      <p>
        {forcedMode
          ? 'Your account must set a new password before accessing tenant operations.'
          : 'Update your account password for tenant operations access.'}
      </p>
      <form className="stack" data-testid="tenant-change-password-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            name="current_password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            name="new_password"
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
            name="confirm_password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={10}
            required
          />
        </label>
        <button className="button" disabled={loading || !token} type="submit">
          {loading ? 'Updating…' : 'Update password'}
        </button>
        {error ? <p className="status error">{error}</p> : null}
      </form>
    </section>
  );
}
