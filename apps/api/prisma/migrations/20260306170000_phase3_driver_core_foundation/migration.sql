-- Add approved source type for fuel logs.
ALTER TYPE "FuelSourceType" ADD VALUE IF NOT EXISTS 'APPROVED_SOURCE';

-- Add explicit odometer fallback and approved-source context fields.
ALTER TABLE "fuel_entries"
ADD COLUMN "approved_source_context" TEXT,
ADD COLUMN "odometer_fallback_used" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "odometer_fallback_reason" TEXT;

-- Odometer can be null when fallback flow is used.
ALTER TABLE "fuel_entries"
ALTER COLUMN "odometer_km" DROP NOT NULL;
