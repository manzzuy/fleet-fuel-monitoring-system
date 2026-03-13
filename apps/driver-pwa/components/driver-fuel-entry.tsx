'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ApiClientError,
  createDriverFuelEntry,
  getDriverDashboard,
  getDriverVehicles,
  uploadDriverReceipt,
} from '../lib/api';
import {
  formatPreviousOdometer,
  getPreviousOdometerKm,
  validateOdometerAgainstPrevious,
} from '../lib/odometer-workflow';
import { driverTokenKey } from '../lib/session';
import { DriverShell } from './driver-shell';

interface DriverFuelEntryProps {
  host: string | null;
  subdomain: string | null;
}

type FuelSourceType = 'station' | 'tank' | 'card' | 'approved_source';
type VehicleOption = {
  id: string;
  fleet_no: string;
  plate_no: string | null;
  previous_odometer_km?: number | null;
};
type FuelDraft = {
  vehicleId: string | null;
  entryDate: string;
  liters: string;
  odometerKm: string;
  sourceType: FuelSourceType;
  fuelStationId: string;
  fuelCardId: string;
  tankId: string;
  approvedSourceContext: string;
  odometerFallbackUsed: boolean;
  odometerFallbackReason: string;
  notes: string;
  receiptUrl: string;
};

function fuelDraftStorageKey(subdomain: string) {
  return `fleetfuel.driver.fuel-entry.draft.${subdomain}`;
}

function defaultDraft(): FuelDraft {
  return {
    vehicleId: null,
    entryDate: new Date().toISOString().slice(0, 10),
    liters: '',
    odometerKm: '',
    sourceType: 'station',
    fuelStationId: '',
    fuelCardId: '',
    tankId: '',
    approvedSourceContext: '',
    odometerFallbackUsed: false,
    odometerFallbackReason: '',
    notes: '',
    receiptUrl: '',
  };
}

