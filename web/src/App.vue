<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from './components/AppShell.vue';
import ToastHost from './components/ToastHost.vue';
import { useAuthStore } from './stores/auth.js';
import { useUnreadStore } from './stores/unread.js';

const router = useRouter();
const auth = useAuthStore();
const unread = useUnreadStore();

/** 任何请求拿到 401，都回到登录页（等价旧版「401 只提示登录，不自动重试」）。 */
function onUnauthorized() {
  auth.user = null;
  unread.reset();
  if (router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login', query: { next: router.currentRoute.value.fullPath } });
  }
}

onMounted(async () => {
  window.addEventListener('sy:unauthorized', onUnauthorized);
  // 刷新页面后凭 localStorage 里的 token 恢复身份；有登录态就顺手启动角标轮询
  await auth.restore();
  if (auth.user) unread.start();
});

onBeforeUnmount(() => {
  window.removeEventListener('sy:unauthorized', onUnauthorized);
  unread.stop();
});
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
  <ToastHost />
</template>
