-- ============================================================================
-- 模块浏览 / 日活统计（管理台重构 P1：采集侧）
--
-- 只新建两张表，**不动任何既有表结构**：
--   · schema*.sql 一行不改，本文件是独立新增
--   · 两张表都只由定时任务写（实时计数在 Redis），管理台报表（P3）只读
--
-- 顺序要求：application.yml 的 schema-locations 里本文件排在**最后**
-- （语义上依赖 schema.sql / schema-auth.sql 已建好 sy_user.created_at）。
--
-- 口径（设计文档 §1 / §2）：
--   · module 是「模块」不是「页面路径」，共 11 个，白名单在 TrackService.MODULES
--   · pv = 浏览次数；uv = 去重人数（Redis HyperLogLog，落库时取 greatest，不能累加）
--   · 不做历史回填：现在还没有历史数据，H2 内存库一重启就空
--
-- ⚠️ 列名用 day_key 而不是设计文档初稿里的 day：`DAY` 是 H2 2.x 的保留字
--    （create table 时直接报 "expected identifier"），而用 "day" 加引号会让 MySQL 不兼容。
--    day_key 两边都通用，语义也更清楚（它就是 Redis key 里那个 yyyyMMdd）。
-- ============================================================================

create table if not exists sy_module_view (
  day_key    date        not null,
  module     varchar(24) not null,
  pv         bigint      not null default 0,
  uv         bigint      not null default 0,
  updated_at timestamp   not null default current_timestamp,
  primary key (day_key, module)
);

-- 日活：dau 来自 Redis 的 act:dau:{yyyyMMdd}（HyperLogLog），new_users 来自 sy_user.created_at
create table if not exists sy_daily_active (
  day_key   date primary key,
  dau       int  not null default 0,
  new_users int  not null default 0
);

-- ============================================================================
-- 报表查询用到的索引（设计文档 §5.4）
--
-- 与设计初稿的两处差异，都是照着真实表结构来的：
--   · sy_match 没有 created_at，开局时间列叫 started_at；
--   · sy_post **不再重复建** ix_post_created —— 已有 ix_post_new(status, created_at)
--     和 ix_post_type(status, type, created_at)，报表的「status=1 + 时间区间」正好走它们，
--     再建一条 (created_at) 只会多占写入成本。
-- ============================================================================

create index if not exists ix_match_started  on sy_match(started_at);
create index if not exists ix_user_created   on sy_user(created_at);
create index if not exists ix_tx_created     on sy_wallet_tx(created_at);
create index if not exists ix_report_created on sy_report(created_at);
create index if not exists ix_turn_created   on sy_turn(created_at);
create index if not exists ix_record_created on sy_record(created_at);
