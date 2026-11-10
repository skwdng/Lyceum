<script setup>
/**
 * 帖子详情（等价旧 community.js 的 viewPostDetail）。
 *
 * 这次顺手把「通知点帖子」变成了**本地路由**：#/community/:postId?around=<commentId>
 * —— 旧版只能回落旧页再靠 `?postId=` 补丁定位，现在两边都由路由承载。
 *
 * 保真的几个点：
 * · 进详情先 POST /view 再拉详情（旧版 B3：顺序反了每次都会少算一次浏览）；
 * · 点赞走「乐观更新 → 服务端回读」，失败回滚；
 * · 回复支持 @提及（只提交正文里还留着的 @昵称）、楼中楼回复目标、1000 字上限；
 * · 命中敏感词是「打码放行」，提示一句而不是报错；
 * · aroundCommentId 定位：先把楼中楼展开再滚过去并高亮 2 秒。
 */
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { communityApi } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useMetaStore } from '../stores/meta.js';
import { markdown, mentionify, esc } from '../utils/markdown.js';
import { fmt, initial, typeName, typeClass, normalizePost, normalizeComment, normalizeList, errText } from '../utils/community.js';
import { useMention } from '../composables/useMention.js';
import { toast } from '../utils/toast.js';
import CommentNode from '../components/CommentNode.vue';
import PostEditorModal from '../components/PostEditorModal.vue';
import ReportModal from '../components/ReportModal.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const meta = useMetaStore();
const mention = useMention();

const post = ref(null);
const comments = ref([]);
const commentTotal = ref(0);
const commentPage = ref(1);
const related = ref([]);
const draft = ref('');
const replyTarget = ref(null);      // {commentId, name}
const focus = ref(null);            // {commentId, rootId}
const editorOpen = ref(false);
const report = ref(null);           // {type, id}
const ban = ref(null);
const loading = ref(true);

const meId = computed(() => (auth.user && auth.user.id) || '');
const isMine = computed(() => !!post.value && !!meId.value && String(post.value.authorId) === String(meId.value));
const topic = computed(() => (post.value ? post.value.topicTitle || topicName(post.value.topicId) : ''));
const bodyHtml = computed(() => (post.value ? markdown(post.value.body) : ''));
const commentPages = computed(() => Math.max(1, Math.ceil(commentTotal.value / 10)));

function topicName(id) {
  if (!id) return '';
  const t = (meta.topics || []).find((x) => String(x.id) === String(id));
  return t ? t.title : '';
}

async function loadPost(id, aroundCommentId) {
  loading.value = true;
  try {
    try {
      await communityApi.markView(id);       // 先计数（旧版 B3 的顺序）
    } catch (e) {
      /* 浏览计数失败不影响详情 */
    }
    const res = await communityApi.post(id);
    post.value = normalizePost(res && res.post ? res.post : res);
  } catch (e) {
    toast(errText(e));
    router.replace({ name: 'community' });
    return;
  } finally {
    loading.value = false;
  }
  await Promise.all([loadComments(id, 1, aroundCommentId), loadRelated(post.value.type, id)]);
}

async function loadComments(postId, page, aroundCommentId) {
  commentPage.value = page || 1;
  try {
    const res = await communityApi.comments(postId, aroundCommentId
      ? { page: commentPage.value, size: 10, aroundCommentId }
      : { page: commentPage.value, size: 10 });
    const norm = normalizeList(res);
    comments.value = norm.items.map(normalizeComment);
    commentTotal.value = norm.total;
    // 后端可能替我们算了页码（按 aroundCommentId 定位时），必须写回去
    if (res && res.page) commentPage.value = Number(res.page) || commentPage.value;
    focus.value = aroundCommentId ? (res && res.focus) || { commentId: aroundCommentId, rootId: null } : null;
    if (aroundCommentId && !(res && res.focus)) toast('该评论可能已被删除，已跳到第一页');
  } catch (e) {
    comments.value = [];
    commentTotal.value = 0;
    toast('评论加载失败：' + errText(e));
  }
  if (aroundCommentId) nextTick(() => focusJump());
}

