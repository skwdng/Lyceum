<script setup>
/**
 * 帖子管理（批次 2/6）：搜索 + 表格 + 详情抽屉 + 就地处置。
 *
 * <p>表格**包含已屏蔽的帖子**（status=2）—— 这是管理端和用户侧最重要的口径差别：
 * 用户侧看不到，管理端必须能看到才能解除。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { contentApi } from '../../api.js';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';
import ModerationBar from './components/ModerationBar.vue';
import PostDetailDrawer from './components/PostDetailDrawer.vue';
import { userPop } from './userPop.js';

const TYPES = [['', '全部类型'], ['CHAT', '闲聊'], ['GUIDE', '攻略'], ['HELP', '求助']];
const STATUSES = [['', '全部状态'], ['1', '正常'], ['2', '已屏蔽']];

const q = ref('');
const type = ref('');
const status = ref('');
const author = ref('');
const from = ref('');
const to = ref('');
const page = ref(1);
const size = 20;
const total = ref(0);
const items = ref([]);
const loading = ref(true);
const error = ref('');

/**
 * 抽屉：{ id, focusCommentId }。
 * 从评论管理点「查看所在帖子」跳过来时，URL 上带 `?post=..&comment=..`，
 * 这里读 query 直接把抽屉打开并定位那一层。
 */
const drawer = ref(null);
const route = useRoute();

/** 用户违规浮窗：全局单例（AdminLayout 里渲染），这里只管"点谁" */
function openPop(userId, ev) {
  userPop.open(userId, ev);
}

function openFromQuery() {
  const postId = route.query.post;
  if (!postId) return;
  drawer.value = { id: Number(postId), focusCommentId: route.query.comment || null };
}
watch(() => route.query, openFromQuery, { immediate: true });

const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await contentApi.posts({
      q: q.value.trim() || undefined,
      type: type.value || undefined,
      status: status.value || undefined,
      authorId: author.value.trim() || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      page: page.value,
      size
    });
    items.value = res.items || [];
    total.value = res.total || 0;
  } catch (e) {
    error.value = errText(e) || '加载失败';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

/** 浮窗里禁言/封禁后，列表状态跟着刷新 */
const offPop = userPop.onChanged(load);
onUnmounted(offPop);
onMounted(load);

function search() {
  page.value = 1;
  load();
}

function go(p) {
  if (p < 1 || p > pages.value) return;
  page.value = p;
  load();
}

function openDrawer(id, focusCommentId = null) {
  drawer.value = { id, focusCommentId };
}

function fmt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function onChanged() {
  load();          // 处置后刷新列表状态
}
</script>

<template>
  <div data-panel="content-posts">
    <div class="panel">
      <h2>
        帖子管理
        <span class="spacer"></span>
        <span class="muted" style="font-weight: 400; font-size: 12px">共 {{ total }} 条（含已屏蔽）</span>
      </h2>
      <div class="body">
        <div class="cp-bar">
          <input v-model="q" class="cp-input" placeholder="搜索标题或正文…" @keyup.enter="search" />
          <select v-model="type" class="cp-input" style="width: 120px" @change="search">
            <option v-for="t in TYPES" :key="t[0]" :value="t[0]">{{ t[1] }}</option>
          </select>
          <select v-model="status" class="cp-input" style="width: 120px" @change="search">
            <option v-for="s in STATUSES" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
          </select>
          <input v-model="author" class="cp-input" style="min-width: 150px" placeholder="作者 ID（如 ao279609）"
                 @keyup.enter="search" />
          <input v-model="from" class="cp-input" style="width: 150px" type="date" title="起始日期" @change="search" />
          <span class="muted" style="font-size: 12px">至</span>
          <input v-model="to" class="cp-input" style="width: 150px" type="date" title="结束日期" @change="search" />
          <button class="btn primary sm" @click="search">搜索</button>
          <button class="btn sm" @click="q = ''; type = ''; status = ''; author = ''; from = ''; to = ''; search()">重置</button>
        </div>

        <div v-if="error" class="adm-error">
          <b>加载失败</b><span class="msg">{{ error }}</span>
          <button class="btn sm" @click="load">重试</button>
        </div>
        <div v-else-if="loading" class="muted" style="padding: 18px 0">加载中…</div>

        <div v-else class="tbl-x">
          <table>
            <thead>
              <tr>
                <th style="width: 64px">ID</th>
                <th>标题</th>
                <th style="width: 76px">类型</th>
                <th style="width: 130px">作者</th>
                <th style="width: 76px">状态</th>
                <th style="width: 80px">评论</th>
                <th style="width: 128px">发布时间</th>
                <th style="width: 300px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!items.length">
                <td colspan="8" class="muted" style="padding: 22px; text-align: center">没有符合条件的帖子</td>
              </tr>
              <tr v-for="p in items" :key="p.id">
                <td class="muted">{{ p.id }}</td>
                <td>
                  <a class="cp-link" @click="openDrawer(p.id)">{{ p.title }}</a>
                </td>
                <td><span class="tag blue">{{ p.type }}</span></td>
                <td>
                  <span class="cp-link" @click="openPop(p.authorId, $event)">{{ p.authorName || p.authorId }}</span>
                </td>
                <td>
                  <span v-if="p.hidden" class="tag red">已屏蔽</span>
                  <span v-else class="tag ok">正常</span>
                </td>
                <td>{{ p.comments }}</td>
                <td class="muted">{{ fmt(p.createdAt) }}</td>
                <td>
                  <span class="cp-ops">
                    <button class="btn sm" @click="openDrawer(p.id)">详情</button>
                    <ModerationBar type="post" :id="p.id" :author-id="p.authorId"
                                   :hidden="p.hidden" :show-user-actions="false" @changed="onChanged" />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="cp-page">
          <button class="btn sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
          <span class="muted">{{ page }} / {{ pages }}</span>
          <button class="btn sm" :disabled="page >= pages" @click="go(page + 1)">下一页</button>
        </div>
      </div>
    </div>

    <PostDetailDrawer v-if="drawer" :post-id="drawer.id" :focus-comment-id="drawer.focusCommentId"
                      @close="drawer = null" @changed="onChanged" />
  </div>
</template>

<style scoped>
.cp-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
/* width:auto 是必需的：全局 `.adm-root input{width:100%}` 会让每个控件独占一行 */
.cp-input { width: auto; padding: 7px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px; min-width: 200px; }
.cp-link { color: #165DFF; cursor: pointer; }
.cp-link:hover { text-decoration: underline; }
.cp-ops { display: inline-flex; gap: 6px; align-items: center; }
.cp-page { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 12px; }
</style>
