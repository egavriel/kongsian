-- Add verification_status to users (admin gate: PENDING_VERIFIED|VERIFIED|REJECTED)
-- Default for new users: PENDING_VERIFICATION (admin must approve before dashboard access)
-- Existing users: treated as VERIFIED so the migration is non-breaking.
ALTER TABLE `users` ADD `verification_status` text DEFAULT 'PENDING_VERIFIED' NOT NULL;
--> statement-breakpoint
-- Backfill existing rows to VERIFIED so we don't strand anyone.
UPDATE `users` SET `verification_status` = 'VERIFIED' WHERE `verification_status` = 'PENDING_VERIFIED';
--> statement-breakpoint
-- Add wa_sent to otps so the WA-cron can mark attempts.
ALTER TABLE `otps` ADD `wa_sent` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Add onboarding_role to users (the role chosen at register time: BRAND or TENANT)
-- NULL allowed for PLATFORM_ADMIN and for users who registered before this migration.
ALTER TABLE `users` ADD `onboarding_role` text;