async function loadRelated(type, exceptId) {
  try {
    const res = await communityApi.posts({ type, sort: 'HOT', page: 1, size: 6 });
    related.value = normalizeList(res).items
      .map(normalizePost)
      .filter((p) => String(p.id) !== String(exceptId))
      .slice(0, 3);
  } catch (e) {
    related.value = [];
  }
}

async function loadBan() {
  if (!auth.user) return;
  try {
    ban.value = await communityApi.myBan();
  } catch (e) {
    ban.value = null;
  }
}

onMounted(async () => {
  await meta.ensureTopics();
  loadBan();
  const id = route.params.postId;
  const around = route.query.around ? String(route.query.around) : undefined;
  await loadPost(id, around);
});

// 同一个路由内换帖子（相关帖子点击）
watch(
  () => route.params.postId,
  async (id, old) => {
    if (!id || id === old) return;
    await loadPost(id, undefined);
  }
);

/** 定位到被点的那一楼：楼中楼先展开，再滚过去高亮 2 秒 */
async function focusJump() {
  const f = focus.value;
  if (!f) return;
  const rootId = f.rootId;
  const cid = f.commentId;
  if (String(cid) !== String(rootId)) {
    const root = (comments.value || []).find((c) => String(c.id) === String(rootId));
    if (root && !root.expanded) await expandReplies(rootId);
  }
  setTimeout(() => {
    const el = document.querySelector('[data-cid="' + cid + '"]') || document.querySelector('[data-cid="' + rootId + '"]');
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      el.scrollIntoView();
    }
    el.classList.add('cm-focus');
    setTimeout(() => el.classList.remove('cm-focus'), 2000);
  }, 80);
}

async function expandReplies(rootId) {
  try {
    const res = await communityApi.replies(rootId, 1, 50);
    const norm = normalizeList(res);
    const root = comments.value.find((c) => String(c.id) === String(rootId));
    if (root) {
      root.replies = norm.items.map(normalizeComment);
      root.replyCount = norm.total;
      root.expanded = true;
    }
  } catch (e) {
    toast('展开失败：' + errText(e));
  }
}

async function toggleLike() {
  const p = post.value;
  if (!p) return;
  const on = !p.liked;
  // 乐观更新：先动 UI，再以服务端为准
  p.liked = on;
  p.likeCount = Math.max(0, p.likeCount + (on ? 1 : -1));
  try {
    await communityApi.likePost(p.id, on);
    const res = await communityApi.post(p.id);
    post.value = normalizePost(res && res.post ? res.post : res);
    toast(on ? '已点赞' : '已取消点赞');
  } catch (e) {
    p.liked = !on;
    p.likeCount = Math.max(0, p.likeCount + (on ? -1 : 1));
    toast(errText(e));
  }
}

async function likeComment(c) {
  const on = !c.liked;
  c.liked = on;
  c.likeCount = Math.max(0, c.likeCount + (on ? 1 : -1));
  try {
    await communityApi.likeComment(c.id, on);
    await loadComments(post.value.id, commentPage.value);
  } catch (e) {
    c.liked = !on;
    c.likeCount = Math.max(0, c.likeCount + (on ? -1 : 1));
    toast(errText(e));
  }
}

function startReply(c) {
  replyTarget.value = { commentId: c.id, name: c.authorName };
  nextTick(() => {
    const el = document.querySelector('#replyInput');
    if (el) el.focus();
  });
}

async function removeComment(c) {
  if (!window.confirm('删除这条评论？')) return;
  try {
    await communityApi.deleteComment(c.id);
    await loadPost(post.value.id, undefined);
    toast('已删除');
  } catch (e) {
    toast(errText(e));
  }
}

async function removePost() {
  if (!window.confirm('删除这篇帖子？删除后其下评论一并不可见')) return;
  try {
    await communityApi.deletePost(post.value.id);
    toast('已删除');
    router.replace({ name: 'community' });
  } catch (e) {
    toast(errText(e));
  }
}

