PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_partnerships` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`revenue_split_brand_bps` integer DEFAULT 7000 NOT NULL,
	`revenue_split_tenant_bps` integer DEFAULT 3000 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`settlement_start_day` text DEFAULT 'SUNDAY' NOT NULL,
	`settlement_end_day` text DEFAULT 'SATURDAY' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`activated_at` integer,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_partnerships`("id", "brand_id", "tenant_id", "revenue_split_brand_bps", "revenue_split_tenant_bps", "status", "settlement_start_day", "settlement_end_day", "created_at", "activated_at") SELECT "id", "brand_id", "tenant_id", "revenue_split_brand_bps", "revenue_split_tenant_bps", "status", "settlement_start_day", "settlement_end_day", "created_at", "activated_at" FROM `partnerships`;--> statement-breakpoint
DROP TABLE `partnerships`;--> statement-breakpoint
ALTER TABLE `__new_partnerships` RENAME TO `partnerships`;--> statement-breakpoint
-- PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_brand_tenant` ON `partnerships` (`brand_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_partnership_status` ON `partnerships` (`status`);--> statement-breakpoint
CREATE INDEX `idx_partnership_tenant` ON `partnerships` (`tenant_id`);--> statement-breakpoint
UPDATE partnerships SET settlement_start_day = 'SUNDAY', settlement_end_day = 'SATURDAY' WHERE settlement_start_day = 'MONDAY' AND settlement_end_day = 'SUNDAY';