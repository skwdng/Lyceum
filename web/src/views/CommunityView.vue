<script setup>
/**
 * 社区列表（等价旧 community.js 的 viewPostList）。
 *
 * 与旧版一致的交互：
 * · 搜索只匹配标题、280ms 防抖、清空按钮；
 * · 类型 / 排序 / 时间范围 / 关联辩题 四种筛选，命中的条件显示成「筛选胶囊」可单点移除；
 * · 分页（后端固定返回 {items,total,page,size}）；侧栏概览 / 热门辩题 / 发帖须知；
 * · 被禁言时顶部黄条（浏览不受影响，只是不能发内容）。
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { communityApi } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useMetaStore } from '../stores/meta.js';
import { CM_TYPES, CM_SORTS, CM_RANGES, typeName, rangeName, normalizeList, normalizePost, errText } from '../utils/community.js';
import { toast } from '../utils/toast.js';
import CommunityPostCard from '../components/CommunityPostCard.vue';
import PostEditorModal from '../components/PostEditorModal.vue';
import MyReportsModal from '../components/MyReportsModal.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const meta = useMetaStore();

const posts = ref([]);
const total = ref(0);
const loading = ref(false);
const q = ref('');
const type = ref('ALL');
const sort = ref('NEW');
const range = ref('ALL');
const topicId = ref('');
const page = ref(1);
const size = ref(10);
const ban = ref(null);
const editorOpen = ref(false);
const myReportsOpen = ref(false);

let searchTimer = null;

const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
const viewsSum = computed(() => posts.value.reduce((a, p) => a + p.viewCount, 0));
const todayNew = computed(() => {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return posts.value.filter((p) => p.createdAt >= start).length;
});
const hotTopicIds = computed(() => {
  const cnt = {};
  posts.value.forEach((p) => {
    if (p.topicId) cnt[p.topicId] = (cnt[p.topicId] || 0) + 1;
  });
  return Object.keys(cnt)
    .sort((a, b) => cnt[b] - cnt[a])
    .slice(0, 8);
});
const chips = computed(() => {
  const out = [];
  if (type.value !== 'ALL') out.push(['type', '类型：' + typeName(type.value)]);
  if (topicId.value) out.push(['topicId', '辩题：' + topicName(topicId.value)]);
  if (range.value !== 'ALL') out.push(['range', '时间：' + rangeName(range.value)]);
  if (q.value.trim()) out.push(['q', '关键词：' + q.value.trim()]);
  return out;
});

function topicName(id) {
  const t = (meta.topics || []).find((x) => String(x.id) === String(id));
  return t ? t.title : id;
}

async function loadPosts() {
  loading.value = true;
  try {
    const res = await communityApi.posts({
      type: type.value === 'ALL' ? '' : type.value,
      title: q.value.trim(),
      topicId: topicId.value,
      range: range.value,
      sort: sort.value,
      page: page.value,
      size: size.value
    });
    const norm = normalizeList(res);
    posts.value = norm.items.map(normalizePost);
    total.value = norm.total;
  } catch (e) {
    posts.value = [];
    total.value = 0;
    toast('社区列表加载失败：' + errText(e));
  } finally {
    loading.value = false;
  }
}

async function loadBan() {
  if (!auth.user) {
    ban.value = null;
    return;
  }
  try {
    ban.value = await communityApi.myBan();
  } catch (e) {
    ban.value = null;
  }
}

onMounted(async () => {
  // 从通知深链回来可能带筛选（?topicId=…），这里接一下
  if (route.query.topicId) topicId.value = String(route.query.topicId);
  await Promise.all([meta.ensureTopics(), loadBan()]);
  await loadPosts();
});

// 搜索防抖：只匹配标题，280ms（旧版同款）
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadPosts();
  }, 280);
});

function setFilter(k, v) {
  if (k === 'type') type.value = v;
  else if (k === 'sort') sort.value = v;
  else if (k === 'range') range.value = v;
  else if (k === 'topicId') topicId.value = v;
  page.value = 1;
  loadPosts();
}

function removeFilter(k) {
  if (k === 'type') type.value = 'ALL';
  else if (k === 'topicId') topicId.value = '';
  else if (k === 'range') range.value = 'ALL';
  else if (k === 'q') q.value = '';
  page.value = 1;
  loadPosts();
}

function clearFilters() {
  q.value = '';
  type.value = 'ALL';
  topicId.value = '';
  range.value = 'ALL';
  page.value = 1;
  loadPosts();
}

function goPage(p) {
  page.value = p;
  loadPosts();
}

function openPost(id) {
  router.push({ name: 'community-post', params: { postId: String(id) } });
}

function openEditor() {
  if (!auth.user) {
    toast('请先登录');
    router.push({ name: 'login', query: { next: '/community' } });
    return;
  }
  editorOpen.value = true;
}

function onSaved(info) {
  editorOpen.value = false;
  if (info && info.id) {
    router.push({ name: 'community-post', params: { postId: String(info.id) } });
  } else {
    loadPosts();
  }
}
</script>

<template>
  <div class="cm">
    <div class="page-head">
      <div>
        <div class="page-title">社区</div>
        <div class="page-desc">
          {{ total }} 篇帖子 · 闲聊 / 教程 / 求助，辩完之后来这聊聊
          <span class="mini-tag" style="margin-left: 6px">接口已接通</span>
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center">
        <button class="btn" @click="myReportsOpen = true">我的举报</button>
        <button class="btn btn-primary" @click="openEditor">＋ 发布帖子</button>
      </div>
    </div>

    <!-- 禁言黄条 -->
    <div
      v-if="ban && ban.banned"
      style="display: flex; align-items: center; gap: 10px; background: #fff7e8; border: 1px solid #ffe4ba; color: #b8740a; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px"
    >
      <b>你已被禁言</b>
      <span>至 {{ ban.until ? new Date(ban.until).toLocaleString() : '' }}{{ ban.reason ? ' · 原因：' + ban.reason : '' }}</span>
      <span style="opacity: 0.75; margin-left: auto">不能发帖 / 评论 / 编辑 / 点赞，浏览正常</span>
    </div>

    <div class="comm">
      <div class="comm-main">
        <div class="ccard" style="padding: 14px 16px; margin-bottom: 14px">
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center">
            <div class="sbox">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
              </svg>
              <input v-model="q" placeholder="搜索帖子标题…">
              <button v-if="q" class="clr" @click="q = ''">✕</button>
            </div>
            <div class="tabs">
              <button
                v-for="t in CM_TYPES"
                :key="t.k"
                class="tab"
                :class="{ active: type === t.k }"
                @click="setFilter('type', t.k)"
              >
                {{ t.n }}
              </button>
            </div>
          </div>

          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #f2f3f5">
            <div class="tabs">
              <button
                v-for="s in CM_SORTS"
                :key="s.k"
                class="tab"
                :class="{ active: sort === s.k }"
                @click="setFilter('sort', s.k)"
              >
                {{ s.n }}
              </button>
            </div>
            <select class="sel" :value="range" @change="setFilter('range', $event.target.value)">
              <option v-for="r in CM_RANGES" :key="r.k" :value="r.k">{{ r.n }}</option>
            </select>
            <select class="sel" :value="topicId" @change="setFilter('topicId', $event.target.value)">
              <option value="">全部辩题</option>
              <option v-for="t in meta.topics" :key="t.id" :value="String(t.id)">{{ t.title }}</option>
            </select>
            <span style="font-size: 12.5px; color: #86909c">共 {{ total }} 篇</span>
            <div style="display: flex; gap: 7px; flex-wrap: wrap; align-items: center">
              <span v-for="c in chips" :key="c[0]" class="fchip">
                <b>{{ c[1] }}</b><i @click="removeFilter(c[0])">✕</i>
              </span>
            </div>
            <button class="btn btn-sm btn-ghost" style="margin-left: auto" @click="clearFilters">清除全部</button>
          </div>
        </div>

        <div v-if="loading" class="ccard" style="padding: 48px; text-align: center; color: #86909c">正在加载…</div>
        <template v-else-if="posts.length">
          <CommunityPostCard v-for="p in posts" :key="p.id" :post="p" :q="q" @open="openPost" />
        </template>
        <div v-else class="empty-box">
          没有匹配的帖子{{ q ? '：搜索「' + q + '」' : '' }}
          <br>
          <button class="btn btn-sm" style="margin-top: 14px" @click="clearFilters">清除筛选条件</button>
        </div>

        <div v-if="pages > 1" class="pager">
          <button class="btn btn-sm" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
          <span>第 {{ page }} / {{ pages }} 页</span>
          <button class="btn btn-sm" :disabled="page >= pages" @click="goPage(page + 1)">下一页</button>
        </div>
      </div>

      <div class="comm-side">
        <div class="ccard" style="padding: 16px 18px; margin-bottom: 14px">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px">社区概览</div>
          <div class="cm-stat"><span>帖子总数</span><b>{{ total }}</b></div>
          <div class="cm-stat"><span>本页今日新增</span><b style="color: #00b42a">＋{{ todayNew }}</b></div>
          <div class="cm-stat"><span>本页浏览合计</span><b style="color: #165dff">{{ viewsSum }}</b></div>
        </div>

        <div class="ccard" style="padding: 16px 18px; margin-bottom: 14px">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 11px">
            热门辩题 <span style="font-size: 11.5px; color: #a9aeb8; font-weight: 400">点击筛选</span>
          </div>
          <div>
            <template v-if="hotTopicIds.length">
              <span
                v-for="id in hotTopicIds"
                :key="id"
                class="htag"
                :class="{ on: String(topicId) === String(id) }"
                @click="setFilter('topicId', String(id))"
              >
                {{ topicName(id) || id }}
              </span>
            </template>
            <span v-else style="font-size: 12.5px; color: #a9aeb8">当前列表没有关联辩题的帖子</span>
          </div>
        </div>

        <div class="ccard" style="padding: 16px 18px">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px">发帖须知</div>
          <div style="font-size: 12.5px; color: #86909c; line-height: 1.85">
            只显示昵称，不显示段位 / 积分 / 场次。<br>
            搜索只匹配标题。<br>
            正文支持 Markdown，图片只能用外链。<br>
            点赞只影响热度，不进入任何评分。
          </div>
        </div>
      </div>
    </div>

    <PostEditorModal v-if="editorOpen" @close="editorOpen = false" @saved="onSaved" />
    <MyReportsModal v-if="myReportsOpen" @close="myReportsOpen = false" />
  </div>
</template>
