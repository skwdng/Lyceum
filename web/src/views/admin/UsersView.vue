<script setup>
/**
 * 用户管理（原 AdminView 的 users 面板 L425–484，逻辑 L36–38 / L144–150 / L192–222）。
 *
 * 与旧版逐条等价：
 * · 搜索框 + 回车/点「搜索」都是 `loadUsers(1)`，`q` 原样透传（后端决定匹配规则，前端不猜）；
 * · 禁言天数默认 7 天，`ban(u)` 的 reason 固定 `'管理员操作'`（会进审计，不能改文案）；
 * · 「全站封禁」必须先 `window.confirm`，文案一字不改；解封不需要确认。
 * · 每次动作成功后刷新 stats（徽标里的「禁言中用户」会变）。
 */
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api.js';
import { useAdminStore } from '../../stores/admin.js';
import { toast } from '../../utils/toast.js';
import { errText, fmtTime } from './helpers.js';
import UserProfilePop from './components/UserProfilePop.vue';

const admin = useAdminStore();

/** 用户违规浮窗：点用户名弹出（与内容管理两个页面共用同一个组件） */
const pop = ref(null);
function openPop(userId, ev) {
  if (!userId) return;
  pop.value = { id: userId, x: ev.clientX, y: ev.clientY };
}

const users = ref(null);
const usersQ = ref('');
const banDaysByUser = ref({});

onMounted(() => loadUsers(1));

async function loadUsers(page = 1) {
  try {
    users.value = await adminApi.users(usersQ.value, page, 20);
  } catch (e) {
    toast(errText(e));
  }
}

async function banUser(u) {
  const days = Number(banDaysByUser.value[u.id] || 7);
  try {
    await adminApi.ban(u.id, days, '管理员操作');
    toast('已禁言 ' + days + ' 天');
    await Promise.all([admin.loadStats(), loadUsers(users.value ? users.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}

async function unbanUser(u) {
  try {
    await adminApi.unban(u.id);
    toast('已解除禁言');
    await Promise.all([admin.loadStats(), loadUsers(users.value ? users.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}

async function setStatus(u, status) {
  if (status === 0 && !window.confirm('确定要全站封禁这个用户吗？封了之后他立刻无法登录、也无法使用社区。')) return;
  try {
    await adminApi.setStatus(u.id, status);
    toast(status === 0 ? '已全站封禁' : '已解封');
    await Promise.all([admin.loadStats(), loadUsers(users.value ? users.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}
</script>

<template>
  <div data-panel="users">
    <div class="panel">
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
              <div class="u-link" style="font-weight: 600" @click="openPop(u.id, $event)">{{ u.name || u.account }}</div>
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

    <UserProfilePop v-if="pop" :user-id="pop.id" :x="pop.x" :y="pop.y"
                    @close="pop = null" @changed="loadUsers(users ? users.page : 1)" />
  </div>
</template>
