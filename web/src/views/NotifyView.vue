<script setup>
/**
 * 通知（等价旧 notify.js）。
 *
 * 三个必须保持的行为：
 * 1. **列表接口有副作用**：拉一页就把该页标已读 → 拉完必须刷角标（不等 45 秒轮询）；
 * 2. 文案与跳转目标**全部由后端拼好**（`text` / `link`），前端不判断 type、不自己拼「等 N 人」；
 * 3. 点击按 `link` 跳：好友类去好友页；与内容无关的去「我的」；帖子类带 postId/commentId 定位楼层。
 *
 * 迁移期：社区要批 3 才迁，所以帖子类通知 → 回旧页的社区视图（带 postId/commentId，
 * 旧页 boot() 已支持这两个参数），批 3 后再改成本地路由。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { notifyApi } from '../api.js';
import { useUnreadStore } from '../stores/unread.js';
import { useAuthStore } from '../stores/auth.js';
import { relTime } from '../utils/format.js';
import { toast } from '../utils/toast.js';

const router = useRouter();
const unread = useUnreadStore();
const auth = useAuthStore();

const items = ref([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const error = ref('');
const loading = ref(false);

const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));

async function load(p) {
  const target = Math.max(1, p || 1);
  loading.value = true;
  error.value = '';
  try {
    const r = await notifyApi.list(target, size);
    items.value = (r && r.items) || [];
    total.value = (r && r.total) || 0;
    page.value = (r && r.page) || target;
    // 本页刚被标已读：角标马上跟着减
    await unread.refresh();
  } catch (e) {
    items.value = [];
    total.value = 0;
    error.value = (e && e.message) || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!auth.user) return;    // 未登录由外壳的引导卡接管
  load(1);
});

/** 点击一条通知：按后端给的 link 走 */
function open(item) {
  const link = item.link || {};
  if (link.view === 'friends') {
    router.push({ name: 'friends' });
    return;
  }
  if (link.view === 'me' || !link.postId) {
    router.push({ name: 'me' });
    return;
  }
  // 批 3 起社区已迁移：直接本地路由跳过去，带 around 定位到那一楼
  router.push({
    name: 'community-post',
    params: { postId: String(link.postId) },
    query: link.commentId ? { around: String(link.commentId) } : {}
  });
}
</script>

<template>
  <h1 class="pg">通知</h1>

  <p class="sub">
    评论、回复、点赞、@ 提及都会出现在这里 · 共 {{ total }} 条<span v-if="unread.notifyCount > 0">
      · <b style="color: #4c9aff">{{ unread.notifyCount }} 条未读</b></span>
  </p>

  <div v-if="error" class="card"><div class="empty">{{ error }}</div></div>

  <template v-else>
    <div v-if="items.length" class="card" style="padding: 0; overflow: hidden">
      <div
        v-for="it in items"
        :key="it.id"
        class="notify-row"
        :class="{ unread: it.read === false }"
        @click="open(it)"
      >
        <span class="notify-dot"></span>
        <div style="flex: 1; min-width: 0">
          <div class="notify-text">{{ it.text }}</div>
          <div class="notify-time">{{ relTime(it.createdAt) }}</div>
        </div>
      </div>
    </div>
    <div v-else class="card"><div class="empty">{{ loading ? '加载中…' : '还没有通知' }}</div></div>

    <div v-if="pages > 1" class="notify-pager">
      <button class="btn ghost" :disabled="page <= 1" @click="load(page - 1)">上一页</button>
      <span class="sub" style="align-self: center">第 {{ page }} / {{ pages }} 页</span>
      <button class="btn ghost" :disabled="page >= pages" @click="load(page + 1)">下一页</button>
    </div>
  </template>
</template>
