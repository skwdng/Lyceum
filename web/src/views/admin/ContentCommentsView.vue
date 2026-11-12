<script setup>
/**
 * 评论管理（批次 3/6）：**跨帖**搜索全部评论，点「查看所在帖子」跳到帖子管理并定位到那一层。
 *
 * <p>定位是怎么做的：跳转只带两个 query（`post` / `comment`），帖子管理页读 query 打开详情抽屉，
 * 抽屉挂载后 `#c-{id}` 滚到视野中间并高亮 2 秒。不新开路由 —— 详情本来就是个抽屉，
 * 给它单独一条 `/admin/content/posts/:id` 只会让面包屑和"返回"逻辑变复杂。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { contentApi } from '../../api.js';
import { errText } from './helpers.js';
import ModerationBar from './components/ModerationBar.vue';
import UserProfilePop from './components/UserProfilePop.vue';

const router = useRouter();

/** 用户违规浮窗（点作者名弹出） */
const pop = ref(null);
function openPop(userId, ev) {
  if (!userId) return;
  pop.value = { id: userId, x: ev.clientX, y: ev.clientY };
}

const STATUSES = [['', '全部状态'], ['1', '正常'], ['2', '已屏蔽']];
const q = ref('');
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

const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await contentApi.comments({
      q: q.value.trim() || undefined,
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

/** 跳到帖子管理并定位这一层（楼中楼也能定位） */
function jumpToPost(c) {
  router.push({ path: '/admin/content/posts', query: { post: c.postId, comment: c.id } });
}

function fmt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<template>
  <div data-panel="content-comments">
    <div class="panel">
      <h2>
        评论管理
        <span class="spacer"></span>
        <span class="muted" style="font-weight: 400; font-size: 12px">共 {{ total }} 条（含已屏蔽）</span>
      </h2>
      <div class="body">
        <div class="cc-bar">
          <input v-model="q" class="cc-input" placeholder="搜索评论内容…" @keyup.enter="search" />
          <select v-model="status" class="cc-input" style="width: 120px" @change="search">
            <option v-for="s in STATUSES" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
          </select>
          <input v-model="author" class="cc-input" style="min-width: 150px" placeholder="作者 ID"
                 @keyup.enter="search" />
          <input v-model="from" class="cc-input" style="width: 150px" type="date" title="起始日期" @change="search" />
          <span class="muted" style="font-size: 12px">至</span>
          <input v-model="to" class="cc-input" style="width: 150px" type="date" title="结束日期" @change="search" />
          <button class="btn primary sm" @click="search">搜索</button>
          <button class="btn sm" @click="q = ''; status = ''; author = ''; from = ''; to = ''; search()">重置</button>
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
                <th>内容</th>
                <th style="width: 74px">层级</th>
                <th style="width: 130px">作者</th>
                <th style="width: 200px">所在帖子</th>
                <th style="width: 76px">状态</th>
                <th style="width: 128px">时间</th>
                <th style="width: 250px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!items.length">
                <td colspan="8" class="muted" style="padding: 22px; text-align: center">没有符合条件的评论</td>
              </tr>
              <tr v-for="c in items" :key="c.id">
                <td class="muted">{{ c.id }}</td>
                <td class="cc-body">{{ c.body }}</td>
                <td><span class="tag">{{ c.floor }}</span></td>
                <td>
                  <a class="cc-author" @click="openPop(c.authorId, $event)">{{ c.authorName || c.authorId }}</a>
                </td>
                <td>
                  <a class="cc-link" @click="jumpToPost(c)">#{{ c.postId }} {{ c.postTitle }}</a>
                </td>
                <td>
                  <span v-if="c.hidden" class="tag red">已屏蔽</span>
                  <span v-else class="tag ok">正常</span>
                </td>
                <td class="muted">{{ fmt(c.createdAt) }}</td>
                <td>
                  <span class="cc-ops">
                    <button class="btn sm" @click="jumpToPost(c)">查看所在帖子</button>
                    <ModerationBar type="comment" :id="c.id" :author-id="c.authorId"
                                   :hidden="c.hidden" :show-user-actions="false" @changed="load" />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="cc-page">
          <button class="btn sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
          <span class="muted">{{ page }} / {{ pages }}</span>
          <button class="btn sm" :disabled="page >= pages" @click="go(page + 1)">下一页</button>
        </div>
      </div>
    </div>

    <UserProfilePop v-if="pop" :user-id="pop.id" :x="pop.x" :y="pop.y"
                    @close="pop = null" @changed="load" />
  </div>
</template>

<style scoped>
.cc-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
/* width:auto 是必需的：全局 `.adm-root input{width:100%}` 会让每个控件独占一行 */
.cc-input { width: auto; padding: 7px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px; min-width: 220px; }
.cc-link { color: #165DFF; cursor: pointer; }
.cc-link:hover { text-decoration: underline; }
.cc-author { color: #165DFF; cursor: pointer; }
.cc-author:hover { text-decoration: underline; }
.cc-body { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-ops { display: inline-flex; gap: 6px; align-items: center; }
.cc-page { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 12px; }
</style>
