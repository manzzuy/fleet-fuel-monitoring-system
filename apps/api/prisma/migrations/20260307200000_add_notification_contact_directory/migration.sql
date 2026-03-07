DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactDirectoryRole') THEN
    CREATE TYPE "ContactDirectoryRole" AS ENUM ('SITE_SUPERVISOR', 'TRANSPORT_MANAGER', 'HEAD_OFFICE_ADMIN', 'CUSTOM');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "contact_directory_entries" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID,
  "name" TEXT NOT NULL,
  "role" "ContactDirectoryRole" NOT NULL,
  "phone_e164" TEXT,
  "email" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_directory_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contact_site_assignments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_site_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contact_directory_entries_tenant_id_idx"
  ON "contact_directory_entries" ("tenant_id");
CREATE INDEX IF NOT EXISTS "contact_directory_entries_tenant_id_role_is_active_idx"
  ON "contact_directory_entries" ("tenant_id", "role", "is_active");
CREATE INDEX IF NOT EXISTS "contact_directory_entries_user_id_idx"
  ON "contact_directory_entries" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "contact_directory_entries_tenant_id_user_id_key"
  ON "contact_directory_entries" ("tenant_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "contact_directory_entries_tenant_id_phone_e164_key"
  ON "contact_directory_entries" ("tenant_id", "phone_e164");

CREATE INDEX IF NOT EXISTS "contact_site_assignments_tenant_id_idx"
  ON "contact_site_assignments" ("tenant_id");
CREATE INDEX IF NOT EXISTS "contact_site_assignments_contact_id_idx"
  ON "contact_site_assignments" ("contact_id");
CREATE INDEX IF NOT EXISTS "contact_site_assignments_site_id_idx"
  ON "contact_site_assignments" ("site_id");
CREATE UNIQUE INDEX IF NOT EXISTS "contact_site_assignments_tenant_id_contact_id_site_id_key"
  ON "contact_site_assignments" ("tenant_id", "contact_id", "site_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_directory_entries_tenant_id_fkey'
  ) THEN
    ALTER TABLE "contact_directory_entries"
      ADD CONSTRAINT "contact_directory_entries_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_directory_entries_user_id_fkey'
  ) THEN
    ALTER TABLE "contact_directory_entries"
      ADD CONSTRAINT "contact_directory_entries_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_site_assignments_tenant_id_fkey'
  ) THEN
    ALTER TABLE "contact_site_assignments"
      ADD CONSTRAINT "contact_site_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_site_assignments_contact_id_fkey'
  ) THEN
    ALTER TABLE "contact_site_assignments"
      ADD CONSTRAINT "contact_site_assignments_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "contact_directory_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_site_assignments_site_id_fkey'
  ) THEN
    ALTER TABLE "contact_site_assignments"
      ADD CONSTRAINT "contact_site_assignments_site_id_fkey"
      FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
