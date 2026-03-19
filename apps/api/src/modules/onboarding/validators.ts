import type { OnboardingIssue } from '@fleet-fuel/shared';

import { prisma } from '../../db/prisma';
import { parseExcelDate } from './parser';
import type {
  OnboardingSheetName,
  OnboardingValidationResult,
  ParsedSheetRow,
  ParsedWorkbook,
} from './types';
import { onboardingSheetNames } from './types';

function asText(value: string | number | boolean | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asLower(value: string | number | boolean | null): string | null {
  const text = asText(value);
  return text ? text.toLowerCase() : null;
}

function asNumber(value: string | number | boolean | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function addIssue(
  errors: Record<OnboardingSheetName, OnboardingIssue[]>,
  sheet: OnboardingSheetName,
  rowNumber: number | null,
  field: string | null,
  message: string,
) {
  errors[sheet].push({
    sheet,
    row_number: rowNumber,
    field,
    message,
  });
}

function addWarning(
  warnings: Record<OnboardingSheetName, OnboardingIssue[]>,
  sheet: OnboardingSheetName,
  rowNumber: number | null,
  field: string | null,
  message: string,
) {
  warnings[sheet].push({
    sheet,
    row_number: rowNumber,
    field,
    message,
  });
}

function required(
  errors: Record<OnboardingSheetName, OnboardingIssue[]>,
  sheet: OnboardingSheetName,
  row: ParsedSheetRow,
  field: string,
): string | null {
  const value = asText(row.data[field] ?? null);
  if (!value) {
    addIssue(errors, sheet, row.rowNumber, field, `${field} is required.`);
    return null;
  }
  return value;
}

function duplicateCheck(
  rows: Array<{ rowNumber: number; value: string | null }>,
  sheet: OnboardingSheetName,
  field: string,
  errors: Record<OnboardingSheetName, OnboardingIssue[]>,
) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.value) {
      continue;
    }
    if (seen.has(row.value)) {
      addIssue(errors, sheet, row.rowNumber, field, `${field} must be unique within workbook.`);
      continue;
    }
    seen.add(row.value);
  }
}

