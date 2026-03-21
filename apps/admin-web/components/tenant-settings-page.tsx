'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { TenantSettingsResponse } from '@fleet-fuel/shared';
import type { NotificationContactRole } from '@fleet-fuel/shared';
import type { NotificationPreviewEventType, NotificationRecipientsPreviewResponse } from '@fleet-fuel/shared';
import type { ScopeStatus } from '@fleet-fuel/shared';
import type { TenantedSystemStatusResponse } from '@fleet-fuel/shared';
import type { UpdateTenantNotificationSettingsRequest } from '@fleet-fuel/shared';

import {
  assignNotificationContactToSite,
  ApiClientError,
  createNotificationContact,
  fetchTenantedSystemStatus,
  getTenantProfile,
  getTenantSettings,
  listNotificationContacts,
  listTenantSites,
  removeNotificationContactSiteAssignment,
  previewNotificationRecipients,
  updateTenantProfile,
  updateNotificationContact,
  updateTenantNotificationSettings,
} from '../lib/api';
import { formatSiteDisplayName } from '../lib/display-format';
import { isSafetyOfficerRole, isSiteSupervisorRole } from '../lib/roles';
import { buildTenantLoginPath, getTenantRoleFromToken, getTenantTokenKey, type TenantStaffRole } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantSettingsPageProps {
  host: string | null;
  subdomain: string | null;
}

function defaultNotificationForm(): UpdateTenantNotificationSettingsRequest {
  return {
    enabled: false,
    channels: {
      whatsapp: { enabled: false },
      email: { enabled: false },
      sms: { enabled: false },
    },
    recipient_scope: 'ALL_TENANT_OPERATIONS',
    custom_recipients: [],
    events: {
      missing_daily_check: true,
      critical_checklist_issue: true,
      fuel_missing_receipt: true,
      odometer_fallback_used: true,
      approved_source_used: true,
      high_priority_exceptions: true,
      compliance_expired: true,
      compliance_expiring_soon: true,
    },
  };
}

