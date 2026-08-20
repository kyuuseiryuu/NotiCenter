ALTER TABLE `crypto_payment_orders` ADD `asset` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crypto_payment_orders` ADD `crypto_amount` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `crypto_payment_orders` ADD `unit_price_micros` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crypto_payment_settings` ADD `price_currency` text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE `crypto_payment_settings` ADD `unit_price_micros` integer DEFAULT 0 NOT NULL;