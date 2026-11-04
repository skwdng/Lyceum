const fs = require('fs');
const p = 'D:\\siyige\\server\\src\\main\\java\\com\\siyige\\auth\\RedisLoginRateLimiter.java';
let t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const conflict = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/;
const m = t.match(conflict);
if (!m) { console.log('无冲突'); process.exit(0); }

// 他的侧是空（@Component 已在冲突区上方），我的一侧是 @Component + @Conditional
const mine = m[2].trimEnd();
const theirs = m[1].trimEnd();

// 合并：保留 @Component（若上方已有则只用 Conditional），再保留我的 Conditional
const above = t.slice(0, t.indexOf('<<<<<<<'));
const hasComponentAbove = /@Component\s*$/.test(above.trimEnd());

let replacement = theirs ? theirs + '\n' : '';
replacement += '@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "true", matchIfMissing = true)\n';

t = t.replace(conflict, replacement);
fs.writeFileSync(p, t, 'utf8');
console.log('已合并。@Component 在上方:', hasComponentAbove);
console.log('剩余冲突:', /<<<<<<<|>>>>>>>/.test(t) ? '有' : '无');
