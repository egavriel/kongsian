-- Week 3: closing photos (WAJIB), dispute messages, notifications,
-- settlement payment proof, dispute metadata, and performance indexes.
-- Follows the Opus 4.8 audit (2026-06-03).

-- 1. New tables
CREATE TABLE `closing_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_closing_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`daily_closing_id`) REFERENCES `daily_closings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cp_closing` ON `closing_photos` (`daily_closing_id`);
--> statement-breakpoint

CREATE TABLE `dispute_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`dispute_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_role` text NOT NULL,
	`body` text NOT NULL,
	`photo_r2_key` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`dispute_id`) REFERENCES `disputes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dm_dispute` ON `dispute_messages` (`dispute_id`,`created_at`);
--> statement-breakpoint

CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`entity_type` text,
	`entity_id` text,
	`read_at` integer,
	`wa_sent` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notif_user_unread` ON `notifications` (`user_id`,`read_at`);
--> statement-breakpoint
CREATE INDEX `idx_notif_wa` ON `notifications` (`wa_sent`,`created_at`);
--> statement-breakpoint

-- 2. ALTER existing tables (single-value additions)
ALTER TABLE `daily_closings` ADD `locked_at` integer;
--> statement-breakpoint
CREATE INDEX `idx_dc_partnership_status` ON `daily_closings` (`partnership_id`,`status`);
--> statement-breakpoint

ALTER TABLE `settlements` ADD `paid_at` integer;
--> statement-breakpoint
ALTER TABLE `settlements` ADD `paid_by_user_id` text REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE `settlements` ADD `payment_proof_r2_key` text;
--> statement-breakpoint
ALTER TABLE `settlements` ADD `payment_note` text;
--> statement-breakpoint
CREATE INDEX `idx_settlement_partnership_status` ON `settlements` (`partnership_id`,`status`);
--> statement-breakpoint

ALTER TABLE `disputes` ADD `raised_by_user_id` text REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE `disputes` ADD `opened_by_role` text;
--> statement-breakpoint
ALTER TABLE `disputes` ADD `reason` text;
--> statement-breakpoint
ALTER TABLE `disputes` ADD `photo_r2_key` text;
--> statement-breakpoint
CREATE INDEX `idx_dispute_closing_line` ON `disputes` (`daily_closing_line_id`);
--> statement-breakpoint

-- 3. Performance: index for the WA-OTP cron dispatcher
CREATE INDEX `idx_otp_wa_sent` ON `otps` (`wa_sent`,`created_at`);
