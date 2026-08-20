CREATE TABLE `crypto_payment_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`display_name` text NOT NULL,
	`network` text NOT NULL,
	`asset` text NOT NULL,
	`address` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_crypto_payment_method` ON `crypto_payment_settings` (`method`);
--> statement-breakpoint
CREATE TABLE `crypto_payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`payment_setting_id` text NOT NULL,
	`method` text NOT NULL,
	`address_snapshot` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`tx_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_note` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_setting_id`) REFERENCES `crypto_payment_settings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_crypto_payment_method_tx` ON `crypto_payment_orders` (`method`,`tx_hash`);
--> statement-breakpoint
CREATE INDEX `idx_crypto_payment_user_created` ON `crypto_payment_orders` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_crypto_payment_status_created` ON `crypto_payment_orders` (`status`,`created_at`);
