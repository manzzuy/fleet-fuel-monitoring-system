export interface OdometerVehicleOption {
  id: string;
  previous_odometer_km?: number | null;
}

export function getPreviousOdometerKm(
  vehicles: OdometerVehicleOption[],
  vehicleId: string | null | undefined,
): number | null {
  if (!vehicleId) {
    return null;
  }
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  return vehicle?.previous_odometer_km ?? null;
}

export function getOdometerInputPlaceholder(previousOdometerKm: number | null): string {
  if (previousOdometerKm === null) {
    return 'Enter current reading';
  }
  return previousOdometerKm.toLocaleString();
}

export function validateOdometerAgainstPrevious(
  odometerKmInput: string,
  previousOdometerKm: number | null,
): string | null {
  const trimmed = odometerKmInput.trim();
  if (!trimmed) {
    return 'Odometer is required before submit.';
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 'Enter a valid odometer value.';
  }
  if (previousOdometerKm !== null && parsed < previousOdometerKm) {
    return 'Odometer is lower than previous reading.';
  }
  return null;
}
