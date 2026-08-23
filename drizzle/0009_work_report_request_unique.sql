-- 운영 적용 전 아래 결과가 0행인지 반드시 확인한다. 중복 행이 있으면
-- 임의 삭제/병합하지 않고 다음 UNIQUE DDL이 실패해 migration 전체를 중단한다.
SELECT `requestId`, COUNT(*) AS `duplicateCount`
FROM `work_reports`
GROUP BY `requestId`
HAVING COUNT(*) > 1;
--> statement-breakpoint
ALTER TABLE `work_reports`
  ADD CONSTRAINT `work_reports_request_id_unique` UNIQUE (`requestId`);
--> statement-breakpoint
ALTER TABLE `estimates` MODIFY COLUMN `status` enum(
  'pending','viewed','approved','rejected','expired','schedule_requested',
  'schedule_confirmed','converted','cancelled','inquiry_received','report_pending','sent'
) NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `estimate_message_logs` MODIFY COLUMN `sendStatus`
  enum('SUCCESS','FAILED','SKIPPED','REQUESTED') NOT NULL DEFAULT 'SKIPPED';
