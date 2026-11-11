<script setup>
/**
 * 设置：当前管理员 + 改密 + 退出。
 *
 * 改密表单从旧版的**弹窗**搬到页内（P0 要求），但 `changePassword()` 的
 * 校验顺序、文案、错误分支逐字保留（原 AdminView L224–244）：
 * · 五条前端校验按原顺序短路，顺序变了提示文案就会变；
 * · 成功后**立刻本地登出**再回登录页 —— 后端改密会让所有旧令牌失效，
 *   留在这个页面只会让人以为还能用；
 * · 401 单独处理（`adminApi.password` 带 `keepLogin`，不会触发全局 401 广播）：
 *   清令牌 + `'登录已失效，请重新登录'`，与旧版一致；其它错误（400 校验失败）只 toast，**不踢人**。
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi, ApiError } from '../../api.js';
import { useAdminStore } from '../../stores/admin.js';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';

const router = useRouter();
const admin = useAdminStore();

const pwdOld = ref('');
const pwdNew = ref('');
const pwdNew2 = ref('');

async function changePassword() {
  if (!pwdOld.value) return toast('请输入当前密码');
  if (pwdNew.value.length < 8 || pwdNew.value.length > 64) return toast('新密码需 8–64 位');
  if (!/[0-9]/.test(pwdNew.value) || !/[A-Za-z]/.test(pwdNew.value)) return toast('新密码必须同时包含数字和字母');
  if (pwdNew.value !== pwdNew2.value) return toast('两次输入的新密码不一致');
  if (pwdNew.value === pwdOld.value) return toast('新密码不能与旧密码相同');
  try {
    await adminApi.password(pwdOld.value, pwdNew.value);
    admin.logout();
    toast('密码已更新，请重新登录');
    router.replace('/admin/login');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      admin.logout();
      toast('登录已失效，请重新登录');
      router.replace('/admin/login');
    } else {
      toast(errText(e));
    }
  }
}

function logout() {
  admin.logout();
  router.replace('/admin/login');
}
</script>

<template>
  <div data-panel="settings">
    <div class="panel" style="margin-bottom: 18px">
      <h2>
        当前管理员
        <span class="spacer"></span>
        <button class="btn sm" @click="logout">退出登录</button>
      </h2>
      <div class="body">
        <div style="font-size: 13px">账号：<b>{{ admin.account || '管理员' }}</b></div>
        <div class="muted" style="font-size: 12.5px; margin-top: 6px">
          独立入口：这里的登录态与普通用户互不影响（各自一个令牌）。
        </div>
      </div>
    </div>

    <div class="panel form-narrow">
      <h2>修改密码</h2>
      <div class="body">
        <p class="muted" style="font-size: 12.5px; margin: 0">
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
        <button class="btn primary" @click="changePassword">确认修改</button>
      </div>
    </div>
  </div>
</template>
