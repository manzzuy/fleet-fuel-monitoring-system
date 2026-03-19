import type { OnboardingIssue } from '@fleet-fuel/shared';

export const requiredSheetNames = ['Sites', 'Drivers', 'Vehicles_Cards'] as const;
export const optionalSheetNames = ['Driver_Compliance', 'Supervisor_Sites', 'Tanks', 'Equipment'] as const;
export const ignoredSheetNames = ['Examples'] as const;
export const onboardingSheetNames = [...requiredSheetNames, ...optionalSheetNames] as const;

export type OnboardingSheetName = (typeof onboardingSheetNames)[number];

export interface ParsedSheetRow {
  rowNumber: number;
  data: Record<string, string | number | boolean | null>;
}

export type ParsedWorkbook = Record<OnboardingSheetName, ParsedSheetRow[]>;

export interface NormalizedSiteRow {
  rowNumber: number;
  siteCode: string;
  siteName: string;
  location: string | null;
}

export interface NormalizedDriverRow {
  rowNumber: number;
  employeeNo: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: 'DRIVER' | 'SITE_SUPERVISOR' | 'SAFETY_OFFICER';
  siteCode: string | null;
  drivingLicenseNo: string | null;
  drivingLicenseExpiry: Date | null;
  opalNo: string | null;
  opalExpiry: Date | null;
}

export interface NormalizedVehicleCardRow {
  rowNumber: number;
  siteCode: string | null;
  fleetNo: string;
  plateNo: string | null;
  vehicleType: string | null;
  tankCapacityL: number | null;
  cardNumber: string | null;
  cardType: string | null;
  cardStatus: string;
}

export interface NormalizedDriverComplianceRow {
  rowNumber: number;
  employeeNo: string;
  credentialType: string;
  credentialNumber: string | null;
  expiryDate: Date | null;
}

export interface NormalizedSupervisorSiteRow {
  rowNumber: number;
  supervisorEmployeeNo: string;
  siteCode: string;
}

export interface NormalizedTankRow {
  rowNumber: number;
  siteCode: string;
  tankName: string;
  capacityL: number;
  reorderLevelL: number;
}

export interface NormalizedEquipmentRow {
  rowNumber: number;
  equipmentCode: string;
  equipmentName: string;
  siteCode: string | null;
}

export interface OnboardingValidationData {
  Sites: NormalizedSiteRow[];
  Drivers: NormalizedDriverRow[];
  Vehicles_Cards: NormalizedVehicleCardRow[];
  Driver_Compliance: NormalizedDriverComplianceRow[];
  Supervisor_Sites: NormalizedSupervisorSiteRow[];
  Tanks: NormalizedTankRow[];
  Equipment: NormalizedEquipmentRow[];
}

export interface OnboardingPreviewSheet {
  rows: Array<{ row_number: number; data: Record<string, string | number | boolean | null> }>;
  errors: OnboardingIssue[];
  warnings: OnboardingIssue[];
}

export interface OnboardingValidationResult {
  normalized: OnboardingValidationData;
  sheets: Record<OnboardingSheetName, OnboardingPreviewSheet>;
  summary: {
    total_rows: number;
    errors_count: number;
    warnings_count: number;
  };
  initialPasswordPolicyWarning: string;
}
