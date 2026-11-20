-- P1：模块浏览计数（HINCRBY 原子累加）
-- 首次创建时顺手打 TTL：PV 是"当天"的量，过期即丢，不需要长期存 Redis（落库才是长期数据）
-- KEYS[1] = pv:cnt:{yyyyMMdd}
-- ARGV[1] = module, ARGV[2] = delta, ARGV[3] = ttl 秒
local n = redis.call('HINCRBY', KEYS[1], ARGV[1], ARGV[2])
if n == tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return n
