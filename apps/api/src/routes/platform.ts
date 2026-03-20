import { Router } from 'express';
import fs from 'node:fs/promises';
import multer from 'multer';
import { z } from 'zod';

import {
  createTenantRequestSchema,
  onboardingCreateBatchRequestSchema,
  type PlatformSupportUserUpdateRequest,
} from '@fleet-fuel/shared';

import {
  assertXlsxFilename,
  buildOnboardingWorkbookPath,
  ensureOnboardingStorageDir,
} from '../modules/onboarding/storage';
import { platformAuthMiddleware } from '../middleware/platform-auth';
import { platformSupportModeMiddleware } from '../middleware/platform-auth';
import {
  commitOnboardingBatch,
  createOnboardingBatch,
  onboardingDbPreflight,
  previewOnboardingBatch,
  setOnboardingBatchUploadPath,
} from '../services/onboarding.service';
import { createTenant, listTenants } from '../services/platform-tenant.service';
import {
  enterPlatformSupportMode,
  listSupportTenantUsers,
  resetSupportTenantUserAccount,
  updateSupportTenantUser,
} from '../services/platform-support.service';
import { askOperatorAssistant } from '../services/operator-assistant.service';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/http';

export const platformRouter = Router();
const paramsSchema = z.object({ id: z.string().uuid() });
const operatorAssistantRequestSchema = z.object({
  question: z.string().trim().min(8).max(1000),
  tenant_subdomain: z.string().trim().min(1).max(120).optional(),
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});
const supportTenantParamsSchema = z.object({
  tenantId: z.string().uuid(),
});
const supportUserParamsSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});
const operationalUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9._-]+$/, 'Username must use lowercase letters, numbers, dot, underscore, or hyphen only.');
const supportUserUpdateSchema = z.object({
  role: z
    .enum([
      'TENANT_ADMIN',
      'COMPANY_ADMIN',
      'SUPERVISOR',
      'SITE_SUPERVISOR',
      'SAFETY_OFFICER',
      'TRANSPORT_MANAGER',
      'HEAD_OFFICE_ADMIN',
      'DRIVER',
    ])
    .optional(),
  full_name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional().nullable(),
  username: operationalUsernameSchema.optional().nullable(),
  employee_no: z.string().trim().min(1).optional().nullable(),
  is_active: z.boolean().optional(),
  site_id: z.string().uuid().optional().nullable(),
  site_ids: z.array(z.string().uuid()).optional(),
  assigned_vehicle_id: z.string().uuid().optional().nullable(),
});
const supportUserResetSchema = z.object({
  password: z.string().min(10),
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
  '/operator/assist',
  asyncHandler(async (req, res) => {
    const payload = operatorAssistantRequestSchema.parse(req.body);
    const response = await askOperatorAssistant(
      {
        question: payload.question,
        ...(payload.tenant_subdomain ? { tenant_subdomain: payload.tenant_subdomain } : {}),
      },
      req.requestId,
    );
    res.json(response);
  }),
);

platformRouter.post(
  '/support-mode/enter',
  asyncHandler(async (req, res) => {
    const response = await enterPlatformSupportMode(req.auth!.sub, req.requestId);
    res.json(response);
  }),
);

platformRouter.get(
  '/support/tenants/:tenantId/users',
  platformSupportModeMiddleware,
  asyncHandler(async (req, res) => {
    const { tenantId } = supportTenantParamsSchema.parse(req.params);
    const items = await listSupportTenantUsers(tenantId);
    res.json({
      tenant_id: tenantId,
      items,
    });
  }),
);

platformRouter.patch(
  '/support/tenants/:tenantId/users/:userId',
  platformSupportModeMiddleware,
  asyncHandler(async (req, res) => {
    const { tenantId, userId } = supportUserParamsSchema.parse(req.params);
    const rawPayload = supportUserUpdateSchema.parse(req.body);
    const payload = Object.fromEntries(
      Object.entries(rawPayload).filter(([, value]) => value !== undefined),
    ) as PlatformSupportUserUpdateRequest;
    const item = await updateSupportTenantUser({
      tenantId,
      userId,
      platformUserId: req.auth!.sub,
      payload,
    });
    res.json({
      item,
    });
  }),
);

platformRouter.post(
  '/support/tenants/:tenantId/users/:userId/reset-account',
  platformSupportModeMiddleware,
  asyncHandler(async (req, res) => {
    const { tenantId, userId } = supportUserParamsSchema.parse(req.params);
    const payload = supportUserResetSchema.parse(req.body);
    const result = await resetSupportTenantUserAccount({
      tenantId,
      userId,
      platformUserId: req.auth!.sub,
      password: payload.password,
    });
    res.json(result);
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
