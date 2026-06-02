CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_e164` text NOT NULL,
	`name` text NOT NULL,
	`global_role` text DEFAULT 'USER' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_e164_unique` ON `users` (`phone_e164`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_phone` ON `users` (`phone_e164`);--> statement-breakpoint
CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo_r2_key` text,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_slug_unique` ON `brands` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_brands_slug` ON `brands` (`slug`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`address` text,
	`pic_phone_e164` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_tenants_slug` ON `tenants` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_tenants_pic` ON `tenants` (`pic_phone_e164`);--> statement-breakpoint
CREATE TABLE `tenant_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'OWNER' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_user_tenant` ON `tenant_memberships` (`user_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_tm_tenant` ON `tenant_memberships` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `skus` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`price_idr` integer NOT NULL,
	`cost_idr` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_brand_code` ON `skus` (`brand_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_skus_brand` ON `skus` (`brand_id`);--> statement-breakpoint
CREATE TABLE `partnerships` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`revenue_split_brand_bps` integer DEFAULT 7000 NOT NULL,
	`revenue_split_tenant_bps` integer DEFAULT 3000 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`activated_at` integer,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_brand_tenant` ON `partnerships` (`brand_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_partnership_status` ON `partnerships` (`status`);--> statement-breakpoint
CREATE INDEX `idx_partnership_tenant` ON `partnerships` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `partnership_skus` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`price_override_idr` integer,
	`active` integer DEFAULT true NOT NULL,
	`price_changed_at` integer,
	`price_changed_by_user_id` text,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`price_changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_partnership_sku` ON `partnership_skus` (`partnership_id`,`sku_id`);--> statement-breakpoint
CREATE INDEX `idx_ps_sku` ON `partnership_skus` (`sku_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`movement_date` text NOT NULL,
	`kind` text NOT NULL,
	`qty` integer NOT NULL,
	`reason` text,
	`submitted_by_user_id` text NOT NULL,
	`corrects_movement_id` text,
	`submitted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_idempotency_key_unique` ON `stock_movements` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_mov_psd` ON `stock_movements` (`partnership_id`,`sku_id`,`movement_date`);--> statement-breakpoint
CREATE INDEX `idx_mov_date` ON `stock_movements` (`movement_date`);--> statement-breakpoint
CREATE TABLE `daily_closings` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`closing_date` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`submitted_by_user_id` text,
	`submitted_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_closing_pd` ON `daily_closings` (`partnership_id`,`closing_date`);--> statement-breakpoint
CREATE INDEX `idx_dc_status` ON `daily_closings` (`status`);--> statement-breakpoint
CREATE TABLE `daily_closing_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_closing_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`terjual` integer NOT NULL,
	`sisa_fisik` integer NOT NULL,
	`sisa_sistem` integer NOT NULL,
	`selisih` integer NOT NULL,
	`dispute_id` text,
	FOREIGN KEY (`daily_closing_id`) REFERENCES `daily_closings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_closing_sku` ON `daily_closing_lines` (`daily_closing_id`,`sku_id`);--> statement-breakpoint
CREATE INDEX `idx_dcl_sku` ON `daily_closing_lines` (`sku_id`);--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`week_start_date` text NOT NULL,
	`week_end_date` text NOT NULL,
	`total_terjual` integer NOT NULL,
	`total_omzet_idr` integer NOT NULL,
	`brand_share_idr` integer NOT NULL,
	`tenant_share_idr` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`approved_by_user_id` text,
	`approved_at` integer,
	`pdf_r2_key` text,
	`generated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_settlement_pw` ON `settlements` (`partnership_id`,`week_start_date`);--> statement-breakpoint
CREATE INDEX `idx_settlement_status` ON `settlements` (`status`);--> statement-breakpoint
CREATE INDEX `idx_settlement_week` ON `settlements` (`week_start_date`);--> statement-breakpoint
CREATE TABLE `settlement_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`qty_terjual` integer NOT NULL,
	`omzet_idr` integer NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sl_settlement` ON `settlement_lines` (`settlement_id`);--> statement-breakpoint
CREATE INDEX `idx_sl_sku` ON `settlement_lines` (`sku_id`);--> statement-breakpoint
CREATE TABLE `otps` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_e164` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`purpose` text NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_otp_pp` ON `otps` (`phone_e164`,`purpose`);--> statement-breakpoint
CREATE INDEX `idx_otp_expires` ON `otps` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`ip` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_user` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`daily_closing_line_id` text NOT NULL,
	`selisih_qty` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`resolution_notes` text,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`daily_closing_line_id`) REFERENCES `daily_closing_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dispute_partnership` ON `disputes` (`partnership_id`);--> statement-breakpoint
CREATE INDEX `idx_dispute_status` ON `disputes` (`status`);