CREATE TABLE `oauth_login_states` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`state_hash` text NOT NULL,
	`verifier_ciphertext` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `oauth_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_oauth_login_states_hash` ON `oauth_login_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `idx_oauth_login_states_expires` ON `oauth_login_states` (`expires_at`);