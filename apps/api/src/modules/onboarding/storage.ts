import fs from 'node:fs';
import path from 'node:path';

import { AppError } from '../../utils/errors';

function resolveStorageDir(): string {
  if (process.env.ONBOARDING_STORAGE_DIR) {
    return process.env.ONBOARDING_STORAGE_DIR;
  }

  const cwd = process.cwd();
  const direct = path.resolve(cwd, 'storage', 'onboarding');
  const monorepo = path.resolve(cwd, 'apps', 'api', 'storage', 'onboarding');

  if (fs.existsSync(direct)) {
    return direct;
  }

  if (fs.existsSync(monorepo)) {
    return monorepo;
  }

  return direct;
}

export function ensureOnboardingStorageDir(): string {
  const dir = resolveStorageDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildOnboardingWorkbookPath(batchId: string): string {
  return path.join(ensureOnboardingStorageDir(), `${batchId}.xlsx`);
}

export function assertXlsxFilename(filename: string) {
  if (!filename.toLowerCase().endsWith('.xlsx')) {
    throw new AppError(400, 'invalid_file_type', 'Only .xlsx files are accepted.');
  }
}
