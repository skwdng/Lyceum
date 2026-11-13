<script setup>
/**
 * 修改密码。
 *
 * <p>两个入口共用这一页：
 * <ol>
 *   <li>**首登强制改密**：超管发的一次性密码登录后，路由守卫 + 后端都会把人压到这里，
 *       改完之前进不了任何业务页（后端除改密与 `/me` 之外一律 403 PASSWORD_CHANGE_REQUIRED）</li>
 *   <li>自己主动改（`?voluntary=1`）：从顶栏/设置页进来</li>
 * </ol>
 *
 * <p>改完**必须回登录页重新登录**：后端改密会刷新 `pwd_changed_at`，
 * 该账号所有旧令牌立刻失效（含当前这个），留在页面里下次请求就是 401。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminApi } from '../../api.js';
import { useAdminStore } from '../../stores/admin.js';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';

const route = useRoute();
const router = useRouter();
const admin = useAdminStore();

const forced = computed(() => admin.mustChangePwd);
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  if (!oldPassword.value) return toast('请输入当前密码');
  if (!newPassword.value) return toast('请输入新密码');
  if (newPassword.value !== confirmPassword.value) return toast('两次输入的新密码不一致');
  if (newPassword.value === oldPassword.value) return toast('新密码不能与当前密码相同');

  busy.value = true;
  try {
    await adminApi.password(oldPassword.value, newPassword.value);
    admin.logout();                       // 旧令牌已失效，清干净再回登录页
    toast('密码已修改，请用新密码重新登录');
    router.replace('/admin/login');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = false;
  }
}

function backToLogin() {
  admin.logout();
  router.replace('/admin/login');
}
</script>

<template>
  <div class="panel cpwd" data-panel="admin-change-pwd">
    <h2>
      修改密码
      <span v-if="forced" class="tag orange">首次登录必须改密</span>
    </h2>

    <div v-if="forced" class="cpwd-hint">
      你现在用的是超管给的一次性密码。为了账号安全，<b>改完密码才能使用其它功能</b>。
    </div>

    <div class="cpwd-form">
      <label class="cpwd-lb">当前密码</label>
      <input v-model="oldPassword" type="password" class="cpwd-input" autocomplete="current-password"
             placeholder="一次性密码 / 你现在的密码" />

      <label class="cpwd-lb">新密码</label>
      <input v-model="newPassword" type="password" class="cpwd-input" autocomplete="new-password"
             placeholder="至少 8 位，需同时含字母和数字" />

      <label class="cpwd-lb">确认新密码</label>
      <input v-model="confirmPassword" type="password" class="cpwd-input" autocomplete="new-password"
             @keyup.enter="submit" />

      <div class="cpwd-ops">
        <button class="btn primary" :disabled="busy" @click="submit">{{ busy ? '提交中…' : '确认修改' }}</button>
        <button v-if="!forced" class="btn" :disabled="busy" @click="router.back()">取消</button>
        <button v-else class="btn" :disabled="busy" @click="backToLogin">返回登录</button>
      </div>

      <p class="muted" style="font-size: 12px; margin-top: 10px">
        改完会用新密码重新登录一次：改密会让这个账号的**所有旧令牌立即失效**（这是预期的）。
      </p>
    </div>
  </div>
</template>

<style scoped>
.cpwd { max-width: 520px; }
.cpwd-hint { background: #FFF7E8; border: 1px solid #FFE4BA; color: #7D4E00;
  padding: 10px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 16px; }
.cpwd-form { display: flex; flex-direction: column; }
.cpwd-lb { font-size: 12.5px; color: #86909C; margin: 10px 0 6px; }
.cpwd-input { padding: 10px 12px; border: 1px solid #E5E6EB; border-radius: 9px; font-size: 14px; }
.cpwd-ops { display: flex; gap: 10px; margin-top: 18px; }
</style>
