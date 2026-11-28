<script setup>
/**
 * 登录 / 注册（等价旧版 auth.js 的 viewAuthForms + authLogin/authRegister）。
 *
 * 与旧版逐条对齐的点：
 * · 双 Tab（登录 / 注册），Enter 直接提交；
 * · 校验文案原样保留（账号 3–32 位字母数字下划线；密码 ≥8 位且同时含数字与字母）；
 * · 成功后回到"被弹去登录之前"的页面（旧版 S.lastVisitedView，这里用 ?next= 承载）；
 * · 没有 ?next= 时回社区（旧版 goAfterAuth 的兜底也是社区）。
 */
import { computed, ref, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useUnreadStore } from '../stores/unread.js';
import { toast } from '../utils/toast.js';
import { ApiError } from '../api.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const unread = useUnreadStore();

const tab = ref('login');           // login | register
/** 登录/注册失败的原因：贴在按钮下方，不用抬头找 toast */
const authError = ref('');
const account = ref('');
const password = ref('');
/** 手机号：2026-11-28 起注册必填（只有注册 Tab 才显示） */
const phone = ref('');
const busy = ref(false);
const accountEl = ref(null);

const isReg = computed(() => tab.value === 'register');

onMounted(async () => {
  // 已登录直接离开登录页（旧版 viewAuth 也是登录后显示"我的"面板）
  if (!auth.user) await auth.restore();
  if (auth.user) router.replace(route.query.next || { name: 'me' });
  await nextTick();
  if (accountEl.value) accountEl.value.focus();
});

function switchTab(which) {
  tab.value = which === 'register' ? 'register' : 'login';
}

/** 前端预校验：与后端规则一致，但先挡一道，少一次无谓请求 */
function validate() {
  const acc = account.value.trim();
  if (!acc) return '请输入账号';
  if (isReg.value && !/^[A-Za-z0-9_]{3,32}$/.test(acc)) return '账号 3–32 位，只能用字母、数字、下划线';
  if (!password.value) return '请输入密码';
  if (isReg.value && (password.value.length < 8 || password.value.length > 64)) return '密码需 8–64 位';
  if (isReg.value && (!/[0-9]/.test(password.value) || !/[A-Za-z]/.test(password.value))) {
    return '密码必须同时包含数字和字母';
  }
  // 手机号：必填 + 中国大陆 11 位（与后端 AuthService.PHONE 同一套口径）
  if (isReg.value) {
    const ph = phone.value.trim();
    if (!ph) return '请输入手机号';
    if (!/^1[3-9]\d{9}$/.test(ph)) return '手机号格式不对（11 位，1 开头）';
  }
  return '';
}

async function submit() {
  if (busy.value) return;
  const bad = validate();
  authError.value = '';
  if (bad) { authError.value = bad; toast(bad); return; }

  busy.value = true;
  try {
    if (isReg.value) await auth.register(account.value.trim(), password.value, phone.value.trim());
    else await auth.login(account.value.trim(), password.value);

    unread.start();                                  // 登录成功：启动角标轮询
    toast((isReg.value ? '注册成功，' : '欢迎回来，') + (auth.user ? auth.user.name : ''));
    router.replace(route.query.next || { name: 'me' });
  } catch (e) {
    authError.value = authErrText(e);
    toast(authError.value);
  } finally {
    busy.value = false;
  }
}

/** 把后端 {code,message} 翻成人话（旧版 authErrText 的等价物，只保留这一批用得到的） */
function authErrText(e) {
  const code = e instanceof ApiError ? e.code : '';
  const map = {
    ACCOUNT_TAKEN: '该用户名已被占用',
    PHONE_TAKEN: '该手机号已注册',
    ACCOUNT_EXISTS: '这个账号已经有人用了',
    BAD_CREDENTIALS: '账号或密码不对',
    ACCOUNT_DISABLED: '这个账号已被封禁',
    TOKEN_STALE: '密码已更新，请重新登录',
    NETWORK: '后端未连接，确认服务在跑'
  };
  if (map[code]) return map[code];
  // 后端 message 形如「INVALID_PARAM: 手机号不能为空」：前缀是机读码，别给用户看
  const raw = (e && e.message) || '操作失败';
  return raw.replace(/^[A-Z_]+:\s*/, '');
}
</script>

<template>
  <div class="card auth-card">
    <div class="auth-tabs">
      <a :class="{ on: !isReg }" @click="switchTab('login')">登录</a>
      <a :class="{ on: isReg }" @click="switchTab('register')">注册</a>
    </div>

    <p class="sub">
      {{ isReg ? '账号 3–32 位字母 / 数字 / 下划线；手机号 11 位；密码至少 8 位，且同时含数字和字母。' : '登录后即可发帖、评论、点赞；不登录也能浏览社区。' }}
    </p>

    <div class="auth-field">
      <label for="authAccount">账号</label>
      <input id="authAccount" ref="accountEl" v-model="account" autocomplete="username"
             placeholder="例如 zhang" maxlength="32">
    </div>

    <!-- 手机号：只在注册时出现（登录不需要） -->
    <div v-if="isReg" class="auth-field">
      <label for="authPhone">手机号</label>
      <input id="authPhone" v-model="phone" type="tel" inputmode="numeric" maxlength="11"
             autocomplete="tel" data-auth-phone
             placeholder="11 位手机号" @keydown.enter="submit">
    </div>

    <div class="auth-field">
      <label for="authPassword">密码</label>
      <input id="authPassword" v-model="password" type="password" maxlength="64"
             :autocomplete="isReg ? 'new-password' : 'current-password'"
             placeholder="至少 8 位，含数字和字母" @keydown.enter="submit">
    </div>

    <div class="auth-actions">
      <button class="btn primary" :disabled="busy" @click="submit">
        {{ busy ? '请稍候…' : (isReg ? '注册并登录' : '登录') }}
      </button>
    <div v-if="authError" class="auth-err">{{ authError }}</div>
    </div>
  </div>
</template>
