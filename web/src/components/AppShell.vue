<script setup>
/**
 * 侧栏外壳：logo / 导航（四组）/ 用户卡 / 版本入口。
 *
 * 结构与旧版 index.html + core.js 的 reNav() 一一对应，类名沿用 `css/app.css` 的
 * （.app .sb .logo .nav .me），所以视觉上两套页面看起来是同一个产品。
 *
 * 迁移期的两处"额外"东西：
 * 1. 未登录时，需要登录的页面渲染**登录引导卡**（等价旧版 loginGateCard）；
 * 2. 批 4 已删掉「返回旧版」入口（旧前端文件同一批删除）。
 */
import { computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NAV } from '../nav.js';
import { useAuthStore } from '../stores/auth.js';
import { useUnreadStore } from '../stores/unread.js';
import { useWalletStore } from '../stores/wallet.js';
import { useChatStore } from '../stores/chat.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const unread = useUnreadStore();
const wallet = useWalletStore();
const chat = useChatStore();

/** 移动端底部 tab：只放 5 个高频入口，其余收在「我的」里 */
const MOBILE_TABS = [
  { k: 'solo', n: '辩论', p: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 17v4' },
  { k: 'room', n: '联机', p: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { k: 'community', n: '社区', p: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z' },
  { k: 'video', n: '视频', p: 'M23 7l-7 5 7 5V7ZM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z' },
  { k: 'me', n: '我的', p: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' }
];

/** 当前路由名：导航高亮用 */
const current = computed(() => route.name);

/**
 * 手机上顶栏已经显示页面标题，页面里同名的 h1 就不该再出现一次。
 * 不按路由硬编码：路由切换后比一下「第一个 .pg 的文案」与顶栏标题，相同才打标记。
 */
function markDuplicateTitle() {
  nextTick(() => {
    setTimeout(() => {
      const h = document.querySelector('.main .pg, .wrap .pg, .pg');
      if (!h) return;
      const same = String(h.textContent || '').trim() === String(pageTitle.value || '').trim();
      h.classList.toggle('dup-title', same);
    }, 260);
  });
}

/**
 * 移动端顶部应用栏的标题：优先用页面自己的名字，取不到就用导航项的名字。
 * 超长标题在 CSS 里单行省略（ellipsis）。
 */
const TITLE_MAP = {
  match: '对局',
  matches: '对局',
  review: '复盘',
  records: '辩论记录',
  diag: '能力分析',
  offline: '离线对练',
  hot: '热辩榜',
  wallet: '钱包',
  settings: '设置',
  login: '登录'
};
const pageTitle = computed(() => {
  // 见 markDuplicateTitle：这里只算标题文案

  const n = current.value;
  if (TITLE_MAP[n]) return TITLE_MAP[n];
  const hit = NAV.find((x) => x.k === n);
  return (hit && hit.n) || '思弈阁';
});

/** 5 个 tab 根页面：这些页面的顶栏不放「返回」，改放品牌块 */
const isTabRoot = computed(() => MOBILE_TABS.some((t) => t.k === current.value));
/** 对局页是沉浸式：顶栏只留题目、底栏整条隐藏（否则会压住输入框） */
const immersion = computed(() => current.value === 'match');

watch(() => route.fullPath, markDuplicateTitle, { immediate: true });

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push({ name: 'solo' });
}

/** 未登录 + 该页需要登录 → 显示引导卡，而不是渲染操作面板（旧版同款行为） */
const gated = computed(() => !!route.meta.requiresAuth && !auth.user);

const GATE_TEXT = {
  solo: '开始一场单人辩论',
  room: '和朋友开一局多人辩论',
  match: '查看正在进行的对局',
  review: '查看复盘',
  diag: '查看能力分析',
  records: '查看辩论记录',
  notify: '查看通知',
  friends: '查看好友',
  chat: '和好友聊天',
  wallet: '查看钱包'
};

const gateWhat = computed(() => GATE_TEXT[route.name] || '继续');

/** 每个入口自己的角标：消息与通知各算各的，互不影响（旧版决策 12）。 */
function badgeOf(name) {
  if (name === 'notify') return unread.notifyCount > 0 ? (unread.notifyCount > 99 ? '99+' : String(unread.notifyCount)) : '';
  if (name === 'chat') return chat.unread > 0 ? (chat.unread > 99 ? '99+' : String(chat.unread)) : '';
  return '';
}

function goLogin() {
  router.push({ name: 'login', query: { next: route.fullPath } });
}

function goMe() {
  router.push({ name: 'me' });
}

function goWallet() {
  router.push({ name: 'wallet' });
}

/** 余额文案：未加载显示「—」，不要假装 0.00 */
const balanceText = computed(() => (wallet.balanceCents === null ? '—' : (wallet.balanceCents / 100).toFixed(2)));

// 登录 / 换账号：刷新余额 + 拉会话列表并建立 WebSocket（幂等）
// 退出时由 auth.resetAll 里的 wallet.reset / chat.reset 收尾（含关掉 WS）
watch(
  () => (auth.user ? auth.user.id : null),
  (id, old) => {
    if (id && id !== old) {
      wallet.refresh();
      chat.connect();
    }
  },
  { immediate: true }
);

const avatarText = computed(() => {
  const n = auth.user && (auth.user.name || auth.user.account);
  return n ? String(n).slice(0, 1) : '登';
});
</script>

<template>
  <div class="app" :class="{ 'app--immersion': immersion }" :data-page="current">
    <!-- 移动端顶部应用栏（桌面端 CSS 隐藏）：左返回/品牌，中标题，右头像 -->
    <header class="topbar">
      <button v-if="!isTabRoot" class="tb-btn tb-back" type="button" aria-label="返回" @click="goBack">‹</button>
      <span v-else class="tb-brand"><i class="tb-m">思</i></span>
      <h1 class="tb-title">{{ pageTitle }}</h1>
      <button class="tb-btn tb-me" type="button" aria-label="我的" @click="goMe">
        <span class="tb-av">{{ avatarText }}</span>
      </button>
    </header>

    <aside class="sb">
      <div class="logo">
        <div class="m">思</div>
        <div><b>思弈阁</b><span>AI 辩论训练</span></div>
      </div>

      <nav class="nav" id="nav">
        <template v-for="(item, i) in NAV" :key="i">
          <div v-if="item.g" class="g">{{ item.g }}</div>
          <RouterLink v-else :to="{ name: item.k }" :class="{ on: current === item.k }">
            {{ item.n }}<span v-if="badgeOf(item.k)" class="nav-badge">{{ badgeOf(item.k) }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="me" @click="goMe">
        <div class="av">{{ avatarText }}</div>
        <div style="min-width: 0">
          <div>{{ auth.displayName }}</div>
          <div style="font-size: 11px; color: #a8adb8">
            {{ auth.user ? '@' + auth.user.account : '点击登录' }}
          </div>
        </div>
        <!-- 余额胶囊：等价旧版 walletChipHTML（旧版点开弹窗，这里进 #/wallet 路由） -->
        <span v-if="auth.user" class="wchip" title="点击查看钱包" @click.stop="goWallet">¥{{ balanceText }}</span>
      </div>
    </aside>

    <main id="main">
      <div v-if="gated" class="card gate-card">
        <div class="gate-icon">🔒</div>
        <div class="gate-title">登录后可见</div>
        <p class="sub" style="margin: 0 0 20px">登录后就能{{ gateWhat }}。现在未登录，先注册或登录吧。</p>
        <button class="btn primary" @click="goLogin">去登录 / 注册</button>
      </div>
      <slot v-else />
    </main>

    <!-- 移动端底部 tab（桌面端 CSS 里隐藏；对局页整条隐藏，见 .app--immersion） -->
    <nav class="tabbar" aria-label="主导航">
      <RouterLink
        v-for="tb in MOBILE_TABS"
        :key="tb.k"
        :to="{ name: tb.k }"
        :class="{ on: current === tb.k }"
        :aria-current="current === tb.k ? 'page' : undefined"
      >
        <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="tb.p" /></svg>
        <span class="tn">{{ tb.n }}</span>
        <span v-if="badgeOf(tb.k)" class="tb-badge">{{ badgeOf(tb.k) }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
/* 只写这一批新增的两块；其余全部复用 style.css 里的既有类名 */
.gate-card {
  max-width: 560px;
  margin: 48px auto;
  text-align: center;
  padding: 32px 28px;
}
.gate-icon { font-size: 34px; line-height: 1; margin-bottom: 10px; }
.gate-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }


/* ---------- 移动端壳（≤860px）：顶部应用栏 + 底部 tabbar ---------- */
.tabbar { display: none; }
.topbar { display: none; }

@media (max-width: 860px) {
  /* 侧栏整体收起：桌面是左侧固定栏，手机改用顶部应用栏 + 底部 tab */
  .sb { display: none !important; }

  /* ---- 顶部应用栏：52px、毛玻璃、贴顶 ---- */
  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 52px;
    padding: 0 12px;
    z-index: 60;
    background: color-mix(in srgb, var(--card) 82%, transparent);
    -webkit-backdrop-filter: saturate(180%) blur(14px);
    backdrop-filter: saturate(180%) blur(14px);
    border-bottom: 1px solid var(--line);
  }
  .tb-btn {
    flex: 0 0 44px;
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 12px;
    color: var(--blue);
    background: transparent;
  }
  .tb-back { font-size: 24px; line-height: 1; margin-left: -6px; }
  .tb-brand { flex: 0 0 32px; display: flex; align-items: center; justify-content: center; }
  .tb-m {
    width: 28px; height: 28px; border-radius: 9px;
    background: var(--blue); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; font-style: normal;
  }
  .tb-title {
    flex: 1; min-width: 0;
    font-size: 17px; font-weight: 600; color: var(--ink);
    text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tb-av {
    width: 26px; height: 26px; border-radius: 8px;
    background: var(--ink); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
  }

  /* ---- 页面容器：给顶栏留位、给 tabbar 留位 ---- */
  #main {
    padding: 68px 16px calc(64px + env(safe-area-inset-bottom) + 16px) !important;
    max-width: 100% !important;
  }
  .app--immersion #main {
    padding-bottom: calc(env(safe-area-inset-bottom) + 12px) !important;
  }

  /* ---- 底部 tabbar：5 项等分，选中项主色药丸 ---- */
  .tabbar {
    display: flex;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 55;
    background: color-mix(in srgb, var(--card) 92%, transparent);
    -webkit-backdrop-filter: saturate(180%) blur(14px);
    backdrop-filter: saturate(180%) blur(14px);
    border-top: 1px solid var(--line);
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    gap: 2px;
  }
  .app--immersion .tabbar { display: none; }

  .tabbar a {
    flex: 1 1 0;
    min-width: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px;
    min-height: 52px;
    padding: 4px 2px;
    border-radius: 14px;
    font-size: 10.5px;
    line-height: 1.1;
    color: var(--sub);
    text-decoration: none;
    position: relative;
  }
  .tabbar a.on {
    color: var(--blue);
    background: var(--blue-w);
    font-weight: 600;
  }
  .tabbar .ti { width: 20px; height: 20px; display: block; }
  .tabbar .tn {
    max-width: 100%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tabbar .tb-badge {
    position: absolute; top: 4px; right: 50%;
    transform: translateX(14px);
    min-width: 16px; height: 16px; line-height: 16px;
    padding: 0 4px; border-radius: 8px;
    background: var(--red); color: #fff;
    font-size: 10px; font-weight: 600; text-align: center;
  }
}
</style>

<!-- 全局（非 scoped）：手机端把与顶栏重复的页面标题藏掉 -->
<style>
@media (max-width: 860px) {
  .pg.dup-title { display: none !important; }
}
</style>