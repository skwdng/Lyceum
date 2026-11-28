-- ============================================================================
-- 一次性补丁：注册必填手机号（feature-register-phone，2026-11-28）
--
-- 背景：sy_user 新增 phone 列 + 唯一索引 ux_user_phone。
--       schema-mysql-full.sql 是 `create table if not exists`，**不会**给已存在的表补列，
--       所以已经在跑 MySQL 的环境（生产 120.24.204.138、本机容器）必须单独执行本文件。
--
-- ⚠️ 部署顺序：**先跑本脚本，再重启服务**。
--    反过来会直接炸：AuthRepo 的查询里带上了 phone，
--    旧库没有这一列时任何登录/注册/改密都是
--      java.sql.SQLSyntaxErrorException: Unknown column 'phone' in 'field list'
--    （不是「注册挂」，是整条认证链路挂）。
--
-- 用法（可重复执行，重复时的 Duplicate 报错由 --force 跳过）：
--   mysql -uroot -p siyige < patch-mysql-2026-11-28-phone.sql --force
--   容器：docker exec -i siyige-mysql mysql -uroot -p*** siyige < patch-mysql-2026-11-28-phone.sql --force
--
-- 安全性：只加列 + 加索引，不改不删任何既有数据；
--         存量用户 phone 为 NULL（唯一索引对多行 NULL 不生效，符合预期）。
-- ============================================================================

-- sy_user：手机号（varchar(20) 留出 +86 / 空格等展示余量；格式校验在应用层）
alter table sy_user add column phone varchar(20) default null;

-- 唯一索引：并发注册时由它兜底（应用层的 findByPhone 只是友好提示）
create unique index ux_user_phone on sy_user(phone);

-- ============================================================================
-- 验证：
--   show columns from sy_user like 'phone';                       -- 应有一行
--   show index from sy_user where Key_name='ux_user_phone';        -- 应有一行，Non_unique=0
-- ============================================================================
