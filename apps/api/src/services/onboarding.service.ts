import type {
  OnboardingBatch,
  OnboardingCommitResponse,
  OnboardingCreateBatchRequest,
  OnboardingPreflightResponse,
  OnboardingPreviewResponse,
} from '@fleet-fuel/shared';
import { Prisma } from '@prisma/client';
import { OnboardingImportBatchStatus } from '@prisma/client';

import { prisma } from '../db/prisma';
import { commitOnboardingPreview } from '../modules/onboarding/commit';
import { buildOnboardingPreview } from '../modules/onboarding/preview';
import { AppError } from '../utils/errors';

const onboardingRequiredTables = [
  'platform_users',
  'tenants',
  'tenant_domains',
  'onboarding_import_batches',
  'sites',
  'users',
  'user_auth',
  'driver_profiles',
  'driver_credentials',
  'supervisor_sites',
  'vehicles',
  'fuel_cards',
  'tanks',
  'equipment',
  'audit_logs',
] as const;

function toBatchRecord(batch: {
  id: string;
  tenantId: string;
  status: OnboardingImportBatchStatus;
  createdBy: string;
  createdAt: Date;
}): OnboardingBatch {
  return {
    id: batch.id,
    company_id: batch.tenantId,
    status: batch.status,
    created_by: batch.createdBy,
    created_at: batch.createdAt.toISOString(),
  };
}

export async function createOnboardingBatch(
  platformUserId: string,
  payload: OnboardingCreateBatchRequest,
): Promise<OnboardingBatch> {
  const company = await prisma.tenant.findUnique({
    where: { id: payload.company_id },
    select: { id: true },
  });

  if (!company) {
    throw new AppError(404, 'company_not_found', 'Company does not exist.');
  }

  const batch = await prisma.onboardingImportBatch.create({
    data: {
      tenantId: company.id,
      status: OnboardingImportBatchStatus.UPLOADED,
      createdBy: platformUserId,
    },
  });

  return toBatchRecord(batch);
}

async function getBatch(batchId: string) {
  const batch = await prisma.onboardingImportBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new AppError(404, 'onboarding_batch_not_found', 'Onboarding batch not found.');
  }

  return batch;
}

export async function setOnboardingBatchUploadPath(batchId: string, filePath: string): Promise<OnboardingBatch> {
  const batch = await getBatch(batchId);

  const updated = await prisma.onboardingImportBatch.update({
    where: { id: batch.id },
    data: {
      sourceFilePath: filePath,
      status: OnboardingImportBatchStatus.UPLOADED,
      previewJson: Prisma.DbNull,
      errorsCount: 0,
      warningsCount: 0,
    },
  });

  return toBatchRecord(updated);
}

export async function previewOnboardingBatch(batchId: string): Promise<OnboardingPreviewResponse> {
  const batch = await getBatch(batchId);

  if (!batch.sourceFilePath) {
    throw new AppError(400, 'onboarding_file_missing', 'Upload a workbook before preview.');
  }

  const preview = await buildOnboardingPreview(batch.tenantId, batch.sourceFilePath);
  const status =
    preview.summary.errors_count > 0 ? OnboardingImportBatchStatus.FAILED : OnboardingImportBatchStatus.PREVIEWED;

  await prisma.onboardingImportBatch.update({
    where: { id: batch.id },
    data: {
      status,
      previewJson: preview as unknown as object,
      errorsCount: preview.summary.errors_count,
      warningsCount: preview.summary.warnings_count,
    },
  });

  const response: OnboardingPreviewResponse = {
    batch_id: batch.id,
    company_id: batch.tenantId,
    status,
    summary: preview.summary,
    sheets: preview.sheets,
  };

  if (preview.summary.errors_count > 0) {
    throw new AppError(
      400,
      'onboarding_validation_failed',
      'Workbook validation failed. Fix the listed errors and upload again.',
      { preview: response },
    );
  }

  return response;
}

export async function commitOnboardingBatch(
  batchId: string,
  platformUserId: string,
): Promise<OnboardingCommitResponse & { temporary_password_policy: string }> {
  const batch = await getBatch(batchId);

  if (!batch.sourceFilePath) {
    throw new AppError(400, 'onboarding_file_missing', 'Upload a workbook before commit.');
  }

  const preview = await buildOnboardingPreview(batch.tenantId, batch.sourceFilePath);

  if (preview.summary.errors_count > 0) {
    throw new AppError(400, 'onboarding_validation_failed', 'Commit is blocked until all preview errors are fixed.', {
      summary: preview.summary,
    });
  }

  const summary = await prisma.$transaction(async (tx) => {
    const result = await commitOnboardingPreview(tx, batch.tenantId, preview);

    await tx.onboardingImportBatch.update({
      where: { id: batch.id },
      data: {
        status: OnboardingImportBatchStatus.COMMITTED,
        previewJson: preview as unknown as object,
        errorsCount: 0,
        warningsCount: preview.summary.warnings_count,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: batch.tenantId,
        actorId: platformUserId,
        actorType: 'PLATFORM',
        eventType: 'ONBOARDING_BATCH_COMMITTED',
        metadata: {
          batch_id: batch.id,
          summary: result,
          temporary_password_policy: preview.initialPasswordPolicyWarning,
        },
      },
    });

    return result;
  });

  return {
    batch_id: batch.id,
    status: 'COMMITTED',
    summary: {
      sites: summary.sites,
      vehicles: summary.vehicles,
      drivers: summary.drivers,
      fuel_cards: summary.fuel_cards,
    },
    temporary_password_policy: preview.initialPasswordPolicyWarning,
  };
}

export async function onboardingDbPreflight(): Promise<Omit<OnboardingPreflightResponse, 'request_id'>> {
  try {
    const existing = await prisma.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(onboardingRequiredTables)})
    `);

    const present = new Set(existing.map((row) => row.table_name));
    const missingTables = onboardingRequiredTables.filter((table) => !present.has(table));

    if (missingTables.length > 0) {
      return {
        status: 'ok',
        db: {
          ready: false,
          missing_tables: [...missingTables],
          message: 'Database is not migrated for onboarding.',
          hint: 'Run: cd apps/api && pnpm prisma migrate deploy',
        },
      };
    }

    return {
      status: 'ok',
      db: {
        ready: true,
        missing_tables: [],
      },
    };
  } catch {
    return {
      status: 'ok',
      db: {
        ready: false,
        missing_tables: [...onboardingRequiredTables],
        message: 'Database is not reachable or not migrated for onboarding.',
        hint: 'Run: cd apps/api && pnpm prisma migrate deploy',
      },
    };
  }
}
