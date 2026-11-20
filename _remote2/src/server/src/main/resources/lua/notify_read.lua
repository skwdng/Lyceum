-- 拉列表时把「本页实际标记的条数」从 Redis 角标里原子减掉（方案 §5.1）
-- KEYS[1] = notify:unread   ARGV[1] = userId   ARGV[2] = 本页标记条数 n
--
-- 返回：-1 = 本来没有该 field（Redis 重启过 / 本来为 0）→ 调用方什么都不做
--        0 = 减到 ≤0，field 已删除（红点消失）
--       >0 = 剩余未读数
--
-- 为什么必须用 Lua：HGET 与 HSET 两步之间会被并发请求插进来，两个人同时翻页会把数字算错。

local cur = redis.call('HGET', KEYS[1], ARGV[1])
if not cur then return -1 end

local v = tonumber(cur) - tonumber(ARGV[2])
if v <= 0 then
  redis.call('HDEL', KEYS[1], ARGV[1])
  return 0
end

redis.call('HSET', KEYS[1], ARGV[1], v)
return v
