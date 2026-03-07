-- CreateEnum
CREATE TYPE "ComplianceAppliesTo" AS ENUM ('DRIVER', 'VEHICLE');

-- CreateTable
CREATE TABLE "compliance_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to" "ComplianceAppliesTo" NOT NULL,
    "requires_expiry" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compliance_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "compliance_type_id" UUID NOT NULL,
    "applies_to" "ComplianceAppliesTo" NOT NULL,
    "target_user_id" UUID,
    "target_vehicle_id" UUID,
    "reference_number" TEXT,
    "issued_at" DATE,
    "expiry_date" DATE,
    "notes" TEXT,
    "evidence_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "compliance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_types_tenant_id_idx" ON "compliance_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_types_tenant_id_applies_to_name_key" ON "compliance_types"("tenant_id", "applies_to", "name");

-- CreateIndex
CREATE INDEX "compliance_records_tenant_id_idx" ON "compliance_records"("tenant_id");

-- CreateIndex
CREATE INDEX "compliance_records_compliance_type_id_idx" ON "compliance_records"("compliance_type_id");

-- CreateIndex
CREATE INDEX "compliance_records_target_user_id_idx" ON "compliance_records"("target_user_id");

-- CreateIndex
CREATE INDEX "compliance_records_target_vehicle_id_idx" ON "compliance_records"("target_vehicle_id");

-- CreateIndex
CREATE INDEX "compliance_records_expiry_date_idx" ON "compliance_records"("expiry_date");

-- CreateIndex
CREATE INDEX "compliance_records_tenant_id_applies_to_expiry_date_idx" ON "compliance_records"("tenant_id", "applies_to", "expiry_date");

-- AddForeignKey
ALTER TABLE "compliance_types" ADD CONSTRAINT "compliance_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_compliance_type_id_fkey" FOREIGN KEY ("compliance_type_id") REFERENCES "compliance_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_target_vehicle_id_fkey" FOREIGN KEY ("target_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
