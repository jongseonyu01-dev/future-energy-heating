CREATE TABLE `estimate_message_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estimateId` int,
	`orderId` int,
	`customerName` varchar(50),
	`customerPhone` varchar(20),
	`branchId` int,
	`branchName` varchar(100),
	`senderRole` varchar(30),
	`senderId` int,
	`messageType` varchar(50) NOT NULL,
	`messageBody` text,
	`linkUrl` text,
	`sendStatus` enum('SUCCESS','FAILED','SKIPPED') NOT NULL DEFAULT 'SKIPPED',
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `estimate_message_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`stdPrice` int NOT NULL DEFAULT 0,
	`discPrice` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `estimates` MODIFY COLUMN `requestId` int;--> statement-breakpoint
ALTER TABLE `estimates` MODIFY COLUMN `status` enum('pending','viewed','approved','rejected','expired') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `notification_logs` MODIFY COLUMN `result` enum('SUCCESS','FAILED','SKIPPED','REQUESTED') NOT NULL DEFAULT 'SKIPPED';--> statement-breakpoint
ALTER TABLE `repair_requests` MODIFY COLUMN `status` enum('신규접수','본사배정','지사배정','기사배정대기','방문예정','기사확인대기','기사확인완료','출발','도착','공사중','작업진행중','견적승인대기','작업완료','공사완료','재방문필요') NOT NULL DEFAULT '신규접수';--> statement-breakpoint
ALTER TABLE `estimates` ADD `title` varchar(200);--> statement-breakpoint
ALTER TABLE `estimates` ADD `customerName` varchar(50);--> statement-breakpoint
ALTER TABLE `estimates` ADD `customerPhone` varchar(20);--> statement-breakpoint
ALTER TABLE `estimates` ADD `fileUrl` text;--> statement-breakpoint
ALTER TABLE `estimates` ADD `fileName` varchar(255);--> statement-breakpoint
ALTER TABLE `estimates` ADD `fileType` varchar(100);--> statement-breakpoint
ALTER TABLE `estimates` ADD `fileSize` int;--> statement-breakpoint
ALTER TABLE `estimates` ADD `branchName` varchar(100);--> statement-breakpoint
ALTER TABLE `estimates` ADD `viewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `estimates` ADD `addressFull` text;--> statement-breakpoint
ALTER TABLE `estimates` ADD `sido` varchar(50);--> statement-breakpoint
ALTER TABLE `estimates` ADD `sigungu` varchar(50);--> statement-breakpoint
ALTER TABLE `estimates` ADD `eupmyeondong` varchar(50);--> statement-breakpoint
ALTER TABLE `estimates` ADD `buildingName` varchar(100);--> statement-breakpoint
ALTER TABLE `estimates` ADD `buildingDong` varchar(20);--> statement-breakpoint
ALTER TABLE `estimates` ADD `buildingHo` varchar(20);--> statement-breakpoint
ALTER TABLE `estimates` ADD `requestMemo` text;--> statement-breakpoint
ALTER TABLE `estimates` ADD `orderId` int;--> statement-breakpoint
ALTER TABLE `estimates` ADD `senderRole` varchar(30);--> statement-breakpoint
ALTER TABLE `estimates` ADD `resendCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `sensorUid` varchar(64);--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `customerName` varchar(50);--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `customerPhone` varchar(20);--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `provider` varchar(20) DEFAULT 'solapi';--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `groupId` varchar(100);--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `messageId` varchar(100);--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `sendStatus` varchar(20);--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `failReason` text;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `responsePayload` text;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD `sentAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `technicianConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `workStartedAt` timestamp;