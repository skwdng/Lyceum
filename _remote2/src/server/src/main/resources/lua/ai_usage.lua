-- 社区 AI 的自然日限额：原子「判断 + 计数」（方案 §6）
-- KEYS[1] = ai:usage:yyyy-MM-dd
-- ARGV[1] = 上限（5）   ARGV[2] = userId   ARGV[3] = TTL 秒（86400）
--
-- 返回：-1 = 今天已经用满，**不扣**；>=1 = 本次是第几次
--
-- 为什么必须 Lua：「判断是否超限」和「加一」分两条命令做，两个并发请求会同时通过（超卖）。

local n = tonumber(redis.call('HGET', KEYS[1], ARGV[2]) or '0')
if n >= tonumber(ARGV[1]) then
  return -1
end

n = redis.call('HINCRBY', KEYS[1], ARGV[2], 1)
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return n
