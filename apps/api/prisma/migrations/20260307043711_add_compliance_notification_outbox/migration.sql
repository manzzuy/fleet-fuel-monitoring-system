-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('COMPLIANCE_EXPIRED', 'COMPLIANCE_EXPIRING_SOON');

-- CreateEnum
CREATE TYPE "NotificationDispatchStatus" AS ENUM ('PENDING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'SKIPPED_DISABLED', 'SKIPPED_NO_RECIPIENTS', 'SKIPPED_NOT_CONFIGURED', 'STUBBED');

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "daily_check_items" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "daily_checks" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "driver_credentials" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "driver_profiles" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "equipment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fuel_cards" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fuel_entries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "onboarding_import_batches" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform_users" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "supervisor_sites" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tanks" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenant_domains" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenant_notification_settings" ADD COLUMN     "event_compliance_expired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "event_compliance_expiring_soon" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_auth" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" "NotificationEventType" NOT NULL,
    "source_record_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "recipient" TEXT,
    "recipient_label" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider_name" TEXT,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "dispatched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "outbox_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_name" TEXT NOT NULL,
    "recipient" TEXT,
    "status" "NotificationDispatchStatus" NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "response_code" INTEGER,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_idempotency_key_key" ON "notification_outbox"("idempotency_key");

-- CreateIndex
CREATE INDEX "notification_outbox_tenant_id_idx" ON "notification_outbox"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_outbox_tenant_id_status_next_attempt_at_idx" ON "notification_outbox"("tenant_id", "status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notification_outbox_event_type_source_record_id_idx" ON "notification_outbox"("event_type", "source_record_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_outbox_id_idx" ON "notification_deliveries"("outbox_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_tenant_id_created_at_idx" ON "notification_deliveries"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "notification_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
