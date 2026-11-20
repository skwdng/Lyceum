-- ============================================================================
-- Lyceum 辩论主链路 13 张 sy_ 表 —— MySQL 8 方言版
-- 用途：默认 profile（MySQL）启动时由 spring.sql.init 自举建表；纯加法，不删表不改数据。
-- 对照：server/src/main/resources/schema.sql（H2 方言版，h2 profile 仍用它，本文件不改它）
-- 说明：本文件不含 ALTER 补列。已有旧快照的库请先跑
--       db/mysql/patch-mysql-2026-11-02.sql（一次性，把 2026-11-01/02 的增量补上）。
-- ============================================================================

create table if not exists sy_user (
  id         varchar(32) primary key,
  name       varchar(64),
  created_at datetime default current_timestamp
) engine=InnoDB default charset=utf8mb4 comment='用户（R-COM-03：社区只取昵称）';

create table if not exists sy_topic (
  id           varchar(32) primary key,
  title        varchar(200),
  cat          varchar(32),
  diff         varchar(16),
  source       varchar(16) default 'official',
  plays        int default 0,
  mod_status   varchar(16) default 'PASS',
  mod_reason   varchar(300),
  mod_at       datetime,
  title_hash   varchar(64)
) engine=InnoDB default charset=utf8mb4 comment='辩题';

create table if not exists sy_match (
  id           varchar(40) primary key,
  user_id      varchar(32),
  topic_id     varchar(32),
  topic_title  varchar(200),
  mode         varchar(16) comment 'FULL | SPRINT | DRILL',
  my_seats     varchar(40),
  step         int default 0,
  status       varchar(16) comment 'RUNNING | REVIEW | FINISHED | FAILED',
  deadline_at  datetime,
  started_at   datetime default current_timestamp,
  finished_at  datetime,
  total_score  int,
  turn_sec     int default 0,
  pace         varchar(8) default 'normal',
  extend_count int default 0,
  warned       boolean default false,
  difficulty   varchar(8) default 'pro',
  phase        varchar(8) default 'STEP',
  buzz_seat    varchar(4),
  kind         varchar(8) default 'solo'
) engine=InnoDB default charset=utf8mb4 comment='对局';

create table if not exists sy_turn (
  id         bigint not null auto_increment primary key,
  match_id   varchar(40),
  step       int,
  seat       varchar(4),
  seg        varchar(16),
  content    varchar(4000),
  status     varchar(16) comment 'OK | TIMEOUT',
  input_type varchar(16) comment 'kb | voice | skipped | timeout',
  created_at datetime default current_timestamp,
  key ix_turn (match_id, step)
) engine=InnoDB default charset=utf8mb4 comment='发言轮次';

create table if not exists sy_audit (
  id          bigint not null auto_increment primary key,
  title       varchar(200),
  title_hash  varchar(64),
  result      varchar(16),
  reason      varchar(300),
  suggestions varchar(600),
  cached      boolean default false,
  created_at  datetime default current_timestamp
) engine=InnoDB default charset=utf8mb4 comment='辩题审核缓存';

create table if not exists sy_record (
  id          bigint not null auto_increment primary key,
  user_id     varchar(32),
  match_id    varchar(40),
  topic_title varchar(200),
  seats       varchar(40),
  total       int,
  turns       int,
  created_at  datetime default current_timestamp
) engine=InnoDB default charset=utf8mb4 comment='辩论记录';

create table if not exists sy_diag (
  user_id    varchar(32) primary key,
  dims_json  varchar(600),
  flaws_json varchar(600),
  streak     int default 0,
  updated_at datetime default current_timestamp,
  samples    int default 0,
  last_json  varchar(600)
) engine=InnoDB default charset=utf8mb4 comment='能力画像（滑动平均 + 场次样本）';

create table if not exists sy_event (
  id         bigint not null auto_increment primary key,
  match_id   varchar(40),
  seq        int,
  type       varchar(32),
  payload    varchar(4000),
  created_at datetime default current_timestamp
) engine=InnoDB default charset=utf8mb4 comment='对局事件（SSE 回放）';

create table if not exists sy_room (
  code         varchar(16) primary key,
  topic_id     varchar(32),
  topic_title  varchar(200),
  visibility   varchar(16) default 'public',
  host_user    varchar(32),
  status       varchar(16) default 'LOBBY',
  match_id     varchar(40),
  created_at   datetime default current_timestamp
) engine=InnoDB default charset=utf8mb4 comment='多人房间';

create table if not exists sy_seat (
  room_code  varchar(16),
  seat_key   varchar(4),
  side       varchar(2),
  role       varchar(8),
  occupant   varchar(8) default 'EMPTY',
  user_id    varchar(32),
  user_name  varchar(64),
  ready      boolean default false,
  primary key (room_code, seat_key)
) engine=InnoDB default charset=utf8mb4 comment='房间席位';

create table if not exists sy_evidence (
  id       varchar(32) primary key,
  topic_id varchar(32),
  side     varchar(2) comment 'A 正方 / B 反方 / C 双方可用',
  claim    varchar(300),
  source   varchar(200),
  pub_year int,
  verified boolean default false,
  tags     varchar(100),
  key ix_ev_topic (topic_id)
) engine=InnoDB default charset=utf8mb4 comment='论据库';

create table if not exists sy_flaw (
  id         bigint not null auto_increment primary key,
  match_id   varchar(40),
  step       int,
  type       varchar(16),
  hit        boolean comment 'null = 未作答',
  created_at datetime default current_timestamp
) engine=InnoDB default charset=utf8mb4 comment='抓漏判定';

create table if not exists sy_brief (
  topic_id   varchar(32),
  side       varchar(8),
  content    varchar(4000),
  created_at datetime default current_timestamp,
  primary key (topic_id, side)
) engine=InnoDB default charset=utf8mb4 comment='赛前材料包（作战卡）';
