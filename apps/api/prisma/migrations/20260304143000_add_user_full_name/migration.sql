ALTER TABLE "users"
ADD COLUMN "full_name" TEXT NOT NULL DEFAULT '';

UPDATE "users"
SET "full_name" = COALESCE("username", 'Unknown User')
WHERE "full_name" = '';

ALTER TABLE "users"
ALTER COLUMN "full_name" DROP DEFAULT;
