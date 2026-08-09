CREATE TABLE `active_timer` (
	`id` integer PRIMARY KEY NOT NULL,
	`project_id` integer NOT NULL,
	`state` text NOT NULL,
	`started_at` text NOT NULL,
	`last_resumed_at` text,
	`paused_at` text,
	`accumulated_seconds` integer DEFAULT 0 NOT NULL,
	`accumulated_pause_seconds` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`default_budget_minutes` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`color` text DEFAULT '#52647D' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`budget_minutes` integer NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `time_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`effective_seconds` integer NOT NULL,
	`pause_seconds` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`is_manual_adjusted` integer DEFAULT 0 NOT NULL,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `categories` (`id`,`name`,`default_budget_minutes`,`sort_order`,`is_active`,`color`,`created_at`,`updated_at`) VALUES
(1,'内容制作',120,10,1,'#0F766E','2026-07-11 09:35:26','2026-07-11 09:35:26'),
(2,'茶叶实务',120,20,1,'#3F7D20','2026-07-11 09:35:26','2026-07-11 09:35:26'),
(3,'客户对接',120,30,1,'#7C3AED','2026-07-11 09:35:26','2026-07-11 09:35:26'),
(4,'资料整理',120,40,1,'#2563A6','2026-07-11 09:35:26','2026-07-11 09:35:26'),
(5,'学习研究',120,50,1,'#B45309','2026-07-11 09:35:26','2026-07-11 09:35:26'),
(6,'运营事务',120,60,1,'#BE185D','2026-07-11 09:35:26','2026-07-11 09:35:26'),
(7,'其他',120,70,1,'#475569','2026-07-11 09:35:26','2026-07-11 09:35:26');
--> statement-breakpoint
INSERT INTO `projects` (`id`,`name`,`category_id`,`priority`,`status`,`budget_minutes`,`progress_percent`,`notes`,`is_archived`,`created_at`,`updated_at`) VALUES
(1,'量化学习',7,'medium','active',60000,0,'',0,'2026-08-07T03:02:54+00:00','2026-08-09T02:46:30+00:00');
--> statement-breakpoint
INSERT INTO `time_sessions` (`id`,`project_id`,`started_at`,`ended_at`,`effective_seconds`,`pause_seconds`,`notes`,`is_manual_adjusted`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1,1,'2026-08-07T01:15:35+00:00','2026-08-07T03:27:58+00:00',7943,0,'',1,0,'2026-08-07T03:27:58+00:00','2026-08-07T03:28:28+00:00'),
(2,1,'2026-08-07T03:28:47+00:00','2026-08-07T03:29:00+00:00',12,1,'',0,0,'2026-08-07T03:29:00+00:00','2026-08-07T03:29:00+00:00'),
(3,1,'2026-08-09T02:24:09+00:00','2026-08-09T02:46:30+00:00',1341,0,'',0,0,'2026-08-09T02:46:30+00:00','2026-08-09T02:46:30+00:00');
--> statement-breakpoint
INSERT INTO `settings` (`key`,`value_json`,`updated_at`) VALUES
('display_name','"内容工作台"','2026-07-11T09:57:18+00:00'),
('show_seconds','true','2026-07-11T09:57:18+00:00'),
('default_sort','"priority"','2026-07-11T09:57:18+00:00'),
('near_budget_percent','80','2026-07-11T09:35:26+00:00'),
('long_session_warning_minutes','120','2026-07-11T09:35:26+00:00'),
('auto_backup_enabled','true','2026-07-11T09:35:26+00:00'),
('backup_retention_count','30','2026-07-11T09:35:26+00:00'),
('report_output_directory','"G:\\我的云端硬盘\\内容工作台\\Reports"','2026-07-11T09:35:26+00:00'),
('start_with_windows','true','2026-07-11T09:57:18+00:00');
