-- R-COM-35: 必须原子地「读取并清空」，不能 HGETALL 之后再单独 DEL
-- KEYS[1] = view:pending
local data = redis.call('HGETALL', KEYS[1])
if #data == 0 then
  return {}
end
redis.call('DEL', KEYS[1])
return data
