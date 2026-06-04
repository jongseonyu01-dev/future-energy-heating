CREATE TABLE `repair_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestNumber` varchar(30) NOT NULL,
	`customerName` varchar(50) NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`apartmentName` varchar(100) NOT NULL,
	`dong` varchar(20) NOT NULL,
	`ho` varchar(20) NOT NULL,
	`requestType` enum('난방고장','배관청소') NOT NULL DEFAULT '난방고장',
	`symptom` enum('집전체가춥다','방일부만춥다','분배기에서물이샌다','온도조절기가작동하지않는다','난방비가많이나온다','배관청소가필요하다','기타문의') NOT NULL,
	`detailContent` text,
	`photoUrl` text,
	`preferredDate` varchar(20),
	`preferredTime` varchar(20),
	`status` enum('신규접수','기사배정대기','방문예정','작업진행중','견적승인대기','작업완료','재방문필요') NOT NULL DEFAULT '신규접수',
	`technicianId` int,
	`technicianName` varchar(50),
	`scheduledDate` varchar(20),
	`scheduledTime` varchar(20),
	`adminMemo` text,
	`inspectionResult` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repair_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `repair_requests_requestNumber_unique` UNIQUE(`requestNumber`)
);
--> statement-breakpoint
CREATE TABLE `technicians` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`phoneNumber` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `technicians_id` PRIMARY KEY(`id`)
);
