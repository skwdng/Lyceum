#!/usr/bin/env node
import { phoneFor } from './_phone.mjs';
/**
 * MySQL 功能回归（mysql profile 下跑）。
 *
 * 用法：
 *   1. 起服务：mvn spring-boot:run -Dspring-boot.run.profiles=mysql
 *   2. node scripts/selftest_mysql.mjs [baseUrl]
 *
 * 覆盖：社区（发帖/标签/评论/楼中楼/点赞/举报/打码）、视频、钱包、对局、
 *       管理台（概览/报表/内容/用户/举报/标签/视频复核/辩题/审计/参数/屏蔽词/告警）、
 *       以及两条热更（参数限签、屏蔽词打码）不重启生效。
 *
 * 2026-11-27 首次跑：44 条全绿（H2 与 MySQL 各一套接口，这里只跑 mysql profile）。
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8080';
const j=async(m,p,b,t)=>{const r=await fetch(BASE+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:b?JSON.stringify(b):undefined});const x=await r.text();let o=null;try{o=x?JSON.parse(x):null}catch{o=x}return{s:r.status,body:o}};
const ok=[]; const bad=[];
const check=(name,cond,extra='')=>{ if(cond) ok.push(name); else bad.push(name+(extra?' ['+extra+']':'')); };

const stamp=Math.floor(Math.random()*900000)+10000;
const acc='rg'+stamp;
const reg=await j('POST','/api/auth/register',{ account: acc, password: 'abc12345', phone: phoneFor(acc) });
check('注册', reg.s===200 && reg.body.token, reg.s);
const tok=reg.body.token;

// ---------- 社区 ----------
const topics=(await j('GET','/api/topics',null,tok)).body;
check('辩题列表', Array.isArray(topics)&&topics.length>0, topics.length);
const t1='标签甲'+stamp, t2='标签乙'+stamp;
const p=await j('POST','/api/community/posts',{type:'CHAT',title:'MySQL回归帖'+stamp,body:'正文里有敏感词 加微信 看看打码，其余正常内容足够长。',tags:[t1,t2]},tok);
check('发帖', p.s===200 && p.body.postId, p.s);
const pid=p.body.postId;
const detail=await j('GET','/api/community/posts/'+pid,null,tok);
check('帖子详情', detail.s===200, detail.s);
check('敏感词打码', !String(detail.body.body).includes('加微信'), String(detail.body.body).slice(0,20));
check('标签回显', (detail.body.tags||[]).length===2, JSON.stringify(detail.body.tags||[]));
const chat=(await j('GET','/api/community/posts?tagId='+((detail.body.tags||[])[0]||{}).id+'&size=5',null,tok));
check('按标签筛选', chat.s===200 && (chat.body.items||[]).length>=1, chat.s);
const hot=await j('GET','/api/community/tags/hot',null,tok);
check('热门标签', hot.s===200, hot.s);

// 评论 + 楼中楼
const c1=await j('POST','/api/community/posts/'+pid+'/comments',{body:'一楼评论'+stamp},tok);
check('发评论', c1.s===200 && c1.body.commentId, c1.s);
const cid=c1.body.commentId;
const c2=await j('POST','/api/community/posts/'+pid+'/comments',{body:'楼中楼回复',replyObjectType:'COMMENT',replyObjectCommentId:cid},tok);
check('楼中楼回复', c2.s===200, c2.s);
const clist=await j('GET','/api/community/posts/'+pid+'/comments?size=10',null,tok);
check('评论列表', clist.s===200 && (clist.body.items||[]).length>=1, clist.s+'/'+JSON.stringify((clist.body||{}).items||[]).length);

// 点赞 / 举报
const likeOk=(s)=>s===200||s===204;
check('点赞帖子', likeOk((await j('POST','/api/community/posts/'+pid+'/like',null,tok)).s));
check('点赞评论', likeOk((await j('POST','/api/community/comments/'+cid+'/like',null,tok)).s));
// 举报必须用另一个账号（不能举报自己的内容）
const reg2=await j('POST','/api/auth/register',{ account: 'rg2'+stamp, password: 'abc12345', phone: phoneFor('rg2'+stamp) });
const tok2=reg2.body.token;
const rep=await j('POST','/api/community/reports',{targetType:'POST',targetId:Number(pid),reason:'SPAM',detail:'回归测试'},tok2);
check('举报(他人内容)', rep.s===200, rep.s);
check('我的举报', (await j('GET','/api/community/my-reports',null,tok)).s===200);

// ---------- 视频 ----------
const v=await j('POST','/api/video/videos',{title:'MySQL回归视频'+stamp,description:'描述够长了吧哈哈哈哈',url:'https://example.com/r.mp4',topic:'测试辩题',segment:'立论',side:'A'},tok);
check('视频上传', v.s===200 && v.body.videoId, v.s);
check('视频走机器审核', v.body.auditStatus==='REVIEW'||v.body.auditStatus==='PASSED'||v.body.auditStatus==='REJECTED', v.body.auditStatus);
check('视频流', (await j('GET','/api/video/feed?size=5',null,tok)).s===200);

// ---------- 钱包 ----------
const w=await j('GET','/api/wallet',null,tok);
check('钱包', w.s===200 && typeof w.body.balanceCents==='number', w.s);
check('钱包报价', w.body.centsPer1kTokens>0 && w.body.serviceFeeCents>0, JSON.stringify(w.body).slice(0,60));

// ---------- 对局 ----------
const m=await j('POST','/api/matches',{mode:'FULL',seats:['A1','B1'],topicId:topics[0].id,kind:'room'},tok);
check('开局', m.s===200 && m.body.matchId, m.s);
const mid=m.body.matchId;
const tn=await j('POST','/api/matches/'+mid+'/turns',{content:'我方认为算法推荐并不等于信息茧房'},tok);
check('提交发言', tn.s===200, tn.s);
check('对局详情', (await j('GET','/api/matches/'+mid,null,tok)).s===200);
check('对战记录', (await j('GET','/api/records',null,tok)).s===200);

// ---------- 管理台 ----------
const adm=(await j('POST','/api/admin/auth/login',{account:'admin',password:'admin123'})).body.token;
check('管理员登录', !!adm);
check('概览', (await j('GET','/api/admin/stats?days=7',null,adm)).s===200);
check('报表-模块', (await j('GET','/api/admin/analytics/modules?days=7',null,adm)).s===200);
check('报表-趋势', (await j('GET','/api/admin/analytics/trend?days=7',null,adm)).s===200);
check('报表-活跃', (await j('GET','/api/admin/analytics/active?days=7',null,adm)).s===200);
check('内容-帖子列表', (await j('GET','/api/admin/posts?size=5',null,adm)).s===200);
check('内容-评论列表', (await j('GET','/api/admin/comments?size=5',null,adm)).s===200);
check('用户列表', (await j('GET','/api/admin/users?size=5',null,adm)).s===200);
check('举报列表', (await j('GET','/api/admin/reports?size=5',null,adm)).s===200);
check('标签管理', (await j('GET','/api/admin/tags?size=5',null,adm)).s===200);
check('视频复核队列', (await j('GET','/api/admin/video-audit/queue',null,adm)).s===200);
check('视频审核规则', (await j('GET','/api/admin/video-audit/rules',null,adm)).s===200);
check('辩题审核', (await j('GET','/api/admin/topics?size=5',null,adm)).s===200);
check('审计列表', (await j('GET','/api/admin/audit?size=5',null,adm)).s===200);
check('参数列表(24)', ((await j('GET','/api/admin/config',null,adm)).body.items||[]).length===24);
check('屏蔽词列表', (await j('GET','/api/admin/words?scope=COMMUNITY&size=5',null,adm)).s===200);
const scan=await j('POST','/api/admin/alerts/scan',null,adm);
check('告警扫描', scan.s===200, scan.s);
check('告警列表', (await j('GET','/api/admin/alerts?status=OPEN',null,adm)).s===200);

// 参数热更（不重启）
const set1=await j('POST','/api/admin/config',{key:'tag.max-per-post',value:'2'},adm);
const p3=await j('POST','/api/community/posts',{type:'CHAT',title:'三标签'+stamp,body:'正文够长了哈哈哈哈哈哈',tags:['x'+stamp,'y'+stamp,'z'+stamp]},tok);
check('参数热更生效(限2拒3)', set1.s===200 && p3.s===400 && p3.body.code==='TAG_LIMIT', set1.s+'/'+p3.s);
await j('POST','/api/admin/config',{key:'tag.max-per-post',value:'5'},adm);

// 屏蔽词热更（不重启）
const w1=await j('POST','/api/admin/words',{scope:'COMMUNITY',words:['回归词'+stamp]},adm);
const pw=await j('POST','/api/community/posts',{type:'CHAT',title:'词热更'+stamp,body:'这里写回归词'+stamp+'看是否打码'},tok);
const dw=await j('GET','/api/community/posts/'+pw.body.postId,null,tok);
check('屏蔽词热更生效', w1.s===200 && !String(dw.body.body).includes('回归词'+stamp), w1.s);

console.log('通过 ' + ok.length + ' / 失败 ' + bad.length);
bad.forEach(b => console.log('  FAIL ' + b));
process.exit(bad.length === 0 ? 0 : 1);