export async function validateWorkbookRows(
  companyId: string,
  workbook: ParsedWorkbook,
): Promise<OnboardingValidationResult> {
  const errors: Record<OnboardingSheetName, OnboardingIssue[]> = {
    Sites: [],
    Drivers: [],
    Vehicles_Cards: [],
    Driver_Compliance: [],
    Supervisor_Sites: [],
    Tanks: [],
    Equipment: [],
  };
  const warnings: Record<OnboardingSheetName, OnboardingIssue[]> = {
    Sites: [],
    Drivers: [],
    Vehicles_Cards: [],
    Driver_Compliance: [],
    Supervisor_Sites: [],
    Tanks: [],
    Equipment: [],
  };

  const sites = workbook.Sites.map((row) => ({
    rowNumber: row.rowNumber,
    siteCode: asLower(required(errors, 'Sites', row, 'Site_Code')),
    siteName: required(errors, 'Sites', row, 'Site_Name'),
    location: asText(row.data.Location ?? null),
  }));

  const drivers = workbook.Drivers.map((row) => {
    const roleRaw = asText(row.data.Role ?? null)?.toUpperCase() ?? null;
    const role =
      roleRaw === 'DRIVER' || roleRaw === 'SITE_SUPERVISOR' || roleRaw === 'SAFETY_OFFICER' ? roleRaw : null;
    if (!role) {
      addIssue(errors, 'Drivers', row.rowNumber, 'Role', 'Role must be DRIVER, SITE_SUPERVISOR, or SAFETY_OFFICER.');
    }

    const licenseExpiry = parseExcelDate((row.data.Driving_License_Expiry as string | number | Date | null) ?? null);
    if (row.data.Driving_License_Expiry && !licenseExpiry) {
      addIssue(errors, 'Drivers', row.rowNumber, 'Driving_License_Expiry', 'Invalid date.');
    }

    const opalExpiry = parseExcelDate((row.data.OPAL_Expiry as string | number | Date | null) ?? null);
    if (row.data.OPAL_Expiry && !opalExpiry) {
      addIssue(errors, 'Drivers', row.rowNumber, 'OPAL_Expiry', 'Invalid date.');
    }

    addWarning(
      warnings,
      'Drivers',
      row.rowNumber,
      'Password',
      'Initial password will be set to Employee_No + "!Temp". Force password change is enabled.',
    );

    return {
      rowNumber: row.rowNumber,
      employeeNo: asLower(required(errors, 'Drivers', row, 'Employee_No')),
      fullName: required(errors, 'Drivers', row, 'Full_Name'),
      email: asText(row.data.Email ?? null)?.toLowerCase() ?? null,
      phone: asText(row.data.Phone ?? null),
      role: role as 'DRIVER' | 'SITE_SUPERVISOR' | 'SAFETY_OFFICER' | null,
      siteCode: asLower(row.data.Site_Code ?? null),
      drivingLicenseNo: asText(row.data.Driving_License_No ?? null),
      drivingLicenseExpiry: licenseExpiry,
      opalNo: asText(row.data.OPAL_No ?? null),
      opalExpiry,
    };
  });

  const vehicleCards = workbook.Vehicles_Cards.map((row) => {
    const capacity = asNumber(row.data.Tank_Capacity_L ?? null);
    if (row.data.Tank_Capacity_L && capacity === null) {
      addIssue(errors, 'Vehicles_Cards', row.rowNumber, 'Tank_Capacity_L', 'Must be a number.');
    }

    return {
      rowNumber: row.rowNumber,
      siteCode: asLower(row.data.Site_Code ?? null),
      fleetNo: asLower(required(errors, 'Vehicles_Cards', row, 'Fleet_No')),
      plateNo: asLower(row.data.Plate_No ?? null),
      vehicleType: asText(row.data.Vehicle_Type ?? null),
      tankCapacityL: capacity,
      cardNumber: asLower(row.data.Card_Number ?? null),
      cardType: asText(row.data.Card_Type ?? null),
      cardStatus: asText(row.data.Card_Status ?? null)?.toUpperCase() ?? 'ACTIVE',
    };
  });

  const driverCompliance = workbook.Driver_Compliance.map((row) => {
    const expiry = parseExcelDate((row.data.Expiry_Date as string | number | Date | null) ?? null);
    if (row.data.Expiry_Date && !expiry) {
      addIssue(errors, 'Driver_Compliance', row.rowNumber, 'Expiry_Date', 'Invalid date.');
    }

    return {
      rowNumber: row.rowNumber,
      employeeNo: asLower(required(errors, 'Driver_Compliance', row, 'Employee_No')),
      credentialType: asText(required(errors, 'Driver_Compliance', row, 'Credential_Type'))?.toUpperCase() ?? null,
      credentialNumber: asText(row.data.Credential_Number ?? null),
      expiryDate: expiry,
    };
  });

  const supervisorSites = workbook.Supervisor_Sites.map((row) => ({
    rowNumber: row.rowNumber,
    supervisorEmployeeNo: asLower(required(errors, 'Supervisor_Sites', row, 'Supervisor_Employee_No')),
    siteCode: asLower(required(errors, 'Supervisor_Sites', row, 'Site_Code')),
  }));

  const tanks = workbook.Tanks.map((row) => {
    const capacity = asNumber(row.data.Capacity_L ?? null);
    const reorder = asNumber(row.data.Reorder_Level_L ?? null);

    if (capacity === null) {
      addIssue(errors, 'Tanks', row.rowNumber, 'Capacity_L', 'Capacity_L must be a number.');
    }
    if (reorder === null) {
      addIssue(errors, 'Tanks', row.rowNumber, 'Reorder_Level_L', 'Reorder_Level_L must be a number.');
    }
    if (capacity !== null && reorder !== null && reorder > capacity) {
      addIssue(errors, 'Tanks', row.rowNumber, 'Reorder_Level_L', 'Reorder_Level_L must be <= Capacity_L.');
    }

    return {
      rowNumber: row.rowNumber,
      siteCode: asLower(required(errors, 'Tanks', row, 'Site_Code')),
      tankName: asText(required(errors, 'Tanks', row, 'Tank_Name')),
      capacityL: capacity,
      reorderLevelL: reorder,
    };
  });

  const equipment = workbook.Equipment.map((row) => ({
    rowNumber: row.rowNumber,
    equipmentCode: asLower(required(errors, 'Equipment', row, 'Equipment_Code')),
    equipmentName: asText(required(errors, 'Equipment', row, 'Equipment_Name')),
    siteCode: asLower(row.data.Site_Code ?? null),
  }));

  duplicateCheck(
    sites.map((r) => ({ rowNumber: r.rowNumber, value: r.siteCode })),
    'Sites',
    'Site_Code',
    errors,
  );
  duplicateCheck(
    drivers.map((r) => ({ rowNumber: r.rowNumber, value: r.employeeNo })),
    'Drivers',
    'Employee_No',
    errors,
  );
  duplicateCheck(
    vehicleCards.map((r) => ({ rowNumber: r.rowNumber, value: r.fleetNo })),
    'Vehicles_Cards',
    'Fleet_No',
    errors,
  );
  duplicateCheck(
    vehicleCards.map((r) => ({ rowNumber: r.rowNumber, value: r.plateNo })),
    'Vehicles_Cards',
    'Plate_No',
    errors,
  );
  duplicateCheck(
    vehicleCards.map((r) => ({ rowNumber: r.rowNumber, value: r.cardNumber })),
    'Vehicles_Cards',
    'Card_Number',
    errors,
  );
  duplicateCheck(
    equipment.map((r) => ({ rowNumber: r.rowNumber, value: r.equipmentCode })),
    'Equipment',
    'Equipment_Code',
    errors,
  );

  const [dbSites, dbUsers, dbVehicles, dbCards, dbSupervisors] = await Promise.all([
    prisma.site.findMany({
      where: { tenantId: companyId },
      select: { siteCode: true },
    }),
    prisma.user.findMany({
      where: { tenantId: companyId },
      select: { employeeNo: true, role: true, username: true },
    }),
    prisma.vehicle.findMany({
      where: { tenantId: companyId },
      select: { fleetNumber: true, plateNumber: true },
    }),
    prisma.fuelCard.findMany({
      where: { tenantId: companyId },
      select: { cardNumber: true },
    }),
    prisma.user.findMany({
      where: { tenantId: companyId, role: 'SITE_SUPERVISOR' },
      select: { employeeNo: true },
    }),
  ]);

  const siteCodes = new Set([
    ...sites.map((r) => r.siteCode).filter(Boolean),
    ...dbSites.map((r) => r.siteCode.toLowerCase()),
  ]);
  const employeeNos = new Set([
    ...drivers.map((r) => r.employeeNo).filter(Boolean),
    ...dbUsers.map((r) => r.employeeNo?.toLowerCase()).filter(Boolean),
  ]);
  const supervisorEmployeeNos = new Set([
    ...drivers.filter((r) => r.role === 'SITE_SUPERVISOR').map((r) => r.employeeNo).filter(Boolean),
    ...dbSupervisors.map((r) => r.employeeNo?.toLowerCase()).filter(Boolean),
  ]);
  const fleetNos = new Set([
    ...vehicleCards.map((r) => r.fleetNo).filter(Boolean),
    ...dbVehicles.map((r) => r.fleetNumber.toLowerCase()),
  ]);

  const dbFleetNos = new Set(dbVehicles.map((r) => r.fleetNumber.toLowerCase()));
  const dbPlateNos = new Set(dbVehicles.map((r) => r.plateNumber?.toLowerCase()).filter(Boolean));
  const dbCardNos = new Set(dbCards.map((r) => r.cardNumber.toLowerCase()));

  for (const row of sites) {
    if (row.siteCode && dbSites.some((s) => s.siteCode.toLowerCase() === row.siteCode)) {
      addIssue(errors, 'Sites', row.rowNumber, 'Site_Code', 'Site_Code already exists in company.');
    }
  }

  for (const row of drivers) {
    if (row.siteCode && !siteCodes.has(row.siteCode)) {
      addIssue(errors, 'Drivers', row.rowNumber, 'Site_Code', `Unknown Site_Code ${row.siteCode}.`);
    }
    if (row.employeeNo && dbUsers.some((u) => u.employeeNo?.toLowerCase() === row.employeeNo)) {
      addIssue(errors, 'Drivers', row.rowNumber, 'Employee_No', 'Employee_No already exists in company.');
    }
  }

  for (const row of vehicleCards) {
    if (row.siteCode && !siteCodes.has(row.siteCode)) {
      addIssue(errors, 'Vehicles_Cards', row.rowNumber, 'Site_Code', `Unknown Site_Code ${row.siteCode}.`);
    }
    if (row.fleetNo && dbFleetNos.has(row.fleetNo)) {
      addIssue(errors, 'Vehicles_Cards', row.rowNumber, 'Fleet_No', 'Fleet_No already exists in company.');
    }
    if (row.plateNo && dbPlateNos.has(row.plateNo)) {
      addIssue(errors, 'Vehicles_Cards', row.rowNumber, 'Plate_No', 'Plate_No already exists in company.');
    }
    if (row.cardNumber && dbCardNos.has(row.cardNumber)) {
      addIssue(errors, 'Vehicles_Cards', row.rowNumber, 'Card_Number', 'Card_Number already exists in company.');
    }
  }

  for (const row of driverCompliance) {
    if (row.employeeNo && !employeeNos.has(row.employeeNo)) {
      addIssue(errors, 'Driver_Compliance', row.rowNumber, 'Employee_No', 'Employee_No not found.');
    }
  }

  for (const row of supervisorSites) {
    if (row.siteCode && !siteCodes.has(row.siteCode)) {
      addIssue(errors, 'Supervisor_Sites', row.rowNumber, 'Site_Code', `Unknown Site_Code ${row.siteCode}.`);
    }
    if (row.supervisorEmployeeNo && !supervisorEmployeeNos.has(row.supervisorEmployeeNo)) {
      addIssue(
        errors,
        'Supervisor_Sites',
        row.rowNumber,
        'Supervisor_Employee_No',
        'Supervisor employee must exist and have role SITE_SUPERVISOR.',
      );
    }
  }

  for (const row of tanks) {
    if (row.siteCode && !siteCodes.has(row.siteCode)) {
      addIssue(errors, 'Tanks', row.rowNumber, 'Site_Code', `Unknown Site_Code ${row.siteCode}.`);
    }
  }

  for (const row of equipment) {
    if (row.siteCode && !siteCodes.has(row.siteCode)) {
      addIssue(errors, 'Equipment', row.rowNumber, 'Site_Code', `Unknown Site_Code ${row.siteCode}.`);
    }
  }

  const sheetPreview = {} as OnboardingValidationResult['sheets'];
  for (const sheet of onboardingSheetNames) {
    sheetPreview[sheet] = {
      rows: workbook[sheet].map((r) => ({ row_number: r.rowNumber, data: r.data })),
      errors: errors[sheet],
      warnings: warnings[sheet],
    };
  }

  const totalRows = onboardingSheetNames.reduce((acc, sheet) => acc + workbook[sheet].length, 0);
  const errorsCount = onboardingSheetNames.reduce((acc, sheet) => acc + errors[sheet].length, 0);
  const warningsCount = onboardingSheetNames.reduce((acc, sheet) => acc + warnings[sheet].length, 0);

  return {
    normalized: {
      Sites: sites
        .filter((row) => row.siteCode && row.siteName)
        .map((row) => ({
          rowNumber: row.rowNumber,
          siteCode: row.siteCode!,
          siteName: row.siteName!,
          location: row.location,
        })),
      Drivers: drivers
        .filter((row) => row.employeeNo && row.fullName && row.role)
        .map((row) => ({
          rowNumber: row.rowNumber,
          employeeNo: row.employeeNo!,
          fullName: row.fullName!,
          email: row.email,
          phone: row.phone,
          role: row.role!,
          siteCode: row.siteCode,
          drivingLicenseNo: row.drivingLicenseNo,
          drivingLicenseExpiry: row.drivingLicenseExpiry,
          opalNo: row.opalNo,
          opalExpiry: row.opalExpiry,
        })),
      Vehicles_Cards: vehicleCards
        .filter((row) => row.fleetNo)
        .map((row) => ({
          rowNumber: row.rowNumber,
          siteCode: row.siteCode,
          fleetNo: row.fleetNo!,
          plateNo: row.plateNo,
          vehicleType: row.vehicleType,
          tankCapacityL: row.tankCapacityL,
          cardNumber: row.cardNumber,
          cardType: row.cardType,
          cardStatus: row.cardStatus,
        })),
      Driver_Compliance: driverCompliance
        .filter((row) => row.employeeNo && row.credentialType)
        .map((row) => ({
          rowNumber: row.rowNumber,
          employeeNo: row.employeeNo!,
          credentialType: row.credentialType!,
          credentialNumber: row.credentialNumber,
          expiryDate: row.expiryDate,
        })),
      Supervisor_Sites: supervisorSites
        .filter((row) => row.supervisorEmployeeNo && row.siteCode)
        .map((row) => ({
          rowNumber: row.rowNumber,
          supervisorEmployeeNo: row.supervisorEmployeeNo!,
          siteCode: row.siteCode!,
        })),
      Tanks: tanks
        .filter((row) => row.siteCode && row.tankName && row.capacityL !== null && row.reorderLevelL !== null)
        .map((row) => ({
          rowNumber: row.rowNumber,
          siteCode: row.siteCode!,
          tankName: row.tankName!,
          capacityL: row.capacityL!,
          reorderLevelL: row.reorderLevelL!,
        })),
      Equipment: equipment
        .filter((row) => row.equipmentCode && row.equipmentName)
        .map((row) => ({
          rowNumber: row.rowNumber,
          equipmentCode: row.equipmentCode!,
          equipmentName: row.equipmentName!,
          siteCode: row.siteCode,
        })),
    },
    sheets: sheetPreview,
    summary: {
      total_rows: totalRows,
      errors_count: errorsCount,
      warnings_count: warningsCount,
    },
    initialPasswordPolicyWarning:
      'Driver and site supervisor accounts imported from workbook receive temporary password Employee_No + "!Temp" and force_password_change=true.',
  };
}
