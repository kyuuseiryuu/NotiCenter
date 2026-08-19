CREATE TABLE `oauth_binding_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`state_hash` text NOT NULL,
	`verifier_ciphertext` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `oauth_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_oauth_binding_states_hash` ON `oauth_binding_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `idx_oauth_binding_states_user_expires` ON `oauth_binding_states` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_subject` text NOT NULL,
	`username` text,
	`email` text,
	`profile_url` text,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `oauth_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_oauth_identity_provider_subject` ON `oauth_identities` (`provider_id`,`provider_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_oauth_identity_user_provider` ON `oauth_identities` (`user_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `idx_oauth_identities_user` ON `oauth_identities` (`user_id`,`created_at`);