async function submitReply() {
  const text = String(draft.value || '').trim();
  if (!text) return toast('写点什么吧');
  if (text.length > 1000) return toast('评论最多 1000 字');
  const payload = { body: text, replyObjectType: replyTarget.value ? 'COMMENT' : 'POST' };
  if (replyTarget.value) payload.replyObjectCommentId = replyTarget.value.commentId;
  const mentions = mention.ids(text);
  if (mentions.length) payload.mentions = mentions;
  try {
    const res = await communityApi.addComment(post.value.id, payload);
    draft.value = '';
    replyTarget.value = null;
    mention.reset();
    await loadPost(post.value.id, undefined);
    const newId = res && res.commentId;
    const created = newId ? findComment(newId) : null;
    if (created && String(created.body).indexOf('＊') >= 0) toast('回复已发布，含敏感词已自动打码');
    else toast('回复已发布');
  } catch (e) {
    toast(errText(e));
  }
}

function findComment(id) {
  let found = null;
  (comments.value || []).forEach((c) => {
    if (String(c.id) === String(id)) found = c;
    (c.replies || []).forEach((r) => {
      if (String(r.id) === String(id)) found = r;
    });
  });
  return found;
}

function openEditor() {
  if (!auth.user) return toast('请先登录');
  editorOpen.value = true;
}

function onSaved() {
  editorOpen.value = false;
  if (post.value) loadPost(post.value.id, undefined);
}

function openReport(type, id) {
  if (!auth.user) {
    toast('请先登录再举报');
    return;
  }
  report.value = { type, id };
}

function back() {
  router.push({ name: 'community' });
}
</script>

