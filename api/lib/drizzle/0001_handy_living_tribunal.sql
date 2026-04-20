CREATE TABLE `conversationMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('system','user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversationThreads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL DEFAULT 'Flow Guru Chat',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationThreads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userMemoryFacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`category` enum('wake_up_time','daily_routine','preference','recurring_event','general') NOT NULL DEFAULT 'general',
	`factKey` varchar(128),
	`factValue` text NOT NULL,
	`confidence` int NOT NULL DEFAULT 100,
	`sourceMessageId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userMemoryFacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userMemoryProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`wakeUpTime` varchar(64),
	`dailyRoutine` text,
	`preferencesSummary` text,
	`recurringEventsSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userMemoryProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `userMemoryProfiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `conversationMessages_thread_idx` ON `conversationMessages` (`threadId`);--> statement-breakpoint
CREATE INDEX `conversationMessages_user_idx` ON `conversationMessages` (`userId`);--> statement-breakpoint
CREATE INDEX `conversationMessages_created_idx` ON `conversationMessages` (`createdAt`);--> statement-breakpoint
CREATE INDEX `conversationThreads_user_idx` ON `conversationThreads` (`userId`);--> statement-breakpoint
CREATE INDEX `conversationThreads_updated_idx` ON `conversationThreads` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `userMemoryFacts_user_idx` ON `userMemoryFacts` (`userId`);--> statement-breakpoint
CREATE INDEX `userMemoryFacts_category_idx` ON `userMemoryFacts` (`category`);