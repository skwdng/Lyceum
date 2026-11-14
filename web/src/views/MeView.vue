<script setup>
/**
 * 「我的」：昵称 / 改密 / 退出（等价旧版 auth.js 的 viewMePanel）。
 *
 * 三处与旧版一致的关键行为：
 * 1. 改昵称后立刻生效（后端返回新 user，直接覆盖 store）；
 * 2. 改密成功后**本地令牌作废**、回登录页——因为服务端已把旧令牌判为 TOKEN_STALE；
 * 3. 退出登录会清所有 store（含未读角标），再回社区。
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useUnreadStore } from '../stores/unread.js';
import { toast } from '../utils/toast.js';
import { ApiError } from '../api.js';

const router = useRouter();
const auth = useAuthStore();
const unread = useUnreadStore();

const name = ref('');
const oldPwd = ref('');
const newPwd = ref('');
const newPwd2 = ref('');
const busy = ref(false);

/** 正在恢复登录态（只在这段时间显示占位，避免闪一下空面板） */
const restoring = ref(false);

onMounted(async () => {
  if (!auth.user) {
    restoring.value = true;
    await auth.restore();
    restoring.value = false;
  }
  // 未登录就回登录页 —— 旧版点「我的」看到的就是登录表单，不能停在这里干等
  if (!auth.user) {
    router.replace({ name: 'login', query: { next: '/me' } });
    return;
  }
  name.value = auth.user.name || '';
});

function errText(e) {
  const code = e instanceof ApiError ? e.code : '';
  const map = {
    BAD_CREDENTIALS: '当前密码不对',
    PASSWORD_TOO_WEAK: '新密码太弱：至少 8 位且含数字和字母',
    TOKEN_STALE: '登录已失效，请重新登录',
    NETWORK: '后端未连接'
  };
  return map[code] || (e && e.message) || '操作失败';
}

async function saveName() {
  if (!name.value.trim()) return toast('昵称不能为空');
  busy.value = true;
  try {
    await auth.rename(name.value.trim());
    toast('昵称已更新');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = false;
  }
}

async function changePassword() {
  if (!oldPwd.value) return toast('请输入当前密码');
  if (newPwd.value.length < 8 || newPwd.value.length > 64) return toast('新密码需 8–64 位');
  if (!/[0-9]/.test(newPwd.value) || !/[A-Za-z]/.test(newPwd.value)) return toast('新密码必须同时包含数字和字母');
  if (newPwd.value !== newPwd2.value) return toast('两次输入的新密码不一致');
  if (newPwd.value === oldPwd.value) return toast('新密码不能与旧密码相同');

  busy.value = true;
  try {
    await auth.changePassword(oldPwd.value, newPwd.value);
    unread.reset();
    toast('密码已更新，请重新登录');
    router.replace({ name: 'login' });
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = false;
  }
}

async function logout() {
  busy.value = true;
  try {
    await auth.logout();
    unread.reset();
    toast('已退出登录');
    router.replace({ name: 'community' });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="!auth.user" class="card auth-card">
    <p class="sub">{{ restoring ? '正在恢复登录状态…' : '正在前往登录页…' }}</p>
  </div>

  <div v-else class="card auth-card">
    <div class="auth-tabs"><a class="on">我的</a></div>
    <p class="sub">账号：<b class="auth-account">{{ auth.user.account }}</b></p>

    <div class="auth-field">
      <label for="authName">昵称</label>
      <input id="authName" v-model="name" maxlength="64" placeholder="显示在社区帖子与评论上">
    </div>
    <p class="sub">昵称会显示在社区的所有帖子和评论上，保存后立刻生效。</p>
    <div class="auth-actions">
      <button class="btn primary" :disabled="busy" @click="saveName">保存昵称</button>
      <button class="btn ghost" :disabled="busy" @click="logout">退出登录</button>
    </div>

    <div class="pwd-block">
      <div class="pwd-title">修改密码</div>
      <p class="sub">改完密码后，其它设备上的登录会全部失效，需要用新密码重新登录。</p>

      <div class="auth-field">
        <label for="authOldPwd">当前密码</label>
        <input id="authOldPwd" v-model="oldPwd" type="password" autocomplete="current-password"
               placeholder="输入现在的密码" maxlength="64">
      </div>
      <div class="auth-field">
        <label for="authNewPwd">新密码</label>
        <input id="authNewPwd" v-model="newPwd" type="password" autocomplete="new-password"
               placeholder="至少 8 位，含数字和字母" maxlength="64">
      </div>
      <div class="auth-field">
        <label for="authNewPwd2">确认新密码</label>
        <input id="authNewPwd2" v-model="newPwd2" type="password" autocomplete="new-password"
               placeholder="再输入一次" maxlength="64" @keydown.enter="changePassword">
      </div>
      <div class="auth-actions">
        <button class="btn primary" :disabled="busy" @click="changePassword">修改密码</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 改密区与昵称区之间的分隔线：旧版是内联样式，这里收成 scoped 类 */
.pwd-block {
  border-top: 1px solid #eff0f1;
  margin: 22px -24px 0;
  padding: 18px 24px 0;
}
.pwd-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
</style>
