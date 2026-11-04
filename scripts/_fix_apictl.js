const fs = require('fs');
const p = 'D:\\siyige\\server\\src\\main\\java\\com\\siyige\\api\\ApiController.java';
let t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// 冲突 1：字段 —— 两边都保留
const c1 = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/;

let m = t.match(c1);
if (m) {
  const theirs = m[1].trimEnd();   // matchAccess 字段 + 注释
  const mine = m[2].trimEnd();     // llm 字段
  t = t.replace(c1, theirs + '\n' + mine + '\n');
  console.log('冲突1（字段）已合并');
}

// 冲突 2：构造函数体 + guard 方法 —— 保留他的 guard，同时加 llm 赋值
m = t.match(c1);
if (m) {
  const theirs = m[1].trimEnd();   // this.brief/this.matchAccess + guard 方法
  const mine = m[2].trimEnd();     // this.brief = brief; this.llm = llm;
  // 他的块以 guard 方法结尾，没闭合类的 }；我的块是两条赋值
  const merged = `        this.brief = brief;
        this.llm = llm;
        this.matchAccess = matchAccess;
    }

    /**
     * 两个统一入口之一：**身份 + 归属**一次做完。
     *
     * <p>所有 {@code /matches/&#123;id&#125;/**} 端点第一行都调它：
     * 未登录 → 401（过滤器已兜底，这里再兜一次），不是这场的人 → 403 FORBIDDEN。
     */
    private String guard(String matchId) {
        String userId = UserContext.requireId();
        matchAccess.requireAccess(matchId, userId);
        return userId;`;
  t = t.replace(c1, merged + '\n');
  console.log('冲突2（构造 + guard）已合并');
}

fs.writeFileSync(p, t, 'utf8');
console.log('剩余冲突标记:', /<<<<<<<|>>>>>>>/.test(t) ? '有' : '无');
