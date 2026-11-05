-- =====================================================================
-- 社区 AI 助手（DeepSeek）· 账号与标记（2026-11-05 新增，V1）
-- 归属：com/siyige/community/ai/*
--
-- 为什么单开一个文件：协作规范 §6 规定**不许往既有 schema 里加东西**。
-- 本文件由 application.yml 的 schema-locations 末尾追加加载（排在 schema-notify.sql 之后）。
--
-- 设计要点（见 D:\siyige-v2\社区@AI-实现方案-v3.md）：
--   · AI 就是一个普通用户行：id = ai_deepseek、昵称 = DeepSeek、is_bot = 1
--   · password_hash 故意写成**不可解析的串**，配合 AuthService 的 is_bot 拦截
--     （拦截发生在密码校验之前，所以登录直接 401，不会因为哈希解析失败变 500）
-- =====================================================================

-- 所有用户行都有这一列：0 普通用户 / 1 AI 账号（前端据此显示「AI」徽章）
alter table sy_user add column if not exists is_bot tinyint not null default 0;

-- AI 账号种子：id 固定，重复执行不会重复插入（merge ... key(id)）
merge into sy_user (id, account, name, password_hash, status, is_bot)
key (id) values ('ai_deepseek', 'deepseek', 'DeepSeek', '!ai-account-no-login!', 1, 1);
