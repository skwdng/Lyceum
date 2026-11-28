-- ============================================================================
-- 登录模块（com.siyige.auth）的 sy_user 增量迁移
--
-- 只做 ALTER / CREATE INDEX，不重建表：
--   · schema.sql 归辩论方，一行不动（协作规范 §1）
--   · sy_user.name 已存在于 schema.sql，继续作为「昵称」列使用
--   · 密码用算法自带盐，**不建 salt 列**；password_hash 是完整的
--     $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash> 串（约 95-120 字符）
--   · account 唯一索引：并发注册靠它兜底（捕获唯一键冲突 -> 409 ACCOUNT_TAKEN）
--
-- 顺序要求：application.yml 的 schema-locations 里本文件必须排在 schema.sql 之后
-- （先建 sy_user，才能 ALTER）。
-- 将来切 MySQL 时，把下面三条 ALTER 合进 MySQL 版 DDL 即可。
-- ============================================================================

alter table sy_user add column if not exists account       varchar(64);
alter table sy_user add column if not exists password_hash varchar(255);
alter table sy_user add column if not exists status        tinyint default 1;

-- 手机号（2026-11-28 起注册必填）：**允许 NULL** —— 存量老账号没有手机号，
-- 加 NOT NULL 会直接把它们卡死（登录/改名/改密都会失败）。
-- 唯一索引对 NULL 不生效（H2 / MySQL 都是多行 NULL 合法），所以老用户可以有多个 NULL。
alter table sy_user add column if not exists phone         varchar(20);

create unique index if not exists ux_user_account on sy_user(account);
create unique index if not exists ux_user_phone   on sy_user(phone);