<template>
  <div class="cm">
    <div class="page-head" style="margin-bottom: 16px">
      <div style="display: flex; align-items: center; gap: 12px">
        <button class="btn btn-sm" @click="back">← 返回社区</button>
        <span v-if="post" :class="typeClass(post.type)">{{ typeName(post.type) }}</span>
      </div>
      <div v-if="post" style="display: flex; align-items: center; gap: 10px">
        <div style="font-size: 12.5px; color: #86909c">
          {{ post.viewCount }} 次浏览 · 最后回复 {{ post.lastCommentAt ? fmt(post.lastCommentAt) : '暂无' }}
        </div>
        <button v-if="!isMine" class="btn btn-sm" @click="openReport('POST', post.id)">⋯ 举报</button>
      </div>
    </div>

    <div
      v-if="ban && ban.banned"
      style="display: flex; align-items: center; gap: 10px; background: #fff7e8; border: 1px solid #ffe4ba; color: #b8740a; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px"
    >
      <b>你已被禁言</b>
      <span>至 {{ ban.until ? new Date(ban.until).toLocaleString() : '' }}{{ ban.reason ? ' · 原因：' + ban.reason : '' }}</span>
      <span style="opacity: 0.75; margin-left: auto">不能发帖 / 评论 / 编辑 / 点赞，浏览正常</span>
    </div>

    <div v-if="loading && !post" class="ccard" style="padding: 48px; text-align: center; color: #86909c">
      正在加载帖子…
    </div>

    <div v-else-if="post" class="comm">
      <div class="comm-main">
        <div class="ccard" style="padding: 24px 26px">
          <h2 style="font-size: 20px; font-weight: 700; line-height: 1.5; margin-bottom: 16px">{{ post.title }}</h2>
          <div style="display: flex; align-items: center; gap: 10px; padding-bottom: 16px; border-bottom: 1px solid #f2f3f5; margin-bottom: 18px">
            <div class="reply-av" style="width: 34px; height: 34px; border-radius: 9px">{{ initial(post.authorName) }}</div>
            <div>
              <div style="font-size: 13px; font-weight: 600">{{ post.authorName }}</div>
              <div style="font-size: 11.5px; color: #a9aeb8; margin-top: 1px">
                发布于 {{ fmt(post.createdAt) }}{{ topic ? ' · 辩题「' + topic + '」' : '' }}
              </div>
            </div>
            <div v-if="isMine" style="margin-left: auto; display: flex; gap: 8px">
              <button class="btn btn-sm" @click="openEditor">编辑</button>
              <button class="btn btn-sm" @click="removePost">删除</button>
            </div>
          </div>

          <div class="post-body" v-html="bodyHtml"></div>

          <div style="display: flex; gap: 10px; margin-top: 22px; padding-top: 18px; border-top: 1px solid #f2f3f5">
            <button class="btn" :class="{ 'btn-primary': post.liked }" @click="toggleLike">
              👍 {{ post.liked ? '已赞' : '点赞' }} {{ post.likeCount }}
            </button>
          </div>
        </div>

        <div class="ccard" style="padding: 20px 24px; margin-top: 16px">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 6px">
            全部回复 <span style="color: #86909c; font-size: 12.5px; font-weight: 400">（{{ post.commentCount }}）</span>
          </div>
          <template v-if="comments.length">
            <CommentNode
              v-for="c in comments"
              :key="c.id"
              :comment="c"
              :me-id="meId"
              :focus-id="focus ? focus.commentId : null"
              @like="likeComment"
              @reply="startReply"
              @remove="removeComment"
              @report="openReport"
              @expand="expandReplies"
            />
          </template>
          <div v-else style="padding: 26px 0; text-align: center; color: #86909c; font-size: 13px">
            还没有回复，来抢沙发
          </div>

          <div v-if="commentPages > 1" class="pager">
            <button class="btn btn-sm" :disabled="commentPage <= 1" @click="loadComments(post.id, commentPage - 1)">上一页</button>
            <span>第 {{ commentPage }} / {{ commentPages }} 页</span>
            <button class="btn btn-sm" :disabled="commentPage >= commentPages" @click="loadComments(post.id, commentPage + 1)">下一页</button>
          </div>
        </div>

        <div class="ccard" style="padding: 20px 24px; margin-top: 16px">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px">写回复</div>
          <div v-if="replyTarget" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px">
            <span class="fchip"><b>回复 {{ replyTarget.name }}</b><i @click="replyTarget = null">✕</i></span>
          </div>
          <textarea
            id="replyInput"
            v-model="draft"
            maxlength="1000"
            placeholder="说说你的看法…（输入 @ 可以 @ 人）"
            style="width: 100%; min-height: 96px; border: 1px solid #e5e6eb; border-radius: 9px; padding: 12px 14px; font-size: 14px; line-height: 1.7; outline: none; resize: vertical; font-family: inherit"
            @input="mention.onInput"
            @keydown="mention.onKey"
            @blur="setTimeout(mention.close, 120)"
          ></textarea>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px">
            <span style="font-size: 11.5px; color: #a9aeb8">{{ String(draft || '').length }} / 1000</span>
            <button class="btn btn-primary btn-sm" @click="submitReply">发布回复</button>
          </div>
        </div>
      </div>

      <div class="comm-side">
        <div class="ccard" style="padding: 16px 18px; margin-bottom: 14px">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px">本帖数据</div>
          <div class="cm-stat"><span>浏览</span><b>{{ post.viewCount }}</b></div>
          <div class="cm-stat"><span>回复</span><b>{{ post.commentCount }}</b></div>
          <div class="cm-stat"><span>点赞</span><b>{{ post.likeCount }}</b></div>
        </div>
        <div class="ccard" style="padding: 16px 18px">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 11px">相关帖子</div>
          <template v-if="related.length">
            <div
              v-for="x in related"
              :key="x.id"
              class="side-item"
              style="cursor: pointer; align-items: flex-start; line-height: 1.5"
              @click="router.push({ name: 'community-post', params: { postId: String(x.id) } })"
            >
              <span :class="typeClass(x.type)" style="transform: scale(0.9)">{{ typeName(x.type) }}</span>
              <span style="flex: 1">{{ String(x.title || '').slice(0, 18) }}…</span>
            </div>
          </template>
          <div v-else style="font-size: 12.5px; color: #a9aeb8">暂无</div>
        </div>
      </div>
    </div>

    <!-- @ 候选 -->
    <div
      v-if="mention.state.open"
      class="mention-box"
      :style="{ left: mention.state.left + 'px', top: mention.state.top + 'px' }"
    >
      <div
        v-for="(u, i) in mention.state.items"
        :key="u.id"
        class="mention-item"
        :class="{ on: i === mention.state.active }"
        @mousedown.prevent="mention.pick(i)"
      >
        <b>{{ u.name }}</b><span>@{{ u.name }}</span>
      </div>
    </div>

    <PostEditorModal v-if="editorOpen && post" :post="post" @close="editorOpen = false" @saved="onSaved" />
    <ReportModal
      v-if="report"
      :target-type="report.type"
      :target-id="report.id"
      @close="report = null"
      @done="report = null"
    />
  </div>
</template>
