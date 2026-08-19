CREATE TABLE `account_link_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_user_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`target_endpoint_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_endpoint_id`) REFERENCES `push_endpoints`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_account_link_requester_created` ON `account_link_challenges` (`requester_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_account_link_target_expires` ON `account_link_challenges` (`target_endpoint_id`,`expires_at`);