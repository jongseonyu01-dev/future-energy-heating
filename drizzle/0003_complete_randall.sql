CREATE TABLE `flow_rate_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`branchId` int,
	`apartmentName` varchar(100),
	`buildingNumber` varchar(20),
	`roomNumber` varchar(20),
	`flowRateLpm` decimal(6,2) NOT NULL,
	`supplyPressure` decimal(6,3),
	`returnPressure` decimal(6,3),
	`differentialPressure` decimal(6,3),
	`measuredAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('정상','주의','경고') NOT NULL DEFAULT '정상',
	`source` enum('WEBHOOK','DEMO') NOT NULL DEFAULT 'WEBHOOK',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flow_rate_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flow_rate_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`branchId` int,
	`apartmentName` varchar(100) NOT NULL,
	`buildingNumber` varchar(20) NOT NULL,
	`roomNumber` varchar(20) NOT NULL,
	`baseFlowRateLpm` decimal(6,2) NOT NULL DEFAULT '5.50',
	`warningRangePercent` int NOT NULL DEFAULT 30,
	`cautionRangePercent` int NOT NULL DEFAULT 15,
	`alertDurationMinutes` int NOT NULL DEFAULT 10,
	`lastFlowRateLpm` decimal(6,2),
	`lastSupplyPressure` decimal(6,3),
	`lastReturnPressure` decimal(6,3),
	`lastDifferentialPressure` decimal(6,3),
	`lastMeasuredAt` timestamp,
	`lastStatus` enum('정상','주의','경고') DEFAULT '정상',
	`alertStartedAt` timestamp,
	`alertSentAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flow_rate_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `flow_rate_settings_sensorId_unique` UNIQUE(`sensorId`)
);
--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `symptoms` text;