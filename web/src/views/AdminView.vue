<script setup>
/**
 * 管理后台（等价旧 admin.html + admin.js）。
 *
 * 与主站是**两个 app**：自己的令牌（localStorage['sy_admin_jwt']）、自己的前缀（/api/admin）、
 * 自己的布局（没有侧栏，route meta.bare 直接渲染）。所以这里不 import 主站的 auth store。
 *
 * 与旧版一致的行为：
 * · 登录失败/401 才清令牌；改密码属于表单校验，400 不该把人踢下线（keepLogin）；
 * · 举报按「多人举报 / 目标已删除」打标，一次处理会连带同一目标的其他举报；
 * · 审计记录可「一键恢复」（二次确认：恢复意味着内容重新可见，禁言不会一并解除）；
 * · 用户页可禁言 N 天 / 解禁 / 全站封禁（封禁要二次确认）。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi, getAdminToken, setAdminToken, ApiError } from '../api.js';
import { toast } from '../utils/toast.js';

const router = useRouter();

const logged = ref(!!getAdminToken());
const account = ref('');
const password = ref('');
const busy = ref(false);

const tab = ref('reports');
const stats = ref(null);

const reports = ref(null);
const reportStatus = ref('PENDING');
const detail = ref(null);
const note = ref('');
const banDays = ref(7);

const audit = ref(null);
const users = ref(null);
const usersQ = ref('');
const banDaysByUser = ref({});

const pwdOpen = ref(false);
const pwdOld = ref('');
const pwdNew = ref('');
const pwdNew2 = ref('');

const pendingCount = computed(() => (stats.value && stats.value.pendingReports) || 0);

function errText(e) {
  if (e instanceof ApiError) return e.message || e.code;
  return (e && e.message) || '操作失败';
}

function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function reasonName(k) {
  const m = { SPAM: '垃圾广告', ABUSE: '人身攻击', ILLEGAL: '违法违规', OTHER: '其他' };
  return m[k] || k;
}

function actionName(k) {
  const m = { IGNORE: '忽略', DELETE: '删除内容', BAN: '禁言', DELETE_AND_BAN: '删除并禁言', RESTORE: '撤销处理' };
  return m[k] || k;
}

function onUnauthorized() {
  setAdminToken('');
  logged.value = false;
  toast('登录已失效，请重新登录');
}

onMounted(() => {
  window.addEventListener('sy:admin-unauthorized', onUnauthorized);
  if (logged.value) {
    loadStats();
    loadReports(1);          // 旧 admin.js 的 boot() 同样一进来就拉待处理举报
  }
});

onBeforeUnmount(() => window.removeEventListener('sy:admin-unauthorized', onUnauthorized));

async function login() {
  if (busy.value) return;
  if (!account.value.trim() || !password.value) return toast('填账号和密码');
  busy.value = true;
  try {
    const r = await adminApi.login(account.value.trim(), password.value);
    if (r && r.token) setAdminToken(r.token);
    logged.value = true;
    password.value = '';
    await Promise.all([loadStats(), loadReports(1)]);
    toast('登录成功');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = false;
  }
}

function logout() {
  setAdminToken('');
  logged.value = false;
  reports.value = null;
  audit.value = null;
  users.value = null;
  stats.value = null;
}

async function loadStats() {
  try {
    stats.value = await adminApi.stats();
  } catch (e) {
    toast(errText(e));
  }
}

async function loadReports(page = 1, status) {
  if (status) reportStatus.value = status;
  try {
    reports.value = await adminApi.reports(reportStatus.value, page, 20);
  } catch (e) {
    toast(errText(e));
  }
}

async function switchTab(t) {
  tab.value = t;
  if (t === 'reports' && !reports.value) await loadReports(1);
  if (t === 'audit' && !audit.value) await loadAudit(1);
  if (t === 'users' && !users.value) await loadUsers(1);
}

async function loadAudit(page = 1) {
  try {
    audit.value = await adminApi.audit(page, 20);
  } catch (e) {
    toast(errText(e));
  }
}

async function loadUsers(page = 1) {
  try {
    users.value = await adminApi.users(usersQ.value, page, 20);
  } catch (e) {
    toast(errText(e));
  }
}

async function openDetail(reportId) {
  detail.value = null;
  note.value = '';
  try {
    detail.value = await adminApi.report(reportId);
  } catch (e) {
    toast(errText(e));
  }
}

async function resolveReport(action) {
  const d = detail.value;
  if (!d || !d.report) return;
  const body = { action, note: note.value.trim() || null };
  if (action === 'BAN' || action === 'DELETE_AND_BAN') body.banDays = Number(banDays.value) || 7;
  try {
    await adminApi.resolve(d.report.reportId, body);
    detail.value = null;
    toast('已处理：' + actionName(action));
    await Promise.all([loadStats(), loadReports(reports.value ? reports.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}

async function restoreAudit(id) {
  if (!window.confirm('确认撤销这次处理？内容会重新可见')) return;
  try {
    await adminApi.restoreAudit(id);
    toast('已恢复：内容重新可见（禁言不会一并解除）');
    await Promise.all([
      loadAudit(audit.value ? audit.value.page : 1),
      loadStats(),
      loadReports(reports.value ? reports.value.page : 1)
    ]);
  } catch (e) {
    toast(errText(e));
  }
}

async function banUser(u) {
  const days = Number(banDaysByUser.value[u.id] || 7);
  try {
    await adminApi.ban(u.id, days, '管理员操作');
    toast('已禁言 ' + days + ' 天');
    await Promise.all([loadStats(), loadUsers(users.value ? users.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}

async function unbanUser(u) {
  try {
    await adminApi.unban(u.id);
    toast('已解除禁言');
    await Promise.all([loadStats(), loadUsers(users.value ? users.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}

async function setStatus(u, status) {
  if (status === 0 && !window.confirm('确定要全站封禁这个用户吗？封了之后他立刻无法登录、也无法使用社区。')) return;
  try {
    await adminApi.setStatus(u.id, status);
    toast(status === 0 ? '已全站封禁' : '已解封');
    await Promise.all([loadStats(), loadUsers(users.value ? users.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}

async function changePassword() {
  if (!pwdOld.value) return toast('请输入当前密码');
  if (pwdNew.value.length < 8 || pwdNew.value.length > 64) return toast('新密码需 8–64 位');
  if (!/[0-9]/.test(pwdNew.value) || !/[A-Za-z]/.test(pwdNew.value)) return toast('新密码必须同时包含数字和字母');
  if (pwdNew.value !== pwdNew2.value) return toast('两次输入的新密码不一致');
  if (pwdNew.value === pwdOld.value) return toast('新密码不能与旧密码相同');
  try {
    await adminApi.password(pwdOld.value, pwdNew.value);
    pwdOpen.value = false;
    logout();
    toast('密码已更新，请重新登录');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      pwdOpen.value = false;
      logout();
      toast('登录已失效，请重新登录');
    } else {
      toast(errText(e));
    }
  }
}

function goSite() {
  router.push({ name: 'community' });
}
</script>

<template>
  <div class="adm-root">
  <!-- ==================== 登录 ==================== -->
  <div v-if="!logged" class="login-wrap">
    <div class="login-box">
      <h1>思弈阁 · 管理后台</h1>
      <p class="muted">用管理员账号登录。这是独立入口，与普通用户的登录态互不影响。</p>
      <label>账号</label>
      <input v-model="account" placeholder="admin" @keydown.enter="login">
      <label>密码</label>
      <input v-model="password" type="password" placeholder="••••••••" @keydown.enter="login">
      <button class="btn primary" style="width: 100%" :disabled="busy" @click="login">
        {{ busy ? '登录中…' : '登录' }}
      </button>
      <div style="text-align: center; margin-top: 12px">
        <a class="muted" style="cursor: pointer; font-size: 12.5px" @click="goSite">← 回到网站</a>
      </div>
    </div>
  </div>

  <!-- ==================== 主界面 ==================== -->
  <template v-else>
    <header>
      <div class="bar">
        <div class="brand">思弈阁 · 管理后台</div>
        <div class="tabs">
          <button :class="{ on: tab === 'reports' }" @click="switchTab('reports')">
            举报处理<span v-if="pendingCount" class="badge">{{ pendingCount }}</span>
          </button>
          <button :class="{ on: tab === 'audit' }" @click="switchTab('audit')">处理记录</button>
          <button :class="{ on: tab === 'users' }" @click="switchTab('users')">用户管理</button>
        </div>
        <div class="spacer"></div>
        <button class="btn sm" @click="pwdOpen = true">修改密码</button>
        <button class="btn sm" @click="logout">退出登录</button>
        <!-- 迁移期对照入口：旧管理台还在，随时能点回去 -->
        <a class="old-entry" href="../admin.html" title="旧管理台（迁移期保留）">← 回旧版</a>
      </div>
    </header>

    <main>
      <div class="cards">
        <div class="card"><div class="k">待处理举报</div><div class="v">{{ (stats && stats.pendingReports) || 0 }}</div></div>
        <div class="card"><div class="k">今日新增</div><div class="v">{{ (stats && stats.todayReports) || 0 }}</div></div>
        <div class="card"><div class="k">禁言中用户</div><div class="v">{{ (stats && stats.bannedUsers) || 0 }}</div></div>
      </div>

    <!-- 举报 -->
    <div v-show="tab === 'reports'" class="panel" data-panel="reports">
      <h2>
        举报队列
        <span class="muted" style="font-weight: 400">按目标聚合 · 举报人数多的在前</span>
        <span class="spacer"></span>
        <button
          v-for="q in [['PENDING', '待处理'], ['RESOLVED', '已处理'], ['REJECTED', '已驳回']]"
          :key="q[0]"
          class="btn sm"
          :class="{ primary: reportStatus === q[0] }"
          @click="loadReports(1, q[0])"
        >
          {{ q[1] }}
        </button>
      </h2>
      <div v-if="!reports" class="muted" style="padding: 20px">加载中…</div>
      <div v-else-if="!(reports.items || []).length" class="muted" style="padding: 28px; text-align: center">
        没有待处理的举报 🎉
      </div>
      <table v-else>
        <thead>
          <tr>
            <th style="width: 72px">类型</th>
            <th>被举报内容</th>
            <th style="width: 120px">举报人数</th>
            <th style="width: 200px">原因</th>
            <th style="width: 130px">最近</th>
            <th style="width: 80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in reports.items" :key="it.firstReportId">
            <td>
              <span class="tag" :class="it.targetType === 'POST' ? 'blue' : 'orange'">
                {{ it.targetType === 'POST' ? '帖子' : '评论' }}
              </span>
            </td>
            <td>
              <div style="font-weight: 600">{{ it.targetSummary || '（内容已删除）' }}</div>
              <div class="muted" style="font-size: 12px; margin-top: 2px">
                {{ it.targetAuthor || '' }}{{ it.postId ? ' · 帖子 #' + it.postId : '' }}
                <span v-if="!it.targetExists" class="tag">目标已删除</span>
              </div>
            </td>
            <td>
              {{ it.reporterCount }} 人
              <span v-if="it.multiReport" class="tag red">多人举报</span>
            </td>
            <td>
              <span v-for="r in it.reasons || []" :key="r" class="tag">{{ reasonName(r) }}</span>
            </td>
            <td class="muted">{{ fmtTime(it.lastAt) }}</td>
            <td><button class="btn sm primary" @click="openDetail(it.firstReportId)">处理</button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="reports && reports.total > reports.size" class="pager">
        <span class="muted">共 {{ reports.total }} 条 · 第 {{ reports.page }} 页</span>
        <button class="btn sm" :disabled="reports.page <= 1" @click="loadReports(reports.page - 1)">上一页</button>
        <button
          class="btn sm"
          :disabled="reports.page >= Math.ceil(reports.total / reports.size)"
          @click="loadReports(reports.page + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 审计 -->
    <div v-show="tab === 'audit'" class="panel" data-panel="audit">
      <h2>处理记录<span class="spacer"></span></h2>
      <div v-if="!audit" class="muted" style="padding: 20px">加载中…</div>
      <div v-else-if="!(audit.items || []).length" class="muted" style="padding: 28px; text-align: center">
        还没有处理记录
      </div>
      <table v-else>
        <thead>
          <tr>
            <th style="width: 130px">时间</th>
            <th style="width: 90px">操作人</th>
            <th style="width: 140px">动作</th>
            <th style="width: 110px">对象</th>
            <th>详情</th>
            <th style="width: 100px">状态</th>
            <th style="width: 90px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in audit.items" :key="r.id">
            <td class="muted" style="white-space: nowrap">{{ fmtTime(r.createdAt) }}</td>
            <td>{{ r.adminName || '#' + r.adminId }}</td>
            <td style="white-space: nowrap">
              <span class="tag" :class="r.action === 'RESTORE' ? 'blue' : 'orange'">{{ actionName(r.action) }}</span>
              <div v-if="r.verdict" class="muted" style="font-size: 11.5px">{{ actionName(r.verdict) }}</div>
            </td>
            <td style="white-space: nowrap">
              {{ r.targetType ? (r.targetType === 'POST' ? '帖子' : '评论') + ' #' + r.targetId : '-' }}
            </td>
            <td>{{ r.detail || '' }}</td>
            <td>
              <span v-if="r.action === 'RESTORE'" class="muted" style="font-size: 12px">—</span>
              <template v-else-if="r.undone">
                <span class="tag">已撤销</span>
                <div class="muted" style="font-size: 11.5px">{{ fmtTime(r.undoAt) }}</div>
              </template>
              <span v-else class="tag ok">生效中</span>
            </td>
            <td style="text-align: right">
              <template v-if="r.action !== 'RESTORE' && !r.undone">
                <button v-if="r.canRestore" class="btn sm danger" @click="restoreAudit(r.id)">恢复</button>
                <span v-else class="muted" style="font-size: 12px">不可恢复</span>
              </template>
              <span v-else-if="r.action !== 'RESTORE'" class="muted" style="font-size: 12px">已撤销</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="audit && audit.total > audit.size" class="pager">
        <span class="muted">共 {{ audit.total }} 条 · 第 {{ audit.page }} 页</span>
        <button class="btn sm" :disabled="audit.page <= 1" @click="loadAudit(audit.page - 1)">上一页</button>
        <button class="btn sm" :disabled="audit.page >= Math.ceil(audit.total / audit.size)" @click="loadAudit(audit.page + 1)">
          下一页
        </button>
      </div>
    </div>

    <!-- 用户 -->
    <div v-show="tab === 'users'" class="panel" data-panel="users">
      <h2>
        用户管理
        <span class="spacer"></span>
        <input v-model="usersQ" placeholder="搜账号或昵称" style="width: 200px" @keydown.enter="loadUsers(1)">
        <button class="btn sm primary" @click="loadUsers(1)">搜索</button>
      </h2>
      <div v-if="!users" class="muted" style="padding: 20px">加载中…</div>
      <div v-else-if="!(users.items || []).length" class="muted" style="padding: 28px; text-align: center">
        没有匹配的用户
      </div>
      <table v-else>
        <thead>
          <tr>
            <th>用户</th>
            <th style="width: 110px">全站</th>
            <th style="width: 190px">社区禁言</th>
            <th style="width: 90px">待处理举报</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users.items" :key="u.id">
            <td>
              <div style="font-weight: 600">{{ u.name || u.account }}</div>
              <div class="muted" style="font-size: 12px">{{ u.account }}</div>
            </td>
            <td>
              <span class="tag" :class="u.disabled ? 'red' : 'ok'">{{ u.disabled ? '全站封禁' : '正常' }}</span>
            </td>
            <td>
              <span v-if="u.banned" class="tag orange">禁言至 {{ fmtTime(u.banUntil) }}</span>
              <span v-else class="tag">未禁言</span>
            </td>
            <td>
              <span v-if="u.pendingReports > 0" class="tag red">{{ u.pendingReports }}</span>
              <span v-else class="muted">0</span>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <select v-model="banDaysByUser[u.id]" style="width: 82px; display: inline-block">
                <option :value="1">1 天</option>
                <option :value="3">3 天</option>
                <option :value="7">7 天</option>
              </select>
              <button class="btn sm warn" @click="banUser(u)">禁言</button>
              <button class="btn sm" @click="unbanUser(u)">解禁</button>
              <button v-if="u.disabled" class="btn sm" @click="setStatus(u, 1)">解封</button>
              <button v-else class="btn sm danger" @click="setStatus(u, 0)">全站封禁</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="users && users.total > users.size" class="pager">
        <span class="muted">共 {{ users.total }} 条 · 第 {{ users.page }} 页</span>
        <button class="btn sm" :disabled="users.page <= 1" @click="loadUsers(users.page - 1)">上一页</button>
        <button class="btn sm" :disabled="users.page >= Math.ceil(users.total / users.size)" @click="loadUsers(users.page + 1)">
          下一页
        </button>
      </div>
    </div>

    </main>

    <!-- 举报详情 -->
    <div v-if="detail" class="mask" @click.self="detail = null">
      <div class="modal" style="width: 620px">
        <h3>处理举报</h3>
        <div class="body">
          <div v-if="detail.report" class="muted" style="font-size: 12.5px; margin-bottom: 10px">
            {{ detail.report.targetType === 'POST' ? '帖子' : '评论' }} · 举报人 {{ detail.report.reporterName || detail.report.reporterId }}
            · {{ reasonName(detail.report.reason) }}
          </div>
          <div class="card" style="background: #f7f8fa; border: 1px solid #eff0f1; border-radius: 10px; padding: 12px 14px">
            <div style="font-weight: 600">{{ (detail.target && detail.target.summary) || detail.report.targetSummary || '（内容已删除）' }}</div>
            <div class="muted" style="font-size: 12px; margin-top: 4px">
              作者 {{ (detail.target && detail.target.author) || '-' }}
            </div>
            <div v-if="detail.report.detail" style="margin-top: 8px; font-size: 12.5px">
              补充：{{ detail.report.detail }}
            </div>
          </div>

          <label style="margin-top: 12px; display: block">处理备注（可选）</label>
          <input v-model="note" placeholder="写明依据，会记进审计" style="width: 100%">

          <label style="margin-top: 12px; display: block">禁言天数（选择「禁言」时生效）</label>
          <select v-model="banDays" style="width: 140px">
            <option :value="1">1 天</option>
            <option :value="3">3 天</option>
            <option :value="7">7 天</option>
            <option :value="30">30 天</option>
          </select>
        </div>
        <div class="foot">
          <button class="btn" @click="detail = null">取消</button>
          <button class="btn" @click="resolveReport('IGNORE')">忽略</button>
          <button class="btn warn" @click="resolveReport('BAN')">禁言</button>
          <button class="btn danger" @click="resolveReport('DELETE')">删除内容</button>
          <button class="btn danger" @click="resolveReport('DELETE_AND_BAN')">删除并禁言</button>
        </div>
      </div>
    </div>

    <!-- 修改密码 -->
    <div v-if="pwdOpen" class="mask" @click.self="pwdOpen = false">
      <div class="modal" style="width: 420px">
        <h3>修改密码</h3>
        <div class="body">
          <p class="muted" style="font-size: 12.5px; margin: 0 0 12px">
            8–64 位，必须同时包含数字和字母。改完后所有设备上的登录都会失效，需要重新登录。
          </p>
          <label>当前密码</label>
          <input v-model="pwdOld" type="password" maxlength="64">
          <label>新密码</label>
          <input v-model="pwdNew" type="password" maxlength="64">
          <label>确认新密码</label>
          <input v-model="pwdNew2" type="password" maxlength="64">
        </div>
        <div class="foot">
          <button class="btn" @click="pwdOpen = false">取消</button>
          <button class="btn primary" @click="changePassword">确认修改</button>
        </div>
      </div>
    </div>
  </template>
  </div>
</template>

<style scoped>
/*
 * 管理台的样式：数值从旧 admin.html 的 <style>（L13–L75）原样搬过来，未改。
 *
 * 为什么放 scoped：这套样式里有 .card / .btn / .tag / .panel / .bar / table 这些**通用类名**，
 * 一旦全局导入就会盖掉主站其它页面（实测 .panel 被旧宽 760px 影响过）。scoped 让它只作用于本页。
 * 原来 body{} 的三条（背景/字体/前景色）挪到 .adm-root 上，效果一致且不外溢。
 */
