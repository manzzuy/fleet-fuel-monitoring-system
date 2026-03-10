'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ChecklistMasterResponse } from '@fleet-fuel/shared';

import {
  ApiClientError,
  createDriverDailyCheck,
  getDriverVehicles,
  getDriverChecklistMaster,
  submitDriverDailyCheck,
} from '../lib/api';
import { driverTokenKey } from '../lib/session';
import { DriverShell } from './driver-shell';

interface DriverDailyCheckProps {
  host: string | null;
  subdomain: string | null;
}

type CheckStatus = 'OK' | 'NOT_OK' | 'NA';
type CheckItemValue = { status: CheckStatus; notes?: string };
type VehicleOption = { id: string; fleet_no: string; plate_no: string | null };

function draftStorageKey(subdomain: string) {
  return `fleetfuel.driver.daily-check.draft.${subdomain}`;
}

function itemIcon(itemName: string) {
  const value = itemName.toLowerCase();
  if (value.includes('light') || value.includes('indicator')) return '💡';
  if (value.includes('tire') || value.includes('tyre')) return '🛞';
  if (value.includes('brake')) return '🛑';
  if (value.includes('fire extinguisher')) return '🧯';
  if (value.includes('mirror') || value.includes('windshield') || value.includes('windscreen')) return '🪟';
  if (value.includes('horn')) return '📯';
  if (value.includes('seat') || value.includes('belt')) return '🪑';
  if (value.includes('oil') || value.includes('fluid')) return '🛢️';
  return '🔧';
}

function statusLabel(status: CheckStatus) {
  if (status === 'OK') return '🟢 Good';
  if (status === 'NOT_OK') return '🔴 Issue';
  return '⚪ N/A';
}

