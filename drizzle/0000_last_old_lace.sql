CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`member_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`started_at` text NOT NULL,
	`seconds` real NOT NULL,
	`meters` real NOT NULL,
	`kcal` real NOT NULL,
	`met` real NOT NULL,
	`height` real NOT NULL,
	`weight` real NOT NULL,
	`age` integer NOT NULL,
	`point_count` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_retry` ON `activities` (`user_id`,`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_lesson_member` ON `activities` (`lesson_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `activities_lesson` ON `activities` (`lesson_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_user` ON `activities` (`user_id`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`join_code` text NOT NULL,
	`capacity` integer DEFAULT 60 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_code` ON `classes` (`join_code`);--> statement-breakpoint
CREATE INDEX `classes_owner` ON `classes` (`owner_id`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`target_minutes` integer DEFAULT 20 NOT NULL,
	`created_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lessons_class` ON `lessons` (`class_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`alias` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_user` ON `members` (`class_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_alias` ON `members` (`class_id`,`alias`);--> statement-breakpoint
CREATE INDEX `member_user_lookup` ON `members` (`user_id`);