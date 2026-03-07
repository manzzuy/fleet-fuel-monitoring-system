import fs from 'node:fs';

import type { OnboardingIssue } from '@fleet-fuel/shared';
import XLSX from 'xlsx';

import type { OnboardingSheetName, ParsedSheetRow, ParsedWorkbook } from './types';
import { onboardingSheetNames, requiredSheetNames } from './types';

const headerAliasMap: Record<OnboardingSheetName, Record<string, string>> = {
  Sites: {
    sitecode: 'Site_Code',
    sitename: 'Site_Name',
    location: 'Location',
  },
  Drivers: {
    employeeno: 'Employee_No',
    fullname: 'Full_Name',
    email: 'Email',
    phone: 'Phone',
    role: 'Role',
    sitecode: 'Site_Code',
    drivinglicenseno: 'Driving_License_No',
    drivinglicenseexpiry: 'Driving_License_Expiry',
    opalno: 'OPAL_No',
    opalexpiry: 'OPAL_Expiry',
  },
  Vehicles_Cards: {
    sitecode: 'Site_Code',
    fleetno: 'Fleet_No',
    plateno: 'Plate_No',
    vehicletype: 'Vehicle_Type',
    tankcapacityl: 'Tank_Capacity_L',
    cardnumber: 'Card_Number',
    cardtype: 'Card_Type',
    cardstatus: 'Card_Status',
  },
  Driver_Compliance: {
    employeeno: 'Employee_No',
    credentialtype: 'Credential_Type',
    credentialnumber: 'Credential_Number',
    expirydate: 'Expiry_Date',
  },
  Supervisor_Sites: {
    supervisoremployeeno: 'Supervisor_Employee_No',
    sitecode: 'Site_Code',
  },
  Tanks: {
    sitecode: 'Site_Code',
    tankname: 'Tank_Name',
    capacityl: 'Capacity_L',
    reorderlevell: 'Reorder_Level_L',
  },
  Equipment: {
    equipmentcode: 'Equipment_Code',
    equipmentname: 'Equipment_Name',
    sitecode: 'Site_Code',
  },
};

const requiredColumns: Record<OnboardingSheetName, string[]> = {
  Sites: ['Site_Code', 'Site_Name'],
  Drivers: ['Employee_No', 'Full_Name', 'Role'],
  Vehicles_Cards: ['Fleet_No'],
  Driver_Compliance: ['Employee_No', 'Credential_Type'],
  Supervisor_Sites: ['Supervisor_Employee_No', 'Site_Code'],
  Tanks: ['Site_Code', 'Tank_Name', 'Capacity_L', 'Reorder_Level_L'],
  Equipment: ['Equipment_Code', 'Equipment_Name'],
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, '');
}

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: OnboardingSheetName): ParsedSheetRow[] {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return [];
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  const aliasMap = headerAliasMap[sheetName];

  return rawRows.map((row, index) => {
    const normalized: Record<string, string | number | boolean | null> = {};

    for (const [rawHeader, rawValue] of Object.entries(row)) {
      const canonical = aliasMap[normalizeHeader(rawHeader)];
      if (!canonical) {
        continue;
      }
      normalized[canonical] = normalizeCell(rawValue);
    }

    return {
      rowNumber: index + 2,
      data: normalized,
    };
  });
}

export function parseOnboardingWorkbook(filePath: string): ParsedWorkbook {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook does not exist: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true });

  const parsed = {} as ParsedWorkbook;
  for (const sheet of onboardingSheetNames) {
    parsed[sheet] = parseSheet(workbook, sheet);
  }

  return parsed;
}

export function validateWorkbookStructure(parsed: ParsedWorkbook): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];

  for (const sheet of requiredSheetNames) {
    if (parsed[sheet].length === 0) {
      issues.push({
        sheet,
        row_number: null,
        field: null,
        message: `${sheet} sheet is required and must contain at least one data row.`,
      });
      continue;
    }
  }

  for (const sheet of onboardingSheetNames) {
    const first = parsed[sheet][0];
    if (!first) {
      continue;
    }

    const present = new Set(Object.keys(first.data));
    for (const column of requiredColumns[sheet]) {
      if (!present.has(column)) {
        issues.push({
          sheet,
          row_number: null,
          field: column,
          message: `${sheet} is missing required column ${column}.`,
        });
      }
    }
  }

  return issues;
}

export function parseExcelDate(value: string | number | Date | null): Date | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) {
      return null;
    }
    return new Date(Date.UTC(date.y, date.m - 1, date.d));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