export function DriverDailyCheck({ host, subdomain }: DriverDailyCheckProps) {
  const router = useRouter();
  const [master, setMaster] = useState<ChecklistMasterResponse | null>(null);
  const [items, setItems] = useState<Record<string, CheckItemValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [notesVisible, setNotesVisible] = useState<Record<string, boolean>>({});

  async function loadChecklist(activeHost: string, activeSubdomain: string) {
    const token = window.localStorage.getItem(driverTokenKey(activeSubdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    setLoading(true);
    setError(null);
    setSubmitError(null);
    try {
      const [result, driverVehicles] = await Promise.all([
        getDriverChecklistMaster(activeHost, token),
        getDriverVehicles(activeHost, token),
      ]);
      setMaster(result);
      setVehicles(driverVehicles.items);
      setExpandedSections(() => {
        const isSmallScreen = window.matchMedia('(max-width: 560px)').matches;
        return Object.fromEntries(
          result.sections.map((section, index) => [section.section_code, isSmallScreen ? index === 0 : true]),
        );
      });
      const firstVehicle = driverVehicles.items[0];
      if (firstVehicle) {
        setSelectedVehicleId((current) => current || firstVehicle.id);
      }
      const draft = window.localStorage.getItem(draftStorageKey(activeSubdomain));
      if (draft) {
        try {
          const parsed = JSON.parse(draft) as Record<string, CheckItemValue>;
          setItems(parsed);
          setNotesVisible(
            Object.fromEntries(
              Object.entries(parsed).map(([itemCode, value]) => [itemCode, Boolean(value.notes || value.status === 'NOT_OK')]),
            ),
          );
          setRestoredDraft(true);
        } catch {
          window.localStorage.removeItem(draftStorageKey(activeSubdomain));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    void loadChecklist(host, subdomain)
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
        } else {
          setError(caught instanceof Error ? caught.message : 'Unable to load checklist.');
        }
      });
  }, [host, router, subdomain]);

  function signOut() {
    if (subdomain) {
      window.localStorage.removeItem(driverTokenKey(subdomain));
    }
    router.replace('/');
  }

  function setItemStatus(itemCode: string, status: CheckStatus) {
    setItems((current) => {
      const next = {
        ...current,
        [itemCode]: {
          status,
          ...(current[itemCode]?.notes ? { notes: current[itemCode].notes } : {}),
        },
      };
      if (subdomain) {
        window.localStorage.setItem(draftStorageKey(subdomain), JSON.stringify(next));
      }
      return next;
    });
    if (status === 'NOT_OK') {
      setNotesVisible((current) => ({ ...current, [itemCode]: true }));
    }
  }

  function setItemNotes(itemCode: string, notes: string) {
    setItems((current) => {
      const next = {
        ...current,
        [itemCode]: {
          status: current[itemCode]?.status ?? 'OK',
          ...(notes ? { notes } : {}),
        },
      };
      if (subdomain) {
        window.localStorage.setItem(draftStorageKey(subdomain), JSON.stringify(next));
      }
      return next;
    });
  }

  const totalItems = useMemo(
    () => master?.sections.reduce((acc, section) => acc + section.items.length, 0) ?? 0,
    [master],
  );
  const requiredItemCodes = useMemo(
    () =>
      master?.sections
        .flatMap((section) => section.items)
        .filter((item) => item.required)
        .map((item) => item.item_code) ?? [],
    [master],
  );
  const requiredCompleted = useMemo(
    () => requiredItemCodes.filter((itemCode) => Boolean(items[itemCode]?.status)).length,
    [items, requiredItemCodes],
  );

  function toggleSection(sectionCode: string) {
    setExpandedSections((current) => ({ ...current, [sectionCode]: !current[sectionCode] }));
  }

  async function onSubmit() {
    if (!host || !subdomain) {
      return;
    }

    const token = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    if (!master) {
      return;
    }

    const payloadItems = Object.entries(items).map(([itemCode, value]) => ({
      item_code: itemCode,
      status: value.status,
      ...(value.notes ? { notes: value.notes } : {}),
    }));

    const missingRequired = requiredItemCodes.filter((itemCode) => !items[itemCode]);
    if (missingRequired.length > 0) {
      setSubmitError('Complete all required checklist items before submit.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);

    try {
      const date = new Date().toISOString().slice(0, 10);
      const check = await createDriverDailyCheck(host, token, {
        check_date: date,
        ...(selectedVehicleId ? { vehicle_id: selectedVehicleId } : {}),
      });
      await submitDriverDailyCheck(host, token, check.id, { items: payloadItems });
      setSuccess('Daily checklist submitted.');
      if (subdomain) {
        window.localStorage.removeItem(draftStorageKey(subdomain));
      }
      setItems({});
      setRestoredDraft(false);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setSubmitError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setSubmitError(caught instanceof Error ? caught.message : 'Checklist submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DriverShell
      onSignOut={signOut}
      subdomain={subdomain ?? 'tenant'}
      subtitle="Complete checklist items before starting operations."
      title="Daily checklist"
    >
      <section className="panel">
        {loading ? <p className="status">Loading checklist...</p> : null}
        {error ? (
          <div className="stack">
            <p className="status error">{error}</p>
            <button
              className="button ghost"
              onClick={() => {
                if (host && subdomain) {
                  void loadChecklist(host, subdomain).catch((caught) => {
                    if (caught instanceof ApiClientError) {
                      setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
                    } else {
                      setError(caught instanceof Error ? caught.message : 'Unable to load checklist.');
                    }
                  });
                }
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}
        {success ? (
          <p className="status success" data-testid="driver-checklist-submit-success">
            {success}
          </p>
        ) : null}
        {!loading && !error && restoredDraft ? (
          <p className="status" data-testid="driver-checklist-draft-restored">
            In-progress checklist restored.
          </p>
        ) : null}
        {!loading && !error && master ? (
          <p className="status">
            Required items: {requiredItemCodes.length} / Total items: {totalItems}
          </p>
        ) : null}
        {!loading && !error && master && master.sections.length === 0 ? (
          <p className="status">Checklist is not configured for this tenant yet.</p>
        ) : null}
        {!loading && !error && master ? (
          <div className="stack" data-testid="driver-checklist-form">
            {submitError ? <p className="status error">{submitError}</p> : null}
            <div className="checklist-progress">
              <strong>{requiredCompleted}</strong> / {requiredItemCodes.length} required completed
            </div>
            {master.sections.length > 1 ? (
              <div className="segmented segmented-two">
                <button
                  className="button ghost compact"
                  onClick={() =>
                    setExpandedSections(Object.fromEntries(master.sections.map((section) => [section.section_code, true])))
                  }
                  type="button"
                >
                  Expand all
                </button>
                <button
                  className="button ghost compact"
                  onClick={() =>
                    setExpandedSections(
                      Object.fromEntries(master.sections.map((section, index) => [section.section_code, index === 0])),
                    )
                  }
                  type="button"
                >
                  Compact view
                </button>
              </div>
            ) : null}
            <label className="field">
              <span>Vehicle</span>
              <select
                data-testid="driver-checklist-vehicle"
                onChange={(event) => setSelectedVehicleId(event.target.value)}
                value={selectedVehicleId}
              >
                {vehicles.length === 0 ? <option value="">No vehicles available</option> : null}
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.fleet_no} {vehicle.plate_no ? `(${vehicle.plate_no})` : ''}
                  </option>
                ))}
              </select>
            </label>
            {master.sections.map((section) => (
              <div className="panel" key={section.section_code}>
                <button
                  aria-expanded={expandedSections[section.section_code] ? 'true' : 'false'}
                  className="section-toggle"
                  onClick={() => toggleSection(section.section_code)}
                  type="button"
                >
                  <h3>{section.section_name}</h3>
                  <span>{expandedSections[section.section_code] ? '−' : '+'}</span>
                </button>
                {expandedSections[section.section_code]
                  ? section.items.map((item) => (
                  <div className="stack" data-testid={`driver-checklist-item-${item.item_code}`} key={item.item_code}>
                    <div className="checklist-item-label">
                      <span className="checklist-item-icon" aria-hidden="true">
                        {itemIcon(item.item_name)}
                      </span>
                      <p>
                        {item.item_name} {item.required ? <strong>(Required)</strong> : <span>(Optional)</span>}
                      </p>
                    </div>
                    <div className="segmented segmented-toggle">
                      {(['OK', 'NOT_OK', 'NA'] as const).map((status) => (
                        <button
                          aria-label={status}
                          key={status}
                          className={`toggle-option ${items[item.item_code]?.status === status ? 'active' : ''}`}
                          onClick={() => setItemStatus(item.item_code, status)}
                          type="button"
                        >
                          {statusLabel(status)}
                        </button>
                      ))}
                    </div>
                    {notesVisible[item.item_code] || items[item.item_code]?.notes ? (
                      <label className="field">
                        <span>Notes (optional)</span>
                        <input
                          onChange={(event) => setItemNotes(item.item_code, event.target.value)}
                          placeholder="Add notes if needed"
                          type="text"
                          value={items[item.item_code]?.notes ?? ''}
                        />
                      </label>
                    ) : (
                      <button
                        className="button ghost compact"
                        onClick={() => setNotesVisible((current) => ({ ...current, [item.item_code]: true }))}
                        type="button"
                      >
                        Add note
                      </button>
                    )}
                  </div>
                  ))
                  : null}
              </div>
            ))}
            <button className="button" data-testid="driver-submit-daily-checklist" disabled={submitting} onClick={onSubmit} type="button">
              {submitting ? 'Submitting...' : 'Submit checklist'}
            </button>
          </div>
        ) : null}
      </section>
    </DriverShell>
  );
}
