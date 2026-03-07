DO $$
BEGIN
  CREATE TYPE "FuelSourceType" AS ENUM ('CARD', 'TANK', 'STATION', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DailyCheckStatus" AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DailyCheckItemStatus" AS ENUM ('OK', 'NOT_OK', 'NA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "fuel_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "site_id" UUID,
  "vehicle_id" UUID NOT NULL,
  "driver_id" UUID,
  "entry_date" DATE NOT NULL,
  "entry_time" TEXT,
  "odometer_km" INTEGER NOT NULL,
  "liters" DECIMAL(12,2) NOT NULL,
  "source_type" "FuelSourceType" NOT NULL,
  "fuel_card_id" UUID,
  "tank_id" UUID,
  "fuel_station_id" TEXT,
  "receipt_url" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "fuel_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fuel_entries_tenant_id_idx" ON "fuel_entries"("tenant_id");
CREATE INDEX "fuel_entries_vehicle_id_idx" ON "fuel_entries"("vehicle_id");
CREATE INDEX "fuel_entries_driver_id_idx" ON "fuel_entries"("driver_id");
CREATE INDEX "fuel_entries_site_id_idx" ON "fuel_entries"("site_id");
CREATE INDEX "fuel_entries_fuel_card_id_idx" ON "fuel_entries"("fuel_card_id");
CREATE INDEX "fuel_entries_tank_id_idx" ON "fuel_entries"("tank_id");
CREATE INDEX "fuel_entries_entry_date_created_at_idx" ON "fuel_entries"("entry_date", "created_at");

ALTER TABLE "fuel_entries"
ADD CONSTRAINT "fuel_entries_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fuel_entries"
ADD CONSTRAINT "fuel_entries_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuel_entries"
ADD CONSTRAINT "fuel_entries_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fuel_entries"
ADD CONSTRAINT "fuel_entries_driver_id_fkey"
FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuel_entries"
ADD CONSTRAINT "fuel_entries_fuel_card_id_fkey"
FOREIGN KEY ("fuel_card_id") REFERENCES "fuel_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuel_entries"
ADD CONSTRAINT "fuel_entries_tank_id_fkey"
FOREIGN KEY ("tank_id") REFERENCES "tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuel_entries"
ADD CONSTRAINT "fuel_entries_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "daily_checks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "site_id" UUID,
  "vehicle_id" UUID NOT NULL,
  "driver_id" UUID,
  "check_date" DATE NOT NULL,
  "status" "DailyCheckStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "daily_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "daily_checks_tenant_id_idx" ON "daily_checks"("tenant_id");
CREATE INDEX "daily_checks_vehicle_id_idx" ON "daily_checks"("vehicle_id");
CREATE INDEX "daily_checks_driver_id_idx" ON "daily_checks"("driver_id");
CREATE INDEX "daily_checks_site_id_idx" ON "daily_checks"("site_id");
CREATE INDEX "daily_checks_check_date_status_idx" ON "daily_checks"("check_date", "status");
CREATE UNIQUE INDEX "daily_checks_tenant_id_vehicle_id_check_date_key" ON "daily_checks"("tenant_id", "vehicle_id", "check_date");

ALTER TABLE "daily_checks"
ADD CONSTRAINT "daily_checks_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "daily_checks"
ADD CONSTRAINT "daily_checks_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "daily_checks"
ADD CONSTRAINT "daily_checks_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "daily_checks"
ADD CONSTRAINT "daily_checks_driver_id_fkey"
FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "daily_checks"
ADD CONSTRAINT "daily_checks_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "checklist_sections_master" (
  "section_code" TEXT NOT NULL,
  "section_name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "checklist_sections_master_pkey" PRIMARY KEY ("section_code")
);

CREATE TABLE "checklist_items_master" (
  "item_code" TEXT NOT NULL,
  "section_code" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "required" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "checklist_items_master_pkey" PRIMARY KEY ("item_code")
);

CREATE INDEX "checklist_items_master_section_code_sort_order_idx" ON "checklist_items_master"("section_code", "sort_order");

ALTER TABLE "checklist_items_master"
ADD CONSTRAINT "checklist_items_master_section_code_fkey"
FOREIGN KEY ("section_code") REFERENCES "checklist_sections_master"("section_code") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "daily_check_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "daily_check_id" UUID NOT NULL,
  "item_code" TEXT NOT NULL,
  "status" "DailyCheckItemStatus" NOT NULL,
  "notes" TEXT,
  "photo_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_check_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "daily_check_items_daily_check_id_idx" ON "daily_check_items"("daily_check_id");
CREATE INDEX "daily_check_items_item_code_idx" ON "daily_check_items"("item_code");
CREATE UNIQUE INDEX "daily_check_items_daily_check_id_item_code_key" ON "daily_check_items"("daily_check_id", "item_code");

ALTER TABLE "daily_check_items"
ADD CONSTRAINT "daily_check_items_daily_check_id_fkey"
FOREIGN KEY ("daily_check_id") REFERENCES "daily_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "daily_check_items"
ADD CONSTRAINT "daily_check_items_item_code_fkey"
FOREIGN KEY ("item_code") REFERENCES "checklist_items_master"("item_code") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "checklist_sections_master" ("section_code", "section_name", "sort_order", "is_active")
VALUES
  ('EXTERIOR', 'Exterior', 1, true),
  ('SAFETY', 'Safety', 2, true),
  ('CABIN', 'Cabin', 3, true)
ON CONFLICT ("section_code") DO UPDATE
SET "section_name" = EXCLUDED."section_name",
    "sort_order" = EXCLUDED."sort_order",
    "is_active" = EXCLUDED."is_active";

INSERT INTO "checklist_items_master" ("item_code", "section_code", "item_name", "sort_order", "is_active", "required")
VALUES
  ('LIGHTS', 'EXTERIOR', 'Lights and indicators operational', 1, true, true),
  ('TIRES', 'EXTERIOR', 'Tires visually inspected', 2, true, true),
  ('BRAKES', 'SAFETY', 'Brakes functioning correctly', 1, true, true),
  ('FIRE_EXT', 'SAFETY', 'Fire extinguisher present and valid', 2, true, true),
  ('MIRRORS', 'CABIN', 'Mirrors and windshield clear', 1, true, false),
  ('HORN', 'CABIN', 'Horn functional', 2, true, false)
ON CONFLICT ("item_code") DO UPDATE
SET "section_code" = EXCLUDED."section_code",
    "item_name" = EXCLUDED."item_name",
    "sort_order" = EXCLUDED."sort_order",
    "is_active" = EXCLUDED."is_active",
    "required" = EXCLUDED."required";
