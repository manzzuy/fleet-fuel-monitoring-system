DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'tenant_notification_settings'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'tenant_notification_settings'
        AND column_name = 'event_compliance_expired'
    ) THEN
      ALTER TABLE "tenant_notification_settings"
        ADD COLUMN "event_compliance_expired" BOOLEAN NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'tenant_notification_settings'
        AND column_name = 'event_compliance_expiring_soon'
    ) THEN
      ALTER TABLE "tenant_notification_settings"
        ADD COLUMN "event_compliance_expiring_soon" BOOLEAN NOT NULL DEFAULT true;
    END IF;
  END IF;
END $$;
