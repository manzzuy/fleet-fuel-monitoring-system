import { Router } from 'express';
import fs from 'node:fs/promises';
import multer from 'multer';
import { z } from 'zod';

import { createTenantRequestSchema, onboardingCreateBatchRequestSchema } from '@fleet-fuel/shared';

import {
  assertXlsxFilename,
  buildOnboardingWorkbookPath,
  ensureOnboardingStorageDir,
} from '../modules/onboarding/storage';
import { platformAuthMiddleware } from '../middleware/platform-auth';
import {
  commitOnboardingBatch,
  createOnboardingBatch,
  onboardingDbPreflight,
  previewOnboardingBatch,
  setOnboardingBatchUploadPath,
} from '../services/onboarding.service';
import { createTenant, listTenants } from '../services/platform-tenant.service';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/http';

export const platformRouter = Router();
const paramsSchema = z.object({ id: z.string().uuid() });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

platformRouter.use(platformAuthMiddleware);

platformRouter.get(
  '/tenants',
  asyncHandler(async (_req, res) => {
    const tenants = await listTenants();
    res.json({ items: tenants });
  }),
);

platformRouter.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    const payload = createTenantRequestSchema.parse(req.body);
    const tenant = await createTenant(payload);
    res.status(201).json(tenant);
  }),
);

platformRouter.get(
  '/onboarding/preflight',
  asyncHandler(async (req, res) => {
    const preflight = await onboardingDbPreflight();
    res.json({
      ...preflight,
      request_id: req.requestId,
    });
  }),
);

platformRouter.post(
  '/onboarding/batches',
  asyncHandler(async (req, res) => {
    const payload = onboardingCreateBatchRequestSchema.parse(req.body);
    const batch = await createOnboardingBatch(req.auth!.sub, payload);
    res.status(201).json(batch);
  }),
);

platformRouter.post(
  '/onboarding/batches/:id/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params);

    if (!req.file) {
      throw new AppError(400, 'file_required', 'Upload a workbook using multipart field "file".');
    }

    assertXlsxFilename(req.file.originalname);

    ensureOnboardingStorageDir();
    const filePath = buildOnboardingWorkbookPath(id);
    await fs.writeFile(filePath, req.file.buffer);

    const batch = await setOnboardingBatchUploadPath(id, filePath);
    res.json(batch);
  }),
);

platformRouter.get(
  '/onboarding/batches/:id/preview',
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params);
    try {
      const preview = await previewOnboardingBatch(id);
      res.json(preview);
    } catch (error) {
      if (error instanceof AppError && error.code === 'onboarding_validation_failed') {
        res.status(error.statusCode).json({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
          request_id: req.requestId,
        });
        return;
      }

      throw error;
    }
  }),
);

platformRouter.post(
  '/onboarding/batches/:id/commit',
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params);
    const result = await commitOnboardingBatch(id, req.auth!.sub);
    res.json(result);
  }),
);
