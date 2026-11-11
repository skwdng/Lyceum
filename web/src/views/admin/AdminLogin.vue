<script setup>
/**
 * 管理台登录页。
 *
 * 从 `views/AdminView.vue` 原样搬出：状态 L22–24、`login()` L85–101、模板 L253–269。
 * 行为逐条等价 —— 空账号/空密码先 toast('填账号和密码')、`busy` 防重复提交、
 * 成功后才清密码框；唯一的新增是登录成功**跳转到概览页**（旧版是原地切 tab）。
 *
 * 这里是独立入口：令牌键 `sy_admin_jwt`，与普通用户登录态互不影响。
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminStore } from '../../stores/admin.js';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';

const router = useRouter();
const admin = useAdminStore();

const account = ref('');
const password = ref('');
const busy = ref(false);

async function login() {
  if (busy.value) return;
  if (!account.value.trim() || !password.value) return toast('填账号和密码');
  busy.value = true;
  try {
    // 换令牌 + 记账号 + 拉一次统计（等价旧版的 setAdminToken + loadStats）
    await admin.login(account.value.trim(), password.value);
    password.value = '';
    toast('登录成功');
    router.replace('/admin/dashboard');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = false;
  }
}

/** 「← 回到网站」：等价旧版 goSite() */
function goSite() {
  router.push({ name: 'community' });
}
</script>

<template>
  <div class="login-wrap">
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
</template>
