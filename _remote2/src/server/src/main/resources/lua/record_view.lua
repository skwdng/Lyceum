-- R-COM-34: SADD 去重与 HINCRBY 计数必须在同一脚本内原子完成
-- KEYS[1] = view:seen:{postId}:{yyyyMMdd}
-- KEYS[2] = view:pending
-- ARGV[1] = userId
-- ARGV[2] = postId
-- ARGV[3] = 次日 02:00 的 epoch 秒
local added = redis.call('SADD', KEYS[1], ARGV[1])
redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[3]))
if added == 1 then
  redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
  redis.call('EXPIRE', KEYS[2], 7200)
end
return added