.adm-root{min-height:100vh;background:#F5F6F8;color:#1D2129;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.adm-root *{box-sizing:border-box}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#EEF2FF,#F7F8FA)}
.login-card{width:360px;background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 12px 40px rgba(20,30,60,.10)}
.login-card h1{margin:0 0 6px;font-size:20px}
.login-card p{margin:0 0 22px;color:#86909C;font-size:12.5px}
label{display:block;font-size:12.5px;color:#4E5969;margin:14px 0 6px}
input,select,textarea{width:100%;border:1px solid #E5E6EB;border-radius:9px;padding:10px 12px;font:inherit;background:#FCFCFD;outline:none}
input:focus,textarea:focus,select:focus{border-color:#165DFF;box-shadow:0 0 0 3px rgba(22,93,255,.10)}
.btn{border:1px solid #E5E6EB;background:#fff;color:#1D2129;border-radius:9px;padding:8px 14px;font-size:13px;cursor:pointer;white-space:nowrap}
.btn:hover{background:#F7F8FA}
.btn.primary{background:#165DFF;border-color:#165DFF;color:#fff}
.btn.primary:hover{background:#0E42D2}
.btn.danger{background:#F53F3F;border-color:#F53F3F;color:#fff}
.btn.warn{background:#FF7D00;border-color:#FF7D00;color:#fff}
.btn.sm{padding:5px 10px;font-size:12px}
.btn[disabled]{opacity:.45;cursor:not-allowed}
header{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #E5E6EB;padding:0 24px}
.bar{display:flex;align-items:center;gap:18px;height:60px;max-width:1240px;margin:0 auto}
.brand{font-weight:700;font-size:16px}
.tabs{display:flex;gap:6px}
.tabs button{border:none;background:transparent;padding:8px 14px;border-radius:9px;font-size:13.5px;color:#4E5969;cursor:pointer}
.tabs button.on{background:#E8F3FF;color:#165DFF;font-weight:600}
.badge{display:inline-block;margin-left:4px;background:#F53F3F;color:#fff;border-radius:8px;padding:0 5px;font-size:11px}
.old-entry{font-size:12px;color:#2F5BEA;background:#EDF1FE;border-radius:8px;padding:6px 10px;text-decoration:none;white-space:nowrap}
.old-entry:hover{background:#E3EAFD}
.spacer{flex:1}
main{max-width:1240px;margin:0 auto;padding:20px 24px 60px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}
.card{background:#fff;border-radius:12px;padding:16px 18px;border:1px solid #EFF0F1}
.card .k{font-size:12.5px;color:#86909C}
.card .v{font-size:26px;font-weight:700;margin-top:4px}
.panel{background:#fff;border-radius:12px;border:1px solid #EFF0F1;overflow:hidden;width:auto}
.panel h2{margin:0;padding:14px 18px;font-size:14px;border-bottom:1px solid #EFF0F1;display:flex;gap:10px;align-items:center}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px 18px;font-size:13px;border-bottom:1px solid #F2F3F5;vertical-align:top}
th{color:#86909C;font-weight:500;background:#FAFBFC}
tr:hover td{background:#FCFCFD}
.tag{display:inline-block;border-radius:6px;padding:1px 7px;font-size:11.5px;background:#F2F3F5;color:#4E5969;white-space:nowrap}
.tag.red{background:#FFECE8;color:#F53F3F}
.tag.ok{background:#E8FFEA;color:#00B42A}
.tag.orange{background:#FFF7E8;color:#B8740A}
.tag.blue{background:#E8F3FF;color:#165DFF}
.muted{color:#86909C}
.mask{position:fixed;inset:0;background:rgba(20,25,40,.45);display:flex;align-items:center;justify-content:center;padding:24px;z-index:100}
.modal{background:#fff;border-radius:14px;width:720px;max-width:100%;max-height:88vh;display:flex;flex-direction:column}
.modal h3{margin:0;padding:16px 20px;border-bottom:1px solid #EFF0F1;font-size:15px}
.modal .body{padding:16px 20px;overflow:auto}
.modal .foot{padding:14px 20px;border-top:1px solid #EFF0F1;display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
.pager{display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:12px 18px;border-top:1px solid #EFF0F1}
.pager .muted{font-size:12.5px}
@media (max-width:860px){
  .cards{grid-template-columns:1fr}
  .bar{gap:10px;height:auto;padding:10px 0;flex-wrap:wrap}
  th,td{padding:9px 12px}
  main{padding:14px 12px 60px}
}
</style>
