<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from './components/AppShell.vue';
import ToastHost from './components/ToastHost.vue';
import { useAuthStore } from './stores/auth.js';
import { useUnreadStore } from './stores/unread.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const unread = useUnreadStore();

/**
 * 管理后台是独立 app（自己的令牌、自己的布局、没有侧栏），所以走「裸布局」：
 * 路由 meta.bare = true 时直接渲染 RouterView，不套 AppShell。
 */
const bare = computed(() => !!route.meta.bare);

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
  <RouterView v-if="bare" />
  <AppShell v-else>
    <RouterView />
  </AppShell>
  <ToastHost />
</template>
