-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationRecipientScope') THEN
    CREATE TYPE "NotificationRecipientScope" AS ENUM ('ALL_TENANT_OPERATIONS', 'SITE_SUPERVISORS_ONLY', 'CUSTOM');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenant_notification_settings" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
  "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
  "email_enabled" BOOLEAN NOT NULL DEFAULT false,
  "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
  "recipient_scope" "NotificationRecipientScope" NOT NULL DEFAULT 'ALL_TENANT_OPERATIONS',
  "custom_recipients" JSONB,
  "event_missing_daily_check" BOOLEAN NOT NULL DEFAULT true,
  "event_critical_checklist_issue" BOOLEAN NOT NULL DEFAULT true,
  "event_fuel_missing_receipt" BOOLEAN NOT NULL DEFAULT true,
  "event_odometer_fallback_used" BOOLEAN NOT NULL DEFAULT true,
  "event_approved_source_used" BOOLEAN NOT NULL DEFAULT true,
  "event_high_priority_exceptions" BOOLEAN NOT NULL DEFAULT true,
  "provider_config" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_notification_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_notification_settings_tenant_id_key"
  ON "tenant_notification_settings"("tenant_id");

CREATE INDEX IF NOT EXISTS "tenant_notification_settings_tenant_id_idx"
  ON "tenant_notification_settings"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_notification_settings_tenant_id_fkey'
  ) THEN
    ALTER TABLE "tenant_notification_settings"
      ADD CONSTRAINT "tenant_notification_settings_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
