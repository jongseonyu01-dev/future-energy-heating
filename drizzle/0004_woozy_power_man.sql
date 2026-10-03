CREATE TABLE `location_consents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicianId` int NOT NULL,
	`consentedAt` timestamp NOT NULL DEFAULT (now()),
	`consentVersion` varchar(10) NOT NULL DEFAULT '1.0',
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `location_consents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `location_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`technicianId` int NOT NULL,
	`technicianName` varchar(50),
	`technicianPhone` varchar(20),
	`customerName` varchar(50),
	`customerPhone` varchar(20),
	`customerAddress` varchar(200),
	`customerLat` decimal(10,7),
	`customerLng` decimal(10,7),
	`branchId` int,
	`branchName` varchar(100),
	`trackingToken` varchar(64) NOT NULL,
	`currentLat` decimal(10,7),
	`currentLng` decimal(10,7),
	`currentUpdatedAt` timestamp,
	`status` enum('이동중','도착완료','업무취소','만료') NOT NULL DEFAULT '이동중',
	`departedAt` timestamp NOT NULL DEFAULT (now()),
	`arrivedAt` timestamp,
	`cancelledAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`smsSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `location_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `location_sessions_trackingToken_unique` UNIQUE(`trackingToken`)
);
--> statement-breakpoint
ALTER TABLE `flow_rate_settings` ADD `customerId` varchar(20);--> statement-breakpoint
ALTER TABLE `flow_rate_settings` ADD `inspectionStatus` enum('미처리','처리중','처리완료') DEFAULT '미처리';--> statement-breakpoint
ALTER TABLE `flow_rate_settings` ADD `inspectionMemo` text;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `isUrgent` boolean DEFAULT false NOT NULL;