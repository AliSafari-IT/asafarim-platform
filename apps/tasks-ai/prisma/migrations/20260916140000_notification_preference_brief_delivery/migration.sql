-- Issue #242: proactive daily brief delivered to the notification inbox.
--   notification_preference.briefDelivery — explicit per-member opt-in.
--     Off by default: nothing is pushed to a member who never asked for it.
--   notification_preference.timezone — IANA timezone used to resolve
--     "local morning" for the brief-delivery worker job (and to interpret
--     the existing local-time `quietHours` string). No per-member timezone
--     was modeled anywhere in the schema before this; defaulting to UTC
--     rather than inventing a separate timezone-storage concept.
ALTER TABLE "notification_preference" ADD COLUMN "briefDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notification_preference" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
