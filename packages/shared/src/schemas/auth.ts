import { z } from 'zod';

const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9-]+$/, 'Subdomain must contain only lowercase letters, numbers, and hyphens.');

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9._-]+$/, 'Username must contain only lowercase letters, numbers, dots, underscores, and hyphens.');

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long.')
  .refine(
    (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
    'Password must include uppercase, lowercase, and numeric characters.',
  );

const optionalEmailSchema = z.string().trim().email().toLowerCase().optional();

export const tenantLoginRequestSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export const platformLoginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export const platformLoginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.string(),
  tenant_id: z.null(),
  role: z.literal('PLATFORM_OWNER'),
  actor_type: z.literal('PLATFORM'),
});

export const createTenantRequestSchema = z.object({
  tenantName: z.string().trim().min(2).max(120),
  subdomain: subdomainSchema,
  createInitialAdmin: z.boolean().default(false),
  initialAdmin: z
    .object({
      email: optionalEmailSchema,
      username: usernameSchema,
      password: passwordSchema,
      fullName: z.string().trim().min(2).max(120),
    })
    .optional(),
}).superRefine((value, ctx) => {
  if (value.createInitialAdmin && !value.initialAdmin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'initialAdmin is required when createInitialAdmin is true.',
      path: ['initialAdmin'],
    });
  }
});

export const platformTenantRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  primary_subdomain: z.string(),
  created_at: z.string(),
  initial_admin: z
    .object({
      id: z.string().uuid(),
      email: z.string().email().nullable().optional(),
      username: z.string(),
      full_name: z.string(),
      role: z.literal('COMPANY_ADMIN'),
    })
    .optional(),
});

export const tenantLoginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.string(),
  tenant_id: z.string().uuid(),
  role: z.enum(['COMPANY_ADMIN', 'SUPERVISOR', 'SITE_SUPERVISOR', 'TRANSPORT_MANAGER', 'HEAD_OFFICE_ADMIN', 'DRIVER']),
  actor_type: z.enum(['STAFF', 'DRIVER']),
});

export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;
export type TenantLoginRequest = z.infer<typeof tenantLoginRequestSchema>;
