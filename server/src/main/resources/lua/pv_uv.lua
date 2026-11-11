-- P1：去重计数（HyperLogLog）。UV 与 DAU 共用：
--   UV  KEYS=pv:uv:{yyyyMMdd}:{module}  ARGV=userId
--   DAU KEYS=act:dau:{yyyyMMdd}          ARGV=userId
-- HLL 只做"有没有这个人"，重复 PFADD 不会重复计数（所以 @Active 多点打点也不会虚高）
-- KEYS[1] = 目标 HLL
-- ARGV[1] = 成员（userId）, ARGV[2] = ttl 秒
local exists = redis.call('EXISTS', KEYS[1])
redis.call('PFADD', KEYS[1], ARGV[1])
if exists == 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 1
