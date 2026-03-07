-- Add tenant-internal staff roles for full-scope visibility.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TRANSPORT_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HEAD_OFFICE_ADMIN';

-- Normalized staff-to-site assignment mapping for tenant-internal site scoping.
CREATE TABLE IF NOT EXISTS "user_site_assignments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_site_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_site_assignments_tenant_id_idx" ON "user_site_assignments"("tenant_id");
CREATE INDEX IF NOT EXISTS "user_site_assignments_user_id_idx" ON "user_site_assignments"("user_id");
CREATE INDEX IF NOT EXISTS "user_site_assignments_site_id_idx" ON "user_site_assignments"("site_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_site_assignments_tenant_id_user_id_site_id_key"
  ON "user_site_assignments"("tenant_id", "user_id", "site_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_site_assignments_tenant_id_fkey'
  ) THEN
    ALTER TABLE "user_site_assignments"
      ADD CONSTRAINT "user_site_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_site_assignments_user_id_fkey'
  ) THEN
    ALTER TABLE "user_site_assignments"
      ADD CONSTRAINT "user_site_assignments_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_site_assignments_site_id_fkey'
  ) THEN
    ALTER TABLE "user_site_assignments"
      ADD CONSTRAINT "user_site_assignments_site_id_fkey"
      FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
