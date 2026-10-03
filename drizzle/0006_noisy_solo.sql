ALTER TABLE `repair_requests` MODIFY COLUMN `status` enum('신규접수','본사배정','지사배정','기사배정대기','방문예정','작업진행중','견적승인대기','작업완료','재방문필요') NOT NULL DEFAULT '신규접수';--> statement-breakpoint
ALTER TABLE `branches` ADD `isDeleted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `branches` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `branches` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `fallbackUsed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `sido` varchar(30);--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `sigungu` varchar(40);--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `eupmyeondong` varchar(40);--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `roadAddress` varchar(200);--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `customerLat` decimal(10,7);--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `customerLng` decimal(10,7);--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `ownerType` enum('unassigned','headquarters','branch') DEFAULT 'unassigned' NOT NULL;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `isDeleted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `technicians` ADD `isDeleted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `technicians` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `technicians` ADD `deletedBy` int;