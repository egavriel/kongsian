ALTER TABLE `partnerships` ADD `settlement_start_day` text DEFAULT 'MONDAY' NOT NULL;--> statement-breakpoint
ALTER TABLE `partnerships` ADD `settlement_end_day` text DEFAULT 'SUNDAY' NOT NULL;