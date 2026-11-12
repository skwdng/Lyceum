<script setup>
/**
 * 帖子详情抽屉：正文 + 统计 + 作者 + 评论树 + 处置。
 *
 * <p>支持"从评论管理跳过来定位某条评论"：外部传 `focusCommentId`，
 * 抽屉挂载/换页之后滚到 `#c-{id}` 并高亮 2 秒（对应设计稿 §3.1）。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { contentApi } from '../../../api.js';
import { toast } from '../../../utils/toast.js';
import { errText } from '../helpers.js';
import { userPop } from '../userPop.js';
import CommentTree from './CommentTree.vue';
import ModerationBar from './ModerationBar.vue';

const props = defineProps({
  postId: { type: [Number, String], required: true },
  focusCommentId: { type: [Number, String], default: null }
});
const emit = defineEmits(['close', 'changed']);

const detail = ref(null);
const comments = ref([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const loading = ref(true);
const error = ref('');
const loadingMore = ref(false);

const hasMore = computed(() => comments.value.length < total.value);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [d, c] = await Promise.all([
      contentApi.post(props.postId),
      contentApi.postComments(props.postId, 1, size)
    ]);
    detail.value = d;
    comments.value = c.items || [];
    total.value = c.total || 0;
    page.value = 1;
    focus();
  } catch (e) {
    error.value = errText(e) || '加载失败';
    toast(errText(e));
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value) return;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const c = await contentApi.postComments(props.postId, next, size);
    comments.value = comments.value.concat(c.items || []);
    total.value = c.total || total.value;
    page.value = next;
  } catch (e) {
    toast(errText(e));
  } finally {
    loadingMore.value = false;
  }
}

/** 定位并高亮某条评论（楼中楼也能定位，因为它就在楼的 replies 里一起渲染）。 */
async function focus() {
  const target = props.focusCommentId;
  if (!target) return;
  await nextTick();
  const el = document.querySelector('#c-' + target);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('is-hl');
  setTimeout(() => el.classList.remove('is-hl'), 2000);
}

watch(() => props.postId, load, { immediate: true });
watch(() => props.focusCommentId, focus);

async function refresh() {
  await load();
  emit('changed');
}

function fmt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal" style="width: 860px">
      <h3>
        帖子 #{{ postId }}
        <span v-if="detail && detail.post.hidden" class="tag red" style="margin-left: 8px">已屏蔽</span>
      </h3>

      <div class="body">
        <div v-if="error" class="adm-error">
          <b>加载失败</b><span class="msg">{{ error }}</span>
          <button class="btn sm" @click="load">重试</button>
        </div>

        <div v-else-if="loading" class="muted">加载中…</div>

        <template v-else-if="detail">
          <div class="pd-title">{{ detail.post.title }}</div>
          <div class="pd-meta">
            <span class="tag blue">{{ detail.post.type }}</span>
            <span>作者：<b class="who" @click="userPop.open(detail.author.id, $event)">{{ detail.author.name || detail.author.id }}</b>（{{ detail.author.id }}）</span>
            <span class="muted">{{ fmt(detail.post.createdAt) }}</span>
          </div>
          <div class="pd-stats">
            <span>评论 {{ detail.stats.comments }}</span>
            <span>楼 {{ detail.stats.rootComments }}</span>
            <span>点赞 {{ detail.stats.likes }}</span>
            <span>浏览 {{ detail.stats.views }}</span>
          </div>

          <div class="pd-body">{{ detail.body }}</div>

          <div class="pd-actions">
            <ModerationBar type="post" :id="postId" :author-id="detail.author.id"
                           :hidden="detail.post.hidden" @changed="refresh" />
          </div>

          <div class="pd-sub">
            评论（{{ total }} 个楼）
            <span class="muted" style="font-size: 11.5px">含已屏蔽，仅管理端可见</span>
          </div>
          <CommentTree :items="comments" @changed="refresh" />
          <div v-if="hasMore" style="text-align: center; margin-top: 10px">
            <button class="btn sm" :disabled="loadingMore" @click="loadMore">
              {{ loadingMore ? '加载中…' : '加载更多楼' }}
            </button>
          </div>
        </template>
      </div>

      <div class="foot">
        <button class="btn" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pd-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
.pd-meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: #4E5969; }
.pd-stats { display: flex; gap: 14px; margin: 10px 0; font-size: 12.5px; color: #86909C; }
.pd-body { background: #FAFBFC; border: 1px solid #EFF0F1; border-radius: 10px; padding: 12px 14px;
  font-size: 13px; line-height: 1.75; white-space: pre-wrap; word-break: break-word; margin-bottom: 12px; }
.pd-actions { display: flex; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid #EFF0F1; }
.pd-sub { font-size: 13px; font-weight: 600; margin: 14px 0 4px; }
/* 点用户名看浮窗（与列表里一致的可点击样式） */
.pd-meta .who { color: #165DFF; cursor: pointer; }
.pd-meta .who:hover { text-decoration: underline; }
:deep(.is-hl) { background: #FFF7E8; transition: background .3s; }
</style>
