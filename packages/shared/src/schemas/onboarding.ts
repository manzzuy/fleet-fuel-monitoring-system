import { z } from 'zod';

export const onboardingBatchStatusSchema = z.enum(['UPLOADED', 'PREVIEWED', 'COMMITTED', 'FAILED']);

export const onboardingCreateBatchRequestSchema = z.object({
  company_id: z.string().uuid(),
});

export const onboardingBatchSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  status: onboardingBatchStatusSchema,
  created_by: z.string().uuid(),
  created_at: z.string(),
});

export const onboardingIssueSchema = z.object({
  sheet: z.string(),
  row_number: z.number().int().positive().nullable(),
  field: z.string().nullable(),
  message: z.string(),
});

export const onboardingPreviewRowSchema = z.object({
  row_number: z.number().int().positive(),
  data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const onboardingPreviewSheetSchema = z.object({
  rows: z.array(onboardingPreviewRowSchema),
  errors: z.array(onboardingIssueSchema),
  warnings: z.array(onboardingIssueSchema),
});

export const onboardingPreviewSummarySchema = z.object({
  total_rows: z.number().int().nonnegative(),
  errors_count: z.number().int().nonnegative(),
  warnings_count: z.number().int().nonnegative(),
});

export const onboardingPreviewResponseSchema = z.object({
  batch_id: z.string().uuid(),
  company_id: z.string().uuid(),
  status: onboardingBatchStatusSchema,
  summary: onboardingPreviewSummarySchema,
  sheets: z.record(onboardingPreviewSheetSchema),
});

export const onboardingCommitResponseSchema = z.object({
  batch_id: z.string().uuid(),
  status: z.literal('COMMITTED'),
  summary: z.object({
    sites: z.number().int().nonnegative(),
    vehicles: z.number().int().nonnegative(),
    drivers: z.number().int().nonnegative(),
    fuel_cards: z.number().int().nonnegative(),
  }),
});

export const onboardingPreflightResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.object({
    ready: z.boolean(),
    missing_tables: z.array(z.string()),
    message: z.string().optional(),
    hint: z.string().optional(),
  }),
  request_id: z.string(),
});

export type OnboardingCreateBatchRequest = z.infer<typeof onboardingCreateBatchRequestSchema>;
export type OnboardingBatch = z.infer<typeof onboardingBatchSchema>;
export type OnboardingIssue = z.infer<typeof onboardingIssueSchema>;
export type OnboardingPreviewRow = z.infer<typeof onboardingPreviewRowSchema>;
export type OnboardingPreviewSheet = z.infer<typeof onboardingPreviewSheetSchema>;
export type OnboardingPreviewResponse = z.infer<typeof onboardingPreviewResponseSchema>;
export type OnboardingCommitResponse = z.infer<typeof onboardingCommitResponseSchema>;
export type OnboardingPreflightResponse = z.infer<typeof onboardingPreflightResponseSchema>;
