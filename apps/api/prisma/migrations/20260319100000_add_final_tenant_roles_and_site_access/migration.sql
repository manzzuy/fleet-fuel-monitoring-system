-- Add new tenant roles for pilot governance.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TENANT_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SAFETY_OFFICER';

-- Extend contact directory role targeting.
ALTER TYPE "ContactDirectoryRole" ADD VALUE IF NOT EXISTS 'TENANT_ADMIN';
ALTER TYPE "ContactDirectoryRole" ADD VALUE IF NOT EXISTS 'SAFETY_OFFICER';

-- Add optional primary site pointer on users for single-site roles.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "site_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_site_id_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_site_id_fkey"
      FOREIGN KEY ("site_id")
      REFERENCES "sites"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "users_site_id_idx" ON "users"("site_id");

-- New canonical user-to-site access map for scoped roles.
CREATE TABLE IF NOT EXISTS "user_site_access" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_site_access_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_site_access_tenant_id_idx" ON "user_site_access"("tenant_id");
CREATE INDEX IF NOT EXISTS "user_site_access_user_id_idx" ON "user_site_access"("user_id");
CREATE INDEX IF NOT EXISTS "user_site_access_site_id_idx" ON "user_site_access"("site_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_site_access_tenant_id_user_id_site_id_key"
  ON "user_site_access"("tenant_id", "user_id", "site_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_site_access_tenant_id_fkey'
  ) THEN
    ALTER TABLE "user_site_access"
      ADD CONSTRAINT "user_site_access_tenant_id_fkey"
      FOREIGN KEY ("tenant_id")
      REFERENCES "tenants"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_site_access_user_id_fkey'
  ) THEN
    ALTER TABLE "user_site_access"
      ADD CONSTRAINT "user_site_access_user_id_fkey"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_site_access_site_id_fkey'
  ) THEN
    ALTER TABLE "user_site_access"
      ADD CONSTRAINT "user_site_access_site_id_fkey"
      FOREIGN KEY ("site_id")
      REFERENCES "sites"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill site access from existing assignment tables.
INSERT INTO "user_site_access" ("id", "tenant_id", "user_id", "site_id", "created_at")
SELECT gen_random_uuid(), usa."tenant_id", usa."user_id", usa."site_id", usa."created_at"
FROM "user_site_assignments" usa
ON CONFLICT ("tenant_id", "user_id", "site_id") DO NOTHING;

INSERT INTO "user_site_access" ("id", "tenant_id", "user_id", "site_id", "created_at")
SELECT gen_random_uuid(), ss."tenant_id", ss."supervisor_user_id", ss."site_id", ss."created_at"
FROM "supervisor_sites" ss
ON CONFLICT ("tenant_id", "user_id", "site_id") DO NOTHING;

-- Backfill users.site_id to first assigned site for single-site roles.
UPDATE "users" u
SET "site_id" = src."site_id"
FROM (
  SELECT DISTINCT ON ("user_id") "user_id", "site_id"
  FROM "user_site_access"
  ORDER BY "user_id", "created_at" ASC
) src
WHERE u."id" = src."user_id"
  AND u."site_id" IS NULL;
