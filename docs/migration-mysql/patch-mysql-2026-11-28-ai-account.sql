-- ============================================================================
-- 增量补丁：AI 账号种子（2026-11-28）
--
-- ⚠️ 部署本分支（feature-mention-fix）**之前**，在目标库上先跑一次这个文件。
--
-- 背景（真 bug，不是漏做）：H2 的 schema-ai.sql 末尾有一条 `merge into … key(id)` 种子，
-- 把词表翻成 schema-mysql-full.sql 时机械翻译只认 DDL，这条 insert 被整条丢掉了 ——
-- MySQL 库里的 sy_user 没有 ai_deepseek 这一行，于是：
--   · @ 候选里永远搜不到 DeepSeek（它压根不是一行 user）
--   · 前端只认「从弹层里点选过的人」，手打 @DeepSeek 不算 → mentions 里没有 ai_deepseek
--   · AiQueue 的第二道闸要求「正文含 @DeepSeek 且 mentions 含 ai_deepseek」→ 永远不进队
-- 结果整个 @AI 功能在 MySQL 上等于不存在（H2 单测里却是好的，所以一直没被发现）。
--
-- 幂等：insert … select … where not exists，重复执行不会多出行（MySQL 8 实测连跑两次 count 恒为 1）。
-- 与做 phone 加列的 patch-mysql-2026-11-28-phone.sql 互不依赖，两个都要跑。
-- ============================================================================

insert into sy_user(id, account, name, password_hash, status, is_bot)
select 'ai_deepseek', 'deepseek', 'DeepSeek', '!ai-account-no-login!', 1, 1
where not exists (select 1 from sy_user where id = 'ai_deepseek');

-- 自检（期望 1 行、is_bot=1）：
--   select id, account, name, is_bot from sy_user where id = 'ai_deepseek';
