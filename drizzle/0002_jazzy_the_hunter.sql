CREATE TABLE `oauth_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_ciphertext` text NOT NULL,
	`issuer` text,
	`authorization_url` text NOT NULL,
	`token_url` text NOT NULL,
	`user_info_url` text NOT NULL,
	`scopes` text DEFAULT 'openid profile email' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_oauth_providers_slug` ON `oauth_providers` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_oauth_providers_enabled` ON `oauth_providers` (`enabled`,`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` integer DEFAULT false NOT NULL;