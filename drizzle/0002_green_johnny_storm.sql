CREATE TABLE `providerConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('google-calendar','spotify') NOT NULL,
	`status` enum('not_connected','pending','connected','error') NOT NULL DEFAULT 'pending',
	`externalAccountId` varchar(255),
	`externalAccountLabel` varchar(255),
	`accessToken` text,
	`refreshToken` text,
	`scope` text,
	`tokenType` varchar(64),
	`expiresAtUnixMs` bigint,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `providerConnections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `providerConnections_user_provider_idx` ON `providerConnections` (`userId`,`provider`);--> statement-breakpoint
CREATE INDEX `providerConnections_status_idx` ON `providerConnections` (`status`);