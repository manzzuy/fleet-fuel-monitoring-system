CREATE TYPE "OnboardingImportBatchStatus" AS ENUM ('UPLOADED', 'PREVIEWED', 'COMMITTED', 'FAILED');

CREATE TABLE "sites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "site_code" TEXT NOT NULL,
  "site_name" TEXT NOT NULL,
  "location" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "fleet_number" TEXT NOT NULL,
  "plate_number" TEXT,
  "vehicle_make" TEXT,
  "vehicle_model" TEXT,
  "vehicle_type" TEXT,
  "site_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fuel_cards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "card_number" TEXT NOT NULL,
  "provider" TEXT,
  "assigned_vehicle_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuel_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_import_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "status" "OnboardingImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
  "created_by" UUID NOT NULL,
  "source_file_path" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "actor_id" UUID,
  "actor_type" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "drivers"
ADD COLUMN "site_id" UUID,
ADD COLUMN "assigned_vehicle_id" UUID;

CREATE INDEX "sites_tenant_id_idx" ON "sites"("tenant_id");
CREATE UNIQUE INDEX "sites_tenant_id_site_code_key" ON "sites"("tenant_id", "site_code");

CREATE INDEX "vehicles_tenant_id_idx" ON "vehicles"("tenant_id");
CREATE INDEX "vehicles_site_id_idx" ON "vehicles"("site_id");
CREATE UNIQUE INDEX "vehicles_tenant_id_fleet_number_key" ON "vehicles"("tenant_id", "fleet_number");
CREATE UNIQUE INDEX "vehicles_tenant_id_plate_number_key" ON "vehicles"("tenant_id", "plate_number");

CREATE INDEX "fuel_cards_tenant_id_idx" ON "fuel_cards"("tenant_id");
CREATE INDEX "fuel_cards_assigned_vehicle_id_idx" ON "fuel_cards"("assigned_vehicle_id");
CREATE UNIQUE INDEX "fuel_cards_tenant_id_card_number_key" ON "fuel_cards"("tenant_id", "card_number");

CREATE INDEX "onboarding_import_batches_tenant_id_idx" ON "onboarding_import_batches"("tenant_id");
CREATE INDEX "onboarding_import_batches_created_by_idx" ON "onboarding_import_batches"("created_by");

CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

CREATE INDEX "drivers_site_id_idx" ON "drivers"("site_id");
CREATE INDEX "drivers_assigned_vehicle_id_idx" ON "drivers"("assigned_vehicle_id");

ALTER TABLE "sites"
ADD CONSTRAINT "sites_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles"
ADD CONSTRAINT "vehicles_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles"
ADD CONSTRAINT "vehicles_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuel_cards"
ADD CONSTRAINT "fuel_cards_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fuel_cards"
ADD CONSTRAINT "fuel_cards_assigned_vehicle_id_fkey"
FOREIGN KEY ("assigned_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboarding_import_batches"
ADD CONSTRAINT "onboarding_import_batches_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "onboarding_import_batches"
ADD CONSTRAINT "onboarding_import_batches_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "drivers"
ADD CONSTRAINT "drivers_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "drivers"
ADD CONSTRAINT "drivers_assigned_vehicle_id_fkey"
FOREIGN KEY ("assigned_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