export function TenantSettingsPage({ host, subdomain }: TenantSettingsPageProps) {
  const router = useRouter();
  const [settings, setSettings] = useState<TenantSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notificationForm, setNotificationForm] = useState<UpdateTenantNotificationSettingsRequest | null>(null);
  const [contacts, setContacts] = useState<
    Array<{
      id: string;
      name: string;
      role: NotificationContactRole;
      phone_e164: string | null;
      email: string | null;
      is_active: boolean;
      sites: Array<{ id: string; site_code: string; site_name: string }>;
    }>
  >([]);
  const [siteOptions, setSiteOptions] = useState<Array<{ id: string; site_code: string; site_name: string }>>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    id: '',
    name: '',
    role: 'CUSTOM' as NotificationContactRole,
    phone: '',
    email: '',
    is_active: true,
    site_id: '',
  });
  const [contactSaving, setContactSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewEventType, setPreviewEventType] = useState<NotificationPreviewEventType>('COMPLIANCE_EXPIRING_SOON');
  const [previewSiteId, setPreviewSiteId] = useState('');
  const [previewResult, setPreviewResult] = useState<NotificationRecipientsPreviewResponse | null>(null);
  const [systemStatus, setSystemStatus] = useState<TenantedSystemStatusResponse | null>(null);
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null);
  const [role, setRole] = useState<TenantStaffRole | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; username: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  async function refreshNotificationPreview(
    hostname: string,
    token: string,
    eventType: NotificationPreviewEventType,
    siteId?: string,
  ) {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await previewNotificationRecipients(hostname, token, {
        event_type: eventType,
        ...(siteId ? { site_id: siteId } : {}),
      });
      setPreviewResult(result);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        if (caught.code === 'route_not_found') {
          setPreviewResult(null);
          setPreviewError('Recipient preview endpoint is unavailable in the current API runtime.');
          return;
        }
        setPreviewError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setPreviewError(caught instanceof Error ? caught.message : 'Unable to load recipient preview.');
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    const currentRole = getTenantRoleFromToken(token);
    setRole(currentRole);
    if (isSiteSupervisorRole(currentRole) || isSafetyOfficerRole(currentRole)) {
      router.replace('/dashboard');
      return;
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await getTenantSettings(host, token);
        setSettings(result);
        setScopeStatus(result.scope_status ?? 'full_tenant_scope');
        const notifications = result.notifications ?? {
          ...defaultNotificationForm(),
          channels: {
            ...defaultNotificationForm().channels,
            whatsapp: {
              ...defaultNotificationForm().channels.whatsapp,
            },
          },
        };
        setNotificationForm({
          enabled: notifications.enabled,
          channels: {
            whatsapp: {
              enabled: notifications.channels.whatsapp.enabled,
            },
            email: {
              enabled: notifications.channels.email.enabled,
            },
            sms: {
              enabled: notifications.channels.sms.enabled,
            },
          },
          recipient_scope: notifications.recipient_scope,
          custom_recipients: notifications.custom_recipients,
          events: {
            missing_daily_check: notifications.events.missing_daily_check,
            critical_checklist_issue: notifications.events.critical_checklist_issue,
            fuel_missing_receipt: notifications.events.fuel_missing_receipt,
            odometer_fallback_used: notifications.events.odometer_fallback_used,
            approved_source_used: notifications.events.approved_source_used,
            high_priority_exceptions: notifications.events.high_priority_exceptions,
            compliance_expired: notifications.events.compliance_expired,
            compliance_expiring_soon: notifications.events.compliance_expiring_soon,
          },
        });

        const [contactsResult, sitesResult, systemStatusResult] = await Promise.allSettled([
          listNotificationContacts(host, token),
          listTenantSites(host, token),
          fetchTenantedSystemStatus(host, token),
        ]);

        if (contactsResult.status === 'fulfilled') {
          setContacts(
            contactsResult.value.items.map((item) => ({
              id: item.id,
              name: item.name,
              role: item.role,
              phone_e164: item.phone_e164,
              email: item.email,
              is_active: item.is_active,
              sites: item.sites,
            })),
          );
        } else if (contactsResult.reason instanceof ApiClientError && contactsResult.reason.code === 'route_not_found') {
          setContacts([]);
          setContactsError(
            'Contact directory endpoints are unavailable in the current API runtime. Restart the API server to enable contact management.',
          );
        } else {
          throw contactsResult.reason;
        }

        if (sitesResult.status === 'fulfilled') {
          setSiteOptions(sitesResult.value.items);
        } else if (sitesResult.reason instanceof ApiClientError && sitesResult.reason.code === 'route_not_found') {
          setSiteOptions([]);
        } else {
          throw sitesResult.reason;
        }

        if (systemStatusResult.status === 'fulfilled') {
          setSystemStatus(systemStatusResult.value);
          setSystemStatusError(null);
        } else if (
          systemStatusResult.reason instanceof ApiClientError &&
          systemStatusResult.reason.code === 'route_not_found'
        ) {
          setSystemStatus(null);
          setSystemStatusError('System status endpoint is unavailable in the current API runtime.');
        } else {
          throw systemStatusResult.reason;
        }

        await refreshNotificationPreview(host, token, previewEventType, previewSiteId || undefined);
      } catch (caught) {
        if (caught instanceof ApiClientError) {
          const message =
            caught.code === 'route_not_found'
              ? 'Settings endpoint is unavailable in the current API runtime. Restart the API server and retry.'
              : caught.message;
          setError(`${message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, [host, previewEventType, previewSiteId, router, subdomain]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    setRole(null);
    router.replace(buildTenantLoginPath(subdomain));
  }

  async function handleSaveNotifications() {
    if (!host || !subdomain || !notificationForm) {
      return;
    }

    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const result = await updateTenantNotificationSettings(host, token, notificationForm);
      setSettings(result);
      setScopeStatus(result.scope_status ?? 'full_tenant_scope');
      const notifications = result.notifications ?? {
        ...defaultNotificationForm(),
      };
      setNotificationForm({
        enabled: notifications.enabled,
        channels: {
          whatsapp: {
            enabled: notifications.channels.whatsapp.enabled,
          },
          email: {
            enabled: notifications.channels.email.enabled,
          },
          sms: {
            enabled: notifications.channels.sms.enabled,
          },
        },
        recipient_scope: notifications.recipient_scope,
        custom_recipients: notifications.custom_recipients,
        events: {
          missing_daily_check: notifications.events.missing_daily_check,
          critical_checklist_issue: notifications.events.critical_checklist_issue,
          fuel_missing_receipt: notifications.events.fuel_missing_receipt,
          odometer_fallback_used: notifications.events.odometer_fallback_used,
          approved_source_used: notifications.events.approved_source_used,
          high_priority_exceptions: notifications.events.high_priority_exceptions,
          compliance_expired: notifications.events.compliance_expired,
          compliance_expiring_soon: notifications.events.compliance_expiring_soon,
        },
      });
      setSaveMessage('Notification settings saved.');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setSaveError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setSaveError(caught instanceof Error ? caught.message : 'Unable to save notification settings.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile() {
    if (!host || !subdomain || !profile) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    setProfileSaving(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      const updated = await updateTenantProfile(host, token, {
        full_name: profile.full_name.trim(),
        username: profile.username.trim(),
      });
      setProfile({
        full_name: updated.item.full_name,
        username: updated.item.username ?? '',
      });
      setProfileMessage('Profile updated.');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setProfileError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setProfileError(caught instanceof Error ? caught.message : 'Unable to save profile.');
      }
    } finally {
      setProfileSaving(false);
    }
  }

  useEffect(() => {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      return;
    }
    void getTenantProfile(host, token)
      .then((result) => {
        setProfile({
          full_name: result.item.full_name,
          username: result.item.username ?? '',
        });
      })
      .catch(() => {
        setProfile(null);
      });
  }, [host, subdomain]);

  async function refreshContacts(hostname: string, token: string) {
    const result = await listNotificationContacts(hostname, token);
    setContacts(
      result.items.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        phone_e164: item.phone_e164,
        email: item.email,
        is_active: item.is_active,
        sites: item.sites,
      })),
    );
  }

  async function handleSaveContact() {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setContactSaving(true);
    setContactsError(null);
    try {
      if (contactForm.id) {
        await updateNotificationContact(host, token, contactForm.id, {
          name: contactForm.name,
          role: contactForm.role,
          phone: contactForm.phone || null,
          email: contactForm.email || null,
          is_active: contactForm.is_active,
        });
      } else {
        await createNotificationContact(host, token, {
          name: contactForm.name,
          role: contactForm.role,
          phone: contactForm.phone || null,
          email: contactForm.email || null,
          is_active: contactForm.is_active,
        });
      }

      await refreshContacts(host, token);
      setContactForm({
        id: '',
        name: '',
        role: 'CUSTOM',
        phone: '',
        email: '',
        is_active: true,
        site_id: '',
      });
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setContactsError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setContactsError(caught instanceof Error ? caught.message : 'Unable to save contact.');
      }
    } finally {
      setContactSaving(false);
    }
  }

  async function handleAssignSite(contactId: string, siteId: string) {
    if (!host || !subdomain || !siteId) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setContactsError(null);
    try {
      await assignNotificationContactToSite(host, token, contactId, siteId);
      await refreshContacts(host, token);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setContactsError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setContactsError(caught instanceof Error ? caught.message : 'Unable to assign contact site.');
      }
    }
  }

  async function handleRemoveSite(contactId: string, siteId: string) {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setContactsError(null);
    try {
      await removeNotificationContactSiteAssignment(host, token, contactId, siteId);
      await refreshContacts(host, token);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setContactsError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setContactsError(caught instanceof Error ? caught.message : 'Unable to remove contact site.');
      }
    }
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      role={role}
      title="Settings"
      description="Operational configuration and feature policy visibility."
      onSignOut={handleLogout}
    >
      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}
      <section className="card" data-testid="settings-profile-module">
        <h2>My Profile</h2>
        <p className="status">Keep your display identity and account access details up to date.</p>
        {profile ? (
          <div className="stack">
            <label className="field">
              <span>Full Name</span>
              <input
                value={profile.full_name}
                onChange={(event) =>
                  setProfile((current) => (current ? { ...current, full_name: event.target.value } : current))
                }
              />
            </label>
            <label className="field">
              <span>Username</span>
              <input
                value={profile.username}
                onChange={(event) =>
                  setProfile((current) =>
                    current
                      ? { ...current, username: event.target.value.toLowerCase().replace(/\s+/g, '') }
                      : current,
                  )
                }
              />
            </label>
            <div className="edit-actions">
              <button className="button" type="button" onClick={() => void handleSaveProfile()} disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
              <button className="button button-secondary" type="button" onClick={() => router.push('/change-password')}>
                Change password
              </button>
            </div>
            {profileMessage ? <p className="status">{profileMessage}</p> : null}
            {profileError ? <p className="status error">{profileError}</p> : null}
          </div>
        ) : (
          <p className="status">Loading profile…</p>
        )}
      </section>
      <section className="card" data-testid="settings-monitoring-module">
        <h2>Configuration</h2>
        {loading ? <p className="status">Loading settings...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && !settings ? <p className="status">No settings found.</p> : null}
        {!loading && !error && settings ? (
          <>
            <dl>
              <div>
                <dt>Organization name</dt>
                <dd>{settings.tenant.name}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{settings.tenant.status}</dd>
              </div>
              <div>
                <dt>Primary subdomain</dt>
                <dd>{settings.tenant.primary_subdomain}</dd>
              </div>
              <div>
                <dt>Onboarding import</dt>
                <dd>{settings.features.onboarding_import_enabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Fuel submission via admin</dt>
                <dd>{settings.features.fuel_submission_via_admin ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Daily checks submission via admin</dt>
                <dd>{settings.features.daily_check_submission_via_admin ? 'Enabled' : 'Disabled'}</dd>
              </div>
            </dl>

            <section className="card" data-testid="settings-system-status-module">
              <h3>System Status</h3>
              <p className="status">Deployment-readiness signals for API, database, notifications, and configuration.</p>
              {systemStatusError ? <p className="status error">{systemStatusError}</p> : null}
              {systemStatus ? (
                <>
                  <dl>
                    <div>
                      <dt>Environment</dt>
                      <dd>{systemStatus.environment.name}</dd>
                    </div>
                    <div>
                      <dt>API status</dt>
                      <dd>{systemStatus.services.api.reachable ? 'Healthy' : 'Unavailable'}</dd>
                    </div>
                    <div>
                      <dt>Database status</dt>
                      <dd>{systemStatus.services.database.reachable ? 'Reachable' : 'Unavailable'}</dd>
                    </div>
                    <div>
                      <dt>Notification mode</dt>
                      <dd>
                        {systemStatus.services.notifications.mode} / {systemStatus.services.notifications.readiness}
                      </dd>
                    </div>
                    <div>
                      <dt>Config readiness</dt>
                      <dd>{systemStatus.readiness.config_ready ? 'Ready' : 'Action required'}</dd>
                    </div>
                    <div>
                      <dt>Migration readiness</dt>
                      <dd>{systemStatus.readiness.migration_ready ? 'Ready' : 'Action required'}</dd>
                    </div>
                    <div>
                      <dt>App version</dt>
                      <dd>{systemStatus.environment.app_version}</dd>
                    </div>
                    <div>
                      <dt>Build SHA</dt>
                      <dd>{systemStatus.environment.build_sha ?? 'n/a'}</dd>
                    </div>
                  </dl>
                  {systemStatus.services.database.error ? (
                    <p className="status error">Database check error: {systemStatus.services.database.error}</p>
                  ) : null}
                  {systemStatus.readiness.missing_tables.length > 0 ? (
                    <p className="status error">
                      Missing tables: {systemStatus.readiness.missing_tables.join(', ')}. Run: <code>make db-migrate</code>
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>

            <section className="card" data-testid="settings-notifications-module">
              <h3>Notifications</h3>
              <p className="status">
                WhatsApp provider integration is not yet active. These settings prepare operations notification policy.
              </p>
              <p className="status">
                Delivery mode:{' '}
                <strong>{settings?.notifications.channels.whatsapp.delivery_mode ?? 'stub'}</strong>
              </p>
              {notificationForm ? (
                <>
                  <div className="inline-grid two">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.enabled}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  enabled: event.target.checked,
                                }
                              : current,
                          )
                        }
                      />
                      <span>Enable notifications</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.channels.whatsapp.enabled}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  channels: {
                                    ...current.channels,
                                    whatsapp: { enabled: event.target.checked },
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Enable WhatsApp channel</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.channels.email.enabled}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  channels: {
                                    ...current.channels,
                                    email: { enabled: event.target.checked },
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Enable Email channel</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.channels.sms.enabled}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  channels: {
                                    ...current.channels,
                                    sms: { enabled: event.target.checked },
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Enable SMS channel</span>
                    </label>
                  </div>

                  <label className="field">
                    <span>Recipient scope</span>
                    <select
                      value={notificationForm.recipient_scope}
                      onChange={(event) =>
                        setNotificationForm((current) =>
                          current
                            ? {
                                ...current,
                                recipient_scope: event.target.value as UpdateTenantNotificationSettingsRequest['recipient_scope'],
                                custom_recipients:
                                  event.target.value === 'CUSTOM' ? current.custom_recipients : [],
                              }
                            : current,
                        )
                      }
                    >
                      <option value="ALL_TENANT_OPERATIONS">All operations managers</option>
                      <option value="SITE_SUPERVISORS_ONLY">Site supervisors only</option>
                      <option value="CUSTOM">Custom recipients</option>
                    </select>
                  </label>

                  {notificationForm.recipient_scope === 'CUSTOM' ? (
                    <label className="field">
                      <span>Custom recipients (one per line, format: Label|Value)</span>
                      <textarea
                        value={notificationForm.custom_recipients
                          .map((item) => `${item.label}|${item.value}`)
                          .join('\n')}
                        onChange={(event) => {
                          const parsed = event.target.value
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line) => {
                              const [label, ...rest] = line.split('|');
                              return {
                                label: (label ?? '').trim(),
                                value: rest.join('|').trim(),
                              };
                            })
                            .filter((item) => item.label && item.value);
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  custom_recipients: parsed,
                                }
                              : current,
                          );
                        }}
                        rows={4}
                      />
                    </label>
                  ) : null}

                  <div className="inline-grid two">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.missing_daily_check}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    missing_daily_check: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Missing daily check</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.critical_checklist_issue}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    critical_checklist_issue: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Critical checklist issue</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.fuel_missing_receipt}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    fuel_missing_receipt: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Fuel missing receipt</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.odometer_fallback_used}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    odometer_fallback_used: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Odometer fallback used</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.approved_source_used}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    approved_source_used: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Approved source used</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.high_priority_exceptions}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    high_priority_exceptions: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>High-priority exceptions</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.compliance_expired}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    compliance_expired: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Compliance expired</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={notificationForm.events.compliance_expiring_soon}
                        onChange={(event) =>
                          setNotificationForm((current) =>
                            current
                              ? {
                                  ...current,
                                  events: {
                                    ...current.events,
                                    compliance_expiring_soon: event.target.checked,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <span>Compliance expiring soon</span>
                    </label>
                  </div>
                  <div className="toolbar">
                    <button
                      className="button"
                      type="button"
                      onClick={() => void handleSaveNotifications()}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : 'Save notification settings'}
                    </button>
                  </div>
                  {saveMessage ? <p className="status">{saveMessage}</p> : null}
                  {saveError ? <p className="status error">{saveError}</p> : null}
                </>
              ) : null}
            </section>

            <section className="card" data-testid="settings-notification-preview-module">
              <h3>Notification Recipient Preview</h3>
              <p className="status">
                Read-only preview for compliance notification recipient resolution and provider rollout readiness.
              </p>
              <div className="inline-grid two">
                <label className="field">
                  <span>Event type</span>
                  <select
                    value={previewEventType}
                    onChange={(event) => setPreviewEventType(event.target.value as NotificationPreviewEventType)}
                  >
                    <option value="COMPLIANCE_EXPIRING_SOON">Compliance expiring soon</option>
                    <option value="COMPLIANCE_EXPIRED">Compliance expired</option>
                  </select>
                </label>
                <label className="field">
                  <span>Site scope (optional)</span>
                  <select value={previewSiteId} onChange={(event) => setPreviewSiteId(event.target.value)}>
                    <option value="">All operations sites</option>
                    {siteOptions.map((site) => (
                      <option key={site.id} value={site.id}>
                        {formatSiteDisplayName(site)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="toolbar">
                <button
                  className="button secondary"
                  type="button"
                  disabled={previewLoading || !host || !subdomain}
                  onClick={() => {
                    if (!host || !subdomain) {
                      return;
                    }
                    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
                    if (!token) {
                      router.replace('/');
                      return;
                    }
                    void refreshNotificationPreview(host, token, previewEventType, previewSiteId || undefined);
                  }}
                >
                  {previewLoading ? 'Refreshing…' : 'Refresh preview'}
                </button>
              </div>
              {previewError ? <p className="status error">{previewError}</p> : null}
              {previewResult ? (
                <>
                  <p className="status">
                    Provider readiness: <strong>{previewResult.provider_readiness.status}</strong> (
                    {previewResult.provider_readiness.provider})
                  </p>
                  <p className="status">
                    Resolution source: <strong>{previewResult.resolution.source}</strong>
                    {previewResult.resolution.fallback_used ? ' (fallback used)' : ''}
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Contact</th>
                          <th>Label</th>
                          <th>Source</th>
                          <th>Role</th>
                          <th>Scope</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.resolved_recipients.length === 0 ? (
                          <tr>
                            <td colSpan={5}>No recipients resolved for this scope.</td>
                          </tr>
                        ) : (
                          previewResult.resolved_recipients.map((entry) => (
                            <tr key={`${entry.recipient}:${entry.source}:${entry.contact_id ?? 'legacy'}`}>
                              <td>{entry.normalized_contact}</td>
                              <td>{entry.label}</td>
                              <td>{entry.source}</td>
                              <td>{entry.contact_role ?? '—'}</td>
                              <td>{entry.scope}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>

            <section className="card" data-testid="settings-notification-contacts-module">
              <h3>Notification Contacts</h3>
              <p className="status">
                Contacts are scope-filtered and used for reliable recipient resolution. Phone numbers are stored in E.164.
              </p>
              {contactsError ? <p className="status error">{contactsError}</p> : null}

              <div className="inline-grid two">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={contactForm.name}
                    onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Operations Contact"
                  />
                </label>
                <label className="field">
                  <span>Role</span>
                  <select
                    value={contactForm.role}
                    onChange={(event) =>
                      setContactForm((current) => ({
                        ...current,
                        role: event.target.value as NotificationContactRole,
                      }))
                    }
                  >
                    <option value="SITE_SUPERVISOR">Site Supervisor</option>
                    <option value="TRANSPORT_MANAGER">Transport Manager</option>
                    <option value="HEAD_OFFICE_ADMIN">Head Office Admin</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </label>
                <label className="field">
                  <span>Phone (E.164 or local)</span>
                  <input
                    value={contactForm.phone}
                    onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="+96890000000"
                  />
                </label>
                <label className="field">
                  <span>Email (optional)</span>
                  <input
                    value={contactForm.email}
                    onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="ops@example.com"
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={contactForm.is_active}
                    onChange={(event) => setContactForm((current) => ({ ...current, is_active: event.target.checked }))}
                  />
                  <span>Active contact</span>
                </label>
              </div>

              <div className="toolbar">
                <button className="button" type="button" onClick={() => void handleSaveContact()} disabled={contactSaving}>
                  {contactSaving ? 'Saving…' : contactForm.id ? 'Update contact' : 'Add contact'}
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Sites</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No contacts configured.</td>
                      </tr>
                    ) : (
                      contacts.map((contact) => (
                        <tr key={contact.id}>
                          <td>{contact.name}</td>
                          <td>{contact.role}</td>
                          <td>{contact.phone_e164 ?? '—'}</td>
                          <td>{contact.email ?? '—'}</td>
                          <td>
                            {contact.sites.length === 0
                              ? 'All operations sites'
                              : contact.sites.map((site) => formatSiteDisplayName(site)).join(', ')}
                          </td>
                          <td>{contact.is_active ? 'Active' : 'Inactive'}</td>
                          <td>
                            <div className="toolbar">
                              <button
                                className="button secondary"
                                type="button"
                                onClick={() =>
                                  setContactForm({
                                    id: contact.id,
                                    name: contact.name,
                                    role: contact.role,
                                    phone: contact.phone_e164 ?? '',
                                    email: contact.email ?? '',
                                    is_active: contact.is_active,
                                    site_id: '',
                                  })
                                }
                              >
                                Edit
                              </button>
                              <select
                                value={contactForm.id === contact.id ? contactForm.site_id : ''}
                                onChange={(event) => {
                                  const siteId = event.target.value;
                                  if (!siteId) {
                                    return;
                                  }
                                  if (contactForm.id === contact.id) {
                                    setContactForm((current) => ({ ...current, site_id: siteId }));
                                  }
                                  void handleAssignSite(contact.id, siteId);
                                }}
                              >
                                <option value="">Assign site…</option>
                                {siteOptions.map((site) => (
                                  <option key={site.id} value={site.id}>
                                    {formatSiteDisplayName(site)}
                                  </option>
                                ))}
                              </select>
                              {contact.sites.length > 0 ? (
                                <button
                                  className="button secondary"
                                  type="button"
                                  onClick={() => void handleRemoveSite(contact.id, contact.sites[0]!.id)}
                                >
                                  Remove first site
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </TenantSidebarLayout>
  );
}
