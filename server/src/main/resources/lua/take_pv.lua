-- P1：必须原子地「读取并清空」，不能 HGETALL 之后再单独 DEL
-- （照 community/lua/flush_views.lua 的写法：中途崩溃宁可少一次落库，也不要重复累加）
-- KEYS[1] = pv:cnt:{yyyyMMdd}
local data = redis.call('HGETALL', KEYS[1])
if #data == 0 then
  return {}
end
redis.call('DEL', KEYS[1])
return data
