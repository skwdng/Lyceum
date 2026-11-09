<script setup>
/**
 * 侧栏外壳：logo / 导航（四组）/ 用户卡 / 版本入口。
 *
 * 结构与旧版 index.html + core.js 的 reNav() 一一对应，类名沿用 `css/app.css` 的
 * （.app .sb .logo .nav .me），所以视觉上两套页面看起来是同一个产品。
 *
 * 迁移期的两处"额外"东西：
 * 1. 未登录时，需要登录的页面渲染**登录引导卡**（等价旧版 loginGateCard）；
 * 2. 侧栏底部给一个「返回旧版」入口，方便并排对比（批 4 删旧文件时去掉）。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NAV } from '../nav.js';
import { useAuthStore } from '../stores/auth.js';
import { useUnreadStore } from '../stores/unread.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const unread = useUnreadStore();

/** 当前路由名：导航高亮用 */
const current = computed(() => route.name);

/** 未登录 + 该页需要登录 → 显示引导卡，而不是渲染操作面板（旧版同款行为） */
const gated = computed(() => !!route.meta.requiresAuth && !auth.user);

const GATE_TEXT = {
  solo: '开始一场单人辩论',
  room: '和朋友开一局多人辩论',
  match: '查看正在进行的对局',
  review: '查看复盘',
  diag: '查看能力诊断',
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
  // 消息角标由批 2 的 chat store 提供；批 0/1 迁移期该入口回落旧页，旧页自己有红点
  return '';
}

function goLogin() {
  router.push({ name: 'login', query: { next: route.fullPath } });
}

function goMe() {
  router.push({ name: 'me' });
}

const avatarText = computed(() => {
  const n = auth.user && (auth.user.name || auth.user.account);
  return n ? String(n).slice(0, 1) : '登';
});
</script>

<template>
  <div class="app">
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

      <a class="sb-old" href="../" title="回到旧版界面">← 返回旧版</a>

      <div class="me" @click="goMe">
        <div class="av">{{ avatarText }}</div>
        <div>
          <div>{{ auth.displayName }}</div>
          <div style="font-size: 11px; color: #a8adb8">
            {{ auth.user ? '@' + auth.user.account : '点击登录' }}
          </div>
        </div>
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

/* 「返回旧版」：迁移期临时入口，批 4 删旧文件时一起删掉 */
.sb-old {
  display: block;
  margin: 10px 10px 0;
  padding: 6px 8px;
  font-size: 11.5px;
  color: #a8adb8;
  text-decoration: none;
  border-radius: 8px;
}
.sb-old:hover { background: #f6f4ef; color: #4a5568; }
</style>
