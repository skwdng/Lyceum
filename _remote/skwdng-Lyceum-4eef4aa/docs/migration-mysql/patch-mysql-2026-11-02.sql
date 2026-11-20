-- ============================================================================
-- 一次性补丁：把「2026-11-01 / 2026-11-02 两次增补」补进已有的旧 MySQL 库
-- 背景：schema.sql 末尾的 alter table ... add column if not exists 是 H2 语法，
--       MySQL 不支持 ADD COLUMN IF NOT EXISTS，所以旧库需要本文件补一次。
-- 用法：mysql -uroot -p siyige < patch-mysql-2026-11-02.sql --force
--       （新库不用跑：db/mysql/schema-mysql.sql 已含全部列）
-- 安全性：只加列 / 加表 / 加索引，不删不改任何既有数据。
-- ============================================================================

-- sy_match：2026-11-01 每步时长
alter table sy_match add column turn_sec int default 0;
-- sy_diag：画像改为滑动平均 + 场次样本
alter table sy_diag add column samples int default 0;
alter table sy_diag add column last_json varchar(600);
-- sy_match：2026-11-02 弹性节奏
alter table sy_match add column pace varchar(8) default 'normal';
alter table sy_match add column extend_count int default 0;
alter table sy_match add column warned boolean default false;
-- sy_match：抓漏判定 + 陪练难度
alter table sy_match add column difficulty varchar(8) default 'pro';
-- sy_match：2026-11-02 自由辩抢拍
alter table sy_match add column phase varchar(8) default 'STEP';
alter table sy_match add column buzz_seat varchar(4);
-- sy_match：单人/多人节奏分离
alter table sy_match add column kind varchar(8) default 'solo';

-- 2026-11-02 抓漏判定表
create table if not exists sy_flaw (
  id         bigint not null auto_increment primary key,
  match_id   varchar(40),
  step       int,
  type       varchar(16),
  hit        boolean,
  created_at datetime default current_timestamp
) engine=InnoDB default charset=utf8mb4;

-- 2026-11-02 赛前材料包（作战卡）
create table if not exists sy_brief (
  topic_id   varchar(32),
  side       varchar(8),
  content    varchar(4000),
  created_at datetime default current_timestamp,
  primary key (topic_id, side)
) engine=InnoDB default charset=utf8mb4;

-- 论据库（旧库可能缺）
create table if not exists sy_evidence (
  id       varchar(32) primary key,
  topic_id varchar(32),
  side     varchar(2),
  claim    varchar(300),
  source   varchar(200),
  pub_year int,
  verified boolean default false,
  tags     varchar(100)
) engine=InnoDB default charset=utf8mb4;
create index ix_ev_topic on sy_evidence(topic_id);

-- 轮次索引（旧库可能缺）
create index ix_turn on sy_turn(match_id, step);
