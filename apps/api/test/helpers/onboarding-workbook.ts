import fs from 'node:fs';
import path from 'node:path';

import XLSX from 'xlsx';

type WorkbookFixture = Record<string, Array<Record<string, unknown>>>;

export function workbookBufferFromFixture(fixtureName: string, overrides?: Partial<WorkbookFixture>) {
  const fixturePath = path.resolve(__dirname, '..', 'assets', fixtureName);
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const base = JSON.parse(raw) as WorkbookFixture;
  const sheets = { ...base, ...overrides };

  const workbook = XLSX.utils.book_new();

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.json_to_sheet(rows ?? []);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
