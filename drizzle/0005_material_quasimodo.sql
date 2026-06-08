CREATE TABLE `phone_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`code` varchar(6) NOT NULL,
	`purpose` varchar(20) NOT NULL DEFAULT 'signup',
	`verified` boolean NOT NULL DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phone_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `app_roles` ADD `name` varchar(50);--> statement-breakpoint
ALTER TABLE `app_roles` ADD `branchId` int;--> statement-breakpoint
ALTER TABLE `app_roles` ADD `mustChangePassword` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `estimateSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `workflowStage` enum('접수완료','지사배정','현장확인','견적작성','견적전달','견적승인','기사배정','일정확정','기사출발','기사도착','작업진행','작업완료','결제완료','후기요청') DEFAULT '접수완료' NOT NULL;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `reviewRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `repair_requests` ADD `scheduleChangeReason` text;