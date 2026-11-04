const fs = require('fs');

// ---------- 1. AuthFilterConfig：把 /api/video/* 加进他的 register 体系 ----------
const p1 = 'D:\\siyige\\server\\src\\main\\java\\com\\siyige\\auth\\AuthFilterConfig.java';
let t = fs.readFileSync(p1, 'utf8').replace(/\r\n/g, '\n');

// 解决冲突块：保留他的实现（register + Scope），把视频路径挂进去
const conflict = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/;
const m = t.match(conflict);
if (m) {
  t = t.replace(conflict, m[1].trimEnd() + '\n');
  console.log('AuthFilterConfig 冲突已按他的实现解决');
}

// 在他的 community 注册之后，加一条视频注册（读匿名、写要登录）
const anchor = `    @Bean
    public FilterRegistrationBean<JwtAuthFilter> communityJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                   UserStatusSource userStatus) {
        return register("communityJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.COMMUNITY, "/api/community/*");
    }`;

const added = anchor + `

    /**
     * 视频模块（辩论短视频）。
     *
     * <p>与社区同构：**浏览匿名可看、写操作要登录**——广场/详情不登录也能刷，
     * 发布、点赞、评论必须登录。用 COMMUNITY 作用域即可（规则一致）。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> videoJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                UserStatusSource userStatus) {
        return register("videoJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.COMMUNITY, "/api/video/*");
    }`;

if (t.includes(anchor) && !t.includes('videoJwtFilter')) {
  t = t.replace(anchor, added);
  console.log('已加 videoJwtFilter');
} else if (t.includes('videoJwtFilter')) {
  console.log('videoJwtFilter 已存在');
} else {
  console.log('未找到 community 注册锚点，需人工处理');
}

fs.writeFileSync(p1, t, 'utf8');

// ---------- 2. application.yml：两份 schema 列表合并 ----------
const p2 = 'D:\\siyige\\server\\src\\main\\resources\\application.yml';
let y = fs.readFileSync(p2, 'utf8').replace(/\r\n/g, '\n');
const c2 = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/;
const m2 = y.match(c2);
if (m2) {
  const theirs = m2[1].trimEnd();          // 他的：schema, community, auth, admin, security
  const merged = theirs.replace(
    'schema-community.sql',
    'schema-community.sql,classpath:schema-video.sql'
  );
  y = y.replace(c2, merged + '\n');
  console.log('schema-locations 已合并');
} else {
  console.log('application.yml 无 schema 冲突');
}
fs.writeFileSync(p2, y, 'utf8');

console.log('剩余冲突标记:', /<<<<<<<|>>>>>>>/.test(fs.readFileSync(p1,'utf8') + fs.readFileSync(p2,'utf8')) ? '有' : '无');
