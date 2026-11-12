<script setup>
/**
 * 管理台外壳：左侧栏 + 顶栏 + `<RouterView/>`。
 *
 * 这一层负责三件事（P0 的"骨架"就是指它们）：
 * 1. **导航**：菜单从 `adminMenu.js` 读（数据驱动），当前项高亮，徽标读 `stats.pendingReports`；
 * 2. **布局**：宽屏 208px ⇄ 56px 折叠（记 localStorage）；窄屏 <760px 变抽屉 + 遮罩；
 * 3. **门禁收尾**：监听 `sy:admin-unauthorized`（api.js 在 401 时广播），
 *    清状态并送回 `/admin/login` —— 全台只有这一个 401 出口。
 *
 * 登录门禁的**判断**在 router.js 的 beforeEach 里（没有令牌就进不来），
 * 这里只负责"把登录页渲染成全屏、不给它套侧栏"。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ADMIN_MENU } from '../../adminMenu.js';
import { useAdminStore } from '../../stores/admin.js';
import UserProfilePop from './components/UserProfilePop.vue';
import { userPop } from './userPop.js';
import './admin.css';

const route = useRoute();
const router = useRouter();
const admin = useAdminStore();

/** 断点：<760px 用抽屉（与设计文档 §4.4 一致） */
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
const isNarrow = ref(mq ? mq.matches : false);
const drawerOpen = ref(false);

/** 登录页：全屏渲染子路由，不套侧栏/顶栏（旧版的登录框就是没有侧栏的） */
const isGuest = computed(() => route.meta.guest === true);

/** 顶栏标题取路由 meta.title（菜单文案的同一份来源） */
const title = computed(() => (route.meta && route.meta.title) || '管理台');

/**
 * 切页时把滚动位置归零。
 *
 * 现在整页滚动（document），所以主要归零 window；`mainEl` 仍是保守兜底 ——
 * 万一将来又有人把内容区改回独立滚动容器，这一行能继续生效。
 * 不归零的后果：从"处理记录"（很长）切到"概览"会停在半空中，看着像页面空白。
 */
const mainEl = ref(null);
watch(() => route.fullPath, () => {
  if (mainEl.value) mainEl.value.scrollTop = 0;
  if (typeof window !== 'undefined') window.scrollTo(0, 0);
});

/** 折叠只在宽屏生效；窄屏永远是抽屉（宽度由 CSS 固定 208px） */
const collapsed = computed(() => admin.collapsed && !isNarrow.value);

/** 徽标：`badge` 字段指向 store 里的字段名，0 不显示（旧版也是如此） */
function badgeOf(key) {
  if (key !== 'pendingReports') return '';
  const n = admin.pendingCount;
  if (!n) return '';
  return n > 99 ? '99+' : String(n);
}

function onToggle() {
  if (isNarrow.value) drawerOpen.value = !drawerOpen.value;
  else admin.toggleCollapsed();
}

/** 窄屏点完菜单要收起抽屉；宽屏切换路由时抽屉本来就不存在 */
watch(() => route.path, () => {
  drawerOpen.value = false;
});

function closeDrawer() {
  drawerOpen.value = false;
}

/** 宽窄屏切换：切回宽屏时抽屉必须复位，否则会留一个打不开的遮罩 */
function onMediaChange(e) {
  isNarrow.value = e.matches;
  if (!e.matches) drawerOpen.value = false;
}

function logout() {
  admin.logout();
  router.replace('/admin/login');
}

/** 401 统一出口：清令牌 + 清缓存 + toast（在 store 里），然后回登录页 */
function handleUnauthorized() {
  admin.onUnauthorized();
  if (route.path !== '/admin/login') router.replace('/admin/login');
}

onMounted(() => {
  window.addEventListener('sy:admin-unauthorized', handleUnauthorized);
  if (mq && mq.addEventListener) mq.addEventListener('change', onMediaChange);
  // 统计全台只拉这一次（坑 #1：别让每个子页各发一遍）
  if (admin.hasToken()) admin.loadStats();
});

onBeforeUnmount(() => {
  window.removeEventListener('sy:admin-unauthorized', handleUnauthorized);
  if (mq && mq.removeEventListener) mq.removeEventListener('change', onMediaChange);
});
</script>

<template>
  <div class="adm-root">
    <!-- ==================== 登录页：全屏，无侧栏 ==================== -->
    <RouterView v-if="isGuest" />

    <!-- ==================== 主界面 ==================== -->
    <div v-else class="adm-layout" :class="{ collapsed, drawer: drawerOpen }">
      <aside class="adm-side">
        <div class="adm-brand">
          <div class="m">思</div>
          <div>
            <b>思弈阁</b>
            <span>管理后台</span>
          </div>
        </div>

        <nav class="adm-nav">
          <template v-for="(group, gi) in ADMIN_MENU" :key="gi">
            <div class="g">{{ group.group }}</div>
            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              :title="item.label"
              :class="{ on: route.path === item.to }"
              @click="closeDrawer"
            >
              <span class="ic">{{ item.icon }}</span>
              <span class="lb">{{ item.label }}</span>
              <span v-if="badgeOf(item.badge)" class="badge">{{ badgeOf(item.badge) }}</span>
            </RouterLink>
          </template>
        </nav>
      </aside>

      <!-- 窄屏抽屉的遮罩：点一下关掉（z-index 低于 toast，不会盖住提示） -->
      <button v-if="drawerOpen" class="adm-mask" aria-label="关闭菜单" @click="closeDrawer"></button>

      <div class="adm-main" ref="mainEl">
        <header class="adm-top">
          <button class="adm-iconbtn" aria-label="展开/收起菜单" @click="onToggle">☰</button>
          <h1 class="adm-title">{{ title }}</h1>
          <span class="spacer"></span>
          <span class="adm-who">{{ admin.account || '管理员' }}</span>
          <button class="btn sm" @click="logout">退出登录</button>
        </header>

        <div class="adm-body">
          <RouterView />
        </div>
      </div>
    </div>

    <!-- 全局唯一的用户违规浮窗：任何页面点用户名都调 userPop.open(id, event)，
         不用每个页面各自放一份（少一处就是少一个"点了没反应"的坑） -->
    <UserProfilePop v-if="userPop.state.open" :user-id="userPop.state.userId"
                    :x="userPop.state.x" :y="userPop.state.y"
                    @close="userPop.close()" @changed="userPop.fireChanged()" />
  </div>
</template>
