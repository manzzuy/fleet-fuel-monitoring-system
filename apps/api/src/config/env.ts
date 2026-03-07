import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().optional(),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default('15m'),
    PLATFORM_BASE_DOMAIN: z.string().min(1).default('platform.test'),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
    APP_VERSION: z.string().default('dev'),
    APP_BUILD_SHA: z.string().optional(),
    NOTIFICATION_PROVIDER: z.enum(['stub', 'meta_cloud_api', 'twilio_whatsapp']).default('stub'),
    NOTIFICATION_DELIVERY_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value.toLowerCase() === 'true'),
    NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION: z
      .string()
      .default('false')
      .transform((value) => value.toLowerCase() === 'true'),
    META_WHATSAPP_API_BASE_URL: z.string().url().default('https://graph.facebook.com'),
    META_WHATSAPP_API_VERSION: z.string().default('v21.0'),
    META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production') {
      if (value.JWT_SECRET.includes('change-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'Production JWT_SECRET must not use a placeholder value.',
        });
      }

      if (value.NOTIFICATION_PROVIDER === 'meta_cloud_api' && value.NOTIFICATION_DELIVERY_ENABLED) {
        if (!value.META_WHATSAPP_PHONE_NUMBER_ID) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['META_WHATSAPP_PHONE_NUMBER_ID'],
            message: 'Required when Meta Cloud API provider is enabled for production delivery.',
          });
        }
        if (!value.META_WHATSAPP_ACCESS_TOKEN) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['META_WHATSAPP_ACCESS_TOKEN'],
            message: 'Required when Meta Cloud API provider is enabled for production delivery.',
          });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid API environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('API environment validation failed');
}

export const env = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean),
};
