CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`duration_days` integer NOT NULL,
	`device_limit` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plans_enabled_sort` ON `plans` (`enabled`,`sort_order`);--> statement-breakpoint
CREATE TABLE `activation_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_hint` text NOT NULL,
	`expires_at` integer,
	`redeemed_by` text,
	`redeemed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redeemed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_activation_codes_hash` ON `activation_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_activation_codes_plan_created` ON `activation_codes` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activation_codes_redeemed` ON `activation_codes` (`redeemed_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `user_plan_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`activation_code_id` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`starts_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activation_code_id`) REFERENCES `activation_codes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_plan_activation_code` ON `user_plan_subscriptions` (`activation_code_id`);--> statement-breakpoint
CREATE INDEX `idx_user_plan_active` ON `user_plan_subscriptions` (`user_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_user_plan_plan` ON `user_plan_subscriptions` (`plan_id`,`created_at`);
