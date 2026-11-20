-- 标已读时的原子递减（决策：未读是「按会话拆」的计数缓存，不能减成负数）
-- KEYS[1] = social:unread:{userId}      Hash，field = convId，value = 未读条数
-- ARGV[1] = convId
-- ARGV[2] = 这次读掉的条数
--
-- 返回：递减后剩余的条数（0 = 已清空，field 被删掉）
--
-- 为什么要 Lua：HGET 出来减、再 HSET/HDEL 分三条命令做，多端同时标已读会互相覆盖
-- （典型现象是角标减到 0 又跳回 2）。整段原子执行才是对的。

local key   = KEYS[1]
local field = ARGV[1]
local delta = tonumber(ARGV[2])

local cur  = tonumber(redis.call('HGET', key, field) or '0')
local left = cur - delta

if left <= 0 then
  redis.call('HDEL', key, field)
  return 0
end

redis.call('HSET', key, field, left)
return left
