ALTER TABLE `push_endpoints` ADD `config_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_endpoints` ADD `last_tested_at` integer;