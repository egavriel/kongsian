CREATE TABLE `otp_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_e164` text NOT NULL,
	`hour_bucket` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`first_request_at` integer DEFAULT 0 NOT NULL,
	`last_request_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_otp_rate` ON `otp_rate_limits` (`phone_e164`,`hour_bucket`);--> statement-breakpoint
CREATE INDEX `idx_otp_rate_phone` ON `otp_rate_limits` (`phone_e164`);--> statement-breakpoint
CREATE INDEX `idx_otp_rate_bucket` ON `otp_rate_limits` (`hour_bucket`);--> statement-breakpoint
ALTER TABLE `skus` ADD `masa_simpan_hari` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `foto_r2_key` text;