export function DriverFuelEntry({ host, subdomain }: DriverFuelEntryProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<FuelDraft>(defaultDraft());
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const odometerInputRef = useRef<HTMLInputElement | null>(null);

  function updateDraft(patch: Partial<FuelDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (subdomain) {
        window.localStorage.setItem(fuelDraftStorageKey(subdomain), JSON.stringify(next));
      }
      return next;
    });
  }

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    const token = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    setLoading(true);
    setError(null);

    void Promise.all([getDriverDashboard(host, token), getDriverVehicles(host, token)])
      .then(([dashboard, vehicleResponse]) => {
        const restored = window.localStorage.getItem(fuelDraftStorageKey(subdomain));
        if (restored) {
          try {
            const parsed = JSON.parse(restored) as Partial<FuelDraft>;
            setDraft((current) => ({ ...current, ...parsed }));
            setRestoredDraft(true);
          } catch {
            window.localStorage.removeItem(fuelDraftStorageKey(subdomain));
          }
        }

        setVehicles(vehicleResponse.items);
        const initialVehicle = dashboard.assignment.vehicle?.id ?? vehicleResponse.items[0]?.id ?? undefined;
        if (initialVehicle) {
          setDraft((current) => {
            if (current.vehicleId) {
              return current;
            }
            const next = { ...current, vehicleId: initialVehicle };
            window.localStorage.setItem(fuelDraftStorageKey(subdomain), JSON.stringify(next));
            return next;
          });
        }
      })
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
        } else {
          setError(caught instanceof Error ? caught.message : 'Unable to load driver context.');
        }
      })
      .finally(() => setLoading(false));
  }, [host, router, subdomain]);

  const previousOdometerKm = useMemo(
    () => getPreviousOdometerKm(vehicles, draft.vehicleId),
    [draft.vehicleId, vehicles],
  );
  const hasPreviousOdometer = previousOdometerKm !== null;
  const odometerValidationMessage = useMemo(() => {
    if (draft.odometerFallbackUsed) {
      return null;
    }
    if (!draft.odometerKm.trim()) {
      return null;
    }
    return validateOdometerAgainstPrevious(draft.odometerKm, previousOdometerKm);
  }, [draft.odometerFallbackUsed, draft.odometerKm, previousOdometerKm]);
  const odometerRequiredMissing = !draft.odometerFallbackUsed && !draft.odometerKm.trim();

  function signOut() {
    if (subdomain) {
      window.localStorage.removeItem(driverTokenKey(subdomain));
    }
    router.replace('/');
  }

  async function onUploadReceipt(file: File) {
    if (!host || !subdomain) {
      return;
    }

    const token = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const uploaded = await uploadDriverReceipt(host, token, file);
      updateDraft({ receiptUrl: uploaded.receipt_url });
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setError(caught instanceof Error ? caught.message : 'Receipt upload failed.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!draft.vehicleId) {
        setError('Vehicle is required.');
        return;
      }
      if (draft.sourceType === 'approved_source' && !draft.approvedSourceContext.trim()) {
        setError('Approved source context is required.');
        return;
      }
      if (draft.odometerFallbackUsed && !draft.odometerFallbackReason.trim()) {
        setError('Fallback reason is required when odometer fallback is enabled.');
        return;
      }
      if (!draft.odometerFallbackUsed && !draft.odometerKm.trim()) {
        setError('Odometer is required unless fallback is enabled.');
        return;
      }
      if (!draft.odometerFallbackUsed) {
        const odometerError = validateOdometerAgainstPrevious(draft.odometerKm, previousOdometerKm);
        if (odometerError) {
          setError(odometerError);
          return;
        }
      }

      const response = await createDriverFuelEntry(host, token, {
        vehicle_id: draft.vehicleId,
        entry_date: draft.entryDate,
        liters: Number(draft.liters),
        source_type: draft.sourceType,
        fuel_station_id: draft.fuelStationId || undefined,
        fuel_card_id: draft.fuelCardId || undefined,
        tank_id: draft.tankId || undefined,
        approved_source_context: draft.approvedSourceContext || undefined,
        odometer_km: draft.odometerKm ? Number(draft.odometerKm) : undefined,
        odometer_fallback_used: draft.odometerFallbackUsed,
        odometer_fallback_reason: draft.odometerFallbackReason || undefined,
        notes: draft.notes || undefined,
        receipt_url: draft.receiptUrl || undefined,
      });
      const refreshedVehicles = await getDriverVehicles(host, token);
      setVehicles(refreshedVehicles.items);

      setSuccess(`Fuel entry submitted (${response.entry.id}).`);
      setDraft((current) => ({
        ...defaultDraft(),
        entryDate: current.entryDate,
        vehicleId: current.vehicleId,
      }));
      if (subdomain) {
        window.localStorage.removeItem(fuelDraftStorageKey(subdomain));
      }
      setRestoredDraft(false);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setError(caught instanceof Error ? caught.message : 'Fuel entry submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DriverShell
      onSignOut={signOut}
      subdomain={subdomain ?? 'tenant'}
      subtitle="Submit field fueling events with controlled source typing."
      title="Fuel entry"
    >
      <section className="panel">
        {loading ? <p className="status">Loading fuel entry context...</p> : null}
        {restoredDraft ? (
          <p className="status" data-testid="driver-fuel-draft-restored">
            In-progress fuel entry restored.
          </p>
        ) : null}
        <form className="stack" data-testid="driver-fuel-form" onSubmit={onSubmit}>
          <div className="vehicle-odometer-row" data-testid="driver-fuel-vehicle-odometer-row">
            <label className="field">
              <span>Vehicle</span>
              <select
                data-testid="driver-fuel-vehicle"
                onChange={(event) => {
                  updateDraft({ vehicleId: event.target.value || null });
                  requestAnimationFrame(() => odometerInputRef.current?.focus());
                }}
                value={draft.vehicleId ?? ''}
              >
                {vehicles.length === 0 ? <option value="">No vehicles available</option> : null}
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.fleet_no} {vehicle.plate_no ? `(${vehicle.plate_no})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Odometer (km)</span>
              <div className="odometer-input-wrap">
                <input
                  data-testid="driver-fuel-odometer"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => updateDraft({ odometerKm: event.target.value })}
                  placeholder="Enter current reading"
                  ref={odometerInputRef}
                  required={!draft.odometerFallbackUsed}
                  type="number"
                  value={draft.odometerKm}
                />
                {hasPreviousOdometer ? (
                  <span className="odometer-inline-meta" data-testid="driver-fuel-previous-odometer">
                    {formatPreviousOdometer(previousOdometerKm)}
                  </span>
                ) : null}
              </div>
              {odometerValidationMessage ? (
                <small className="status error" data-testid="driver-fuel-odometer-warning">
                  {odometerValidationMessage}
                </small>
              ) : null}
            </label>
          </div>
          <label className="field">
            <span>Entry date</span>
            <input onChange={(event) => updateDraft({ entryDate: event.target.value })} type="date" value={draft.entryDate} />
          </label>
          <label className="field">
            <span>Liters</span>
            <input
              data-testid="driver-fuel-liters"
              inputMode="decimal"
              min="0.01"
              onChange={(event) => updateDraft({ liters: event.target.value })}
              required
              step="0.01"
              type="number"
              value={draft.liters}
            />
          </label>
          <label className="field">
            <span>Fuel source</span>
            <select
              data-testid="driver-fuel-source-type"
              onChange={(event) => updateDraft({ sourceType: event.target.value as FuelSourceType })}
              value={draft.sourceType}
            >
              <option value="station">station</option>
              <option value="tank">tank</option>
              <option value="card">card</option>
              <option value="approved_source">approved_source</option>
            </select>
          </label>
          {draft.sourceType === 'station' ? (
            <label className="field">
              <span>Fuel station reference</span>
              <input
                data-testid="driver-fuel-station-id"
                onChange={(event) => updateDraft({ fuelStationId: event.target.value })}
                required
                type="text"
                value={draft.fuelStationId}
              />
            </label>
          ) : null}
          {draft.sourceType === 'card' ? (
            <label className="field">
              <span>Fuel card ID</span>
              <input
                data-testid="driver-fuel-card-id"
                onChange={(event) => updateDraft({ fuelCardId: event.target.value })}
                required
                type="text"
                value={draft.fuelCardId}
              />
            </label>
          ) : null}
          {draft.sourceType === 'tank' ? (
            <label className="field">
              <span>Tank ID</span>
              <input
                data-testid="driver-fuel-tank-id"
                onChange={(event) => updateDraft({ tankId: event.target.value })}
                required
                type="text"
                value={draft.tankId}
              />
            </label>
          ) : null}
          {draft.sourceType === 'approved_source' ? (
            <label className="field">
              <span>Approved source context</span>
              <input
                data-testid="driver-fuel-approved-context"
                onChange={(event) => updateDraft({ approvedSourceContext: event.target.value })}
                placeholder="Describe the approved source"
                type="text"
                value={draft.approvedSourceContext}
              />
            </label>
          ) : null}
          <label className="checkbox">
            <input
              checked={draft.odometerFallbackUsed}
              data-testid="driver-fuel-odometer-fallback-toggle"
              onChange={(event) =>
                updateDraft({
                  odometerFallbackUsed: event.target.checked,
                  ...(event.target.checked ? {} : { odometerFallbackReason: '' }),
                })
              }
              type="checkbox"
            />
            <span>Use odometer fallback</span>
          </label>
          {draft.odometerFallbackUsed ? (
            <label className="field">
              <span>Fallback reason</span>
              <input
                data-testid="driver-fuel-odometer-fallback-reason"
                onChange={(event) => updateDraft({ odometerFallbackReason: event.target.value })}
                placeholder="Explain why odometer could not be captured"
                type="text"
                value={draft.odometerFallbackReason}
              />
            </label>
          ) : null}
          <label className="field">
            <span>Receipt image</span>
            <input
              accept="image/png,image/jpeg,image/webp"
              data-testid="driver-fuel-receipt-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void onUploadReceipt(file);
                }
              }}
              type="file"
            />
          </label>
          {uploading ? <p className="status">Uploading receipt...</p> : null}
          {draft.receiptUrl ? <p className="status success">Receipt attached.</p> : null}
          <label className="field">
            <span>Notes</span>
            <input onChange={(event) => updateDraft({ notes: event.target.value })} type="text" value={draft.notes} />
          </label>
          <button
            className="button"
            data-testid="driver-submit-fuel-entry"
            disabled={submitting || odometerRequiredMissing || Boolean(odometerValidationMessage)}
            type="submit"
          >
            {submitting ? 'Submitting...' : 'Submit fuel entry'}
          </button>
          {error ? (
            <p className="status error" data-testid="driver-fuel-error">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="status success" data-testid="driver-fuel-submit-success">
              {success}
            </p>
          ) : null}
        </form>
      </section>
    </DriverShell>
  );
}
