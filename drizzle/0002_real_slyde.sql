CREATE TABLE `app_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`appRole` enum('customer','technician','branch_manager','hq_admin') NOT NULL DEFAULT 'customer',
	`loginId` varchar(64),
	`passwordHash` varchar(128),
	`phoneNumber` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_roles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(64) NOT NULL,
	`settingValue` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`code` varchar(20) NOT NULL,
	`region` varchar(100) NOT NULL,
	`managerName` varchar(50),
	`phoneNumber` varchar(20),
	`address` varchar(200),
	`isActive` boolean NOT NULL DEFAULT true,
	`managerUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `leak_sensors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensorUid` varchar(64) NOT NULL,
	`branchId` int,
	`customerName` varchar(50) NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`apartmentName` varchar(100) NOT NULL,
	`dong` varchar(20) NOT NULL,
	`ho` varchar(20) NOT NULL,
	`sensorName` varchar(100) NOT NULL,
	`installLocation` varchar(100) NOT NULL,
	`status` enum('정상','누수감지','배터리부족','통신끊김','점검필요') NOT NULL DEFAULT '정상',
	`batteryLevel` int NOT NULL DEFAULT 100,
	`lastCommAt` timestamp NOT NULL DEFAULT (now()),
	`leakDetectedAt` timestamp,
	`isResolved` boolean NOT NULL DEFAULT true,
	`technicianId` int,
	`technicianName` varchar(50),
	`adminMemo` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leak_sensors_id` PRIMARY KEY(`id`),
	CONSTRAINT `leak_sensors_sensorUid_unique` UNIQUE(`sensorUid`)
);
--> statement-breakpoint
CREATE TABLE `material_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`orderItems` text NOT NULL,
	`status` enum('신청','승인','발송','완료','반려') NOT NULL DEFAULT '신청',
	`requestedBy` int NOT NULL,
	`approvedBy` int,
	`memo` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `material_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`authorId` int NOT NULL,
	`targetBranchId` int,
	`isPinned` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int,
	`phoneNumber` varchar(20) NOT NULL,
	`channel` enum('SMS','ALIMTALK') NOT NULL DEFAULT 'SMS',
	`messageType` varchar(50),
	`content` text,
	`result` enum('SUCCESS','FAILED','SKIPPED') NOT NULL DEFAULT 'SKIPPED',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `region_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`keyword` varchar(100) NOT NULL,
	`priority` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `region_mappings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sensor_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensorUid` varchar(64) NOT NULL,
	`leakDetected` boolean NOT NULL DEFAULT false,
	`batteryLevel` int,
	`reportedAt` timestamp NOT NULL DEFAULT (now()),
	`source` enum('DEMO_TEST','WEBHOOK') NOT NULL DEFAULT 'WEBHOOK',
	`rawPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sensor_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text,
	`fileUrl` text,
	`category` varchar(50),
	`authorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `training_materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`technicianId` int NOT NULL,
	`checkItems` text,
	`usedMaterials` text,
	`beforePhotoUrl` text,
	`afterPhotoUrl` text,
	`customerSignatureUrl` text,
	`workMemo` text,
	`isCompleted` boolean NOT NULL DEFAULT false,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `branchId` int;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `estimateAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `estimateApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `completedAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `completionMemo` text;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `needsRevisit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `revisitReason` text;--> statement-breakpoint
ALTER TABLE `technicians` ADD `specialty` varchar(100);--> statement-breakpoint
ALTER TABLE `technicians` ADD `branchId` int;--> statement-breakpoint
ALTER TABLE `technicians` ADD `userId` int;