ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SITE_SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DRIVER';

ALTER TABLE "users"
ADD COLUMN "employee_no" TEXT;

CREATE UNIQUE INDEX "users_tenant_id_employee_no_key" ON "users"("tenant_id", "employee_no");

CREATE TABLE "user_auth" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "password_hash" TEXT NOT NULL,
  "force_password_change" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_auth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_auth_user_id_key" ON "user_auth"("user_id");

ALTER TABLE "user_auth"
ADD CONSTRAINT "user_auth_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "driver_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "driving_license_no" TEXT,
  "driving_license_expiry" DATE,
  "opal_no" TEXT,
  "opal_expiry" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_profiles_user_id_key" ON "driver_profiles"("user_id");
CREATE INDEX "driver_profiles_tenant_id_idx" ON "driver_profiles"("tenant_id");

ALTER TABLE "driver_profiles"
ADD CONSTRAINT "driver_profiles_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_profiles"
ADD CONSTRAINT "driver_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "driver_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "credential_type" TEXT NOT NULL,
  "credential_number" TEXT,
  "expiry_date" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_credentials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_credentials_tenant_id_idx" ON "driver_credentials"("tenant_id");
CREATE INDEX "driver_credentials_user_id_idx" ON "driver_credentials"("user_id");
CREATE UNIQUE INDEX "driver_credentials_tenant_id_user_id_credential_type_key" ON "driver_credentials"("tenant_id", "user_id", "credential_type");

ALTER TABLE "driver_credentials"
ADD CONSTRAINT "driver_credentials_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_credentials"
ADD CONSTRAINT "driver_credentials_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supervisor_sites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "supervisor_user_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supervisor_sites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supervisor_sites_tenant_id_idx" ON "supervisor_sites"("tenant_id");
CREATE INDEX "supervisor_sites_supervisor_user_id_idx" ON "supervisor_sites"("supervisor_user_id");
CREATE INDEX "supervisor_sites_site_id_idx" ON "supervisor_sites"("site_id");
CREATE UNIQUE INDEX "supervisor_sites_tenant_id_supervisor_user_id_site_id_key" ON "supervisor_sites"("tenant_id", "supervisor_user_id", "site_id");

ALTER TABLE "supervisor_sites"
ADD CONSTRAINT "supervisor_sites_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_sites"
ADD CONSTRAINT "supervisor_sites_supervisor_user_id_fkey"
FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_sites"
ADD CONSTRAINT "supervisor_sites_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tanks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "tank_name" TEXT NOT NULL,
  "capacity_l" DECIMAL(12,2) NOT NULL,
  "reorder_level_l" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tanks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tanks_tenant_id_idx" ON "tanks"("tenant_id");
CREATE INDEX "tanks_site_id_idx" ON "tanks"("site_id");
CREATE UNIQUE INDEX "tanks_tenant_id_site_id_tank_name_key" ON "tanks"("tenant_id", "site_id", "tank_name");

ALTER TABLE "tanks"
ADD CONSTRAINT "tanks_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tanks"
ADD CONSTRAINT "tanks_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "equipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "equipment_code" TEXT NOT NULL,
  "equipment_name" TEXT NOT NULL,
  "site_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "equipment_tenant_id_idx" ON "equipment"("tenant_id");
CREATE INDEX "equipment_site_id_idx" ON "equipment"("site_id");
CREATE UNIQUE INDEX "equipment_tenant_id_equipment_code_key" ON "equipment"("tenant_id", "equipment_code");

ALTER TABLE "equipment"
ADD CONSTRAINT "equipment_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "equipment"
ADD CONSTRAINT "equipment_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboarding_import_batches"
ADD COLUMN "preview_json" JSONB,
ADD COLUMN "errors_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "warnings_count" INTEGER NOT NULL DEFAULT 0;
