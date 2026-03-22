-- Create password reset request lifecycle enum.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PasswordResetRequestStatus'
  ) THEN
    CREATE TYPE "PasswordResetRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');
  END IF;
END $$;

-- Tenant-scoped password reset request queue for governed approval flow.
CREATE TABLE IF NOT EXISTS "password_reset_requests" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "username_entered" TEXT NOT NULL,
  "user_id" UUID,
  "role" "UserRole",
  "status" "PasswordResetRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requested_by_ip" TEXT,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_reset_requests_tenant_id_status_requested_at_idx"
  ON "password_reset_requests"("tenant_id", "status", "requested_at");
CREATE INDEX IF NOT EXISTS "password_reset_requests_tenant_id_username_entered_idx"
  ON "password_reset_requests"("tenant_id", "username_entered");
CREATE INDEX IF NOT EXISTS "password_reset_requests_user_id_idx"
  ON "password_reset_requests"("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_requests_reviewed_by_idx"
  ON "password_reset_requests"("reviewed_by");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_requests_tenant_id_fkey'
  ) THEN
    ALTER TABLE "password_reset_requests"
      ADD CONSTRAINT "password_reset_requests_tenant_id_fkey"
      FOREIGN KEY ("tenant_id")
      REFERENCES "tenants"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_requests_user_id_fkey'
  ) THEN
    ALTER TABLE "password_reset_requests"
      ADD CONSTRAINT "password_reset_requests_user_id_fkey"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_requests_reviewed_by_fkey'
  ) THEN
    ALTER TABLE "password_reset_requests"
      ADD CONSTRAINT "password_reset_requests_reviewed_by_fkey"
      FOREIGN KEY ("reviewed_by")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
