<script setup>
/**
 * 一条根评论 + 它的楼中楼（等价旧 cmRootHTML / cmReplyHTML）。
 *
 * 行为与旧版一致：默认只显示前 3 条楼中楼，点「展开全部 N 条回复」再去拉；
 * 自己的内容显示「删除」，别人的显示「举报」；@昵称 只变浅蓝不加链接。
 *
 * 2026-11-28：楼中楼回复改成**行内输入框**，并接上 @ 候选（useMention）。
 * 每个 CommentNode 实例自己持有一份 useMention —— 不能提到父组件共享，
 * 否则同时打开两个回复框时，候选会按最后聚焦的那个输入框去插入（串台）。
 */
import { computed, ref } from 'vue';
import { mentionify, esc } from '../utils/markdown.js';
import { fmt, initial } from '../utils/community.js';
import { useMention } from '../composables/useMention.js';

const props = defineProps({
  comment: { type: Object, required: true },
  meId: { type: String, default: '' },
  focusId: { type: [String, Number], default: null }
});
const emit = defineEmits(['like', 'reply', 'remove', 'report', 'expand', 'submit-reply']);
// reply 事件保留在签名里（父组件还在监听），只是现在不再主动触发

const isMine = (c) => !!props.meId && String(c.authorId) === String(props.meId);

const preview = computed(() => {
  const all = props.comment.replies || [];
  return props.comment.expanded ? all : all.slice(0, 3);
});
const total = computed(() => props.comment.replyCount || (props.comment.replies || []).length);
const moreCount = computed(() => total.value - preview.value.length);

const bodyHtml = (c) => mentionify(esc(c.body));

// ==================== 行内回复（含 @ 候选） ====================

const mention = useMention();
/** 正在回复哪一条（null = 没打开）；同时只会开一个，避免页面上堆一堆输入框 */
const replyTo = ref(null);
const replyText = ref('');
const sending = ref(false);

/** 点「回复」：打开这一条的行内输入框（默认把对方昵称带进去，旧版也是这样） */
function openReply(c) {
  if (replyTo.value && String(replyTo.value.id) === String(c.id)) {
    replyTo.value = null;            // 再点一次收起
    mention.reset();
    return;
  }
  replyTo.value = { id: c.id, name: c.authorName };
  replyText.value = '';
  mention.reset();
  // 不再 emit('reply')：回复输入就地展开，不必再把人拽到底部那个「写回复」框
  // （底部框仍然可以写顶层评论；ReplyTarget 那条路留着不影响）
}

function closeReply() {
  replyTo.value = null;
  replyText.value = '';
  mention.reset();
}

async function send() {
  const text = String(replyText.value || '').trim();
  if (!text) return;
  sending.value = true;
  try {
    const payload = { commentId: replyTo.value.id, text };
    // 只提交正文里还留着的 @昵称（去重、最多 10 个）
    const ms = mention.ids(text);
    if (ms.length) payload.mentions = ms;
    emit('submit-reply', payload);
    replyText.value = '';
    replyTo.value = null;
    mention.reset();
  } finally {
    sending.value = false;
  }
}

/** 弹层选人：mousedown 选，避免 textarea 先失焦 */
function blurClose() {
  setTimeout(mention.close, 120);
}
</script>

<template>
  <div class="reply-item" :data-cid="comment.id" :class="{ 'cm-focus': String(focusId) === String(comment.id) }">
    <div class="reply-av">{{ initial(comment.authorName) }}</div>
    <div class="reply-body">
      <div class="reply-head">
        <b style="color: #1d2129; font-weight: 600">{{ comment.authorName }}</b>
        <span v-if="comment.isBot" class="ai-badge">AI</span>
        <span class="reply-time">{{ fmt(comment.createdAt) }}</span>
      </div>
      <div class="reply-text" v-html="bodyHtml(comment)"></div>
      <div class="reply-like">
        <span @click="emit('like', comment)">👍 {{ comment.likeCount }}{{ comment.liked ? ' · 已赞' : '' }}</span>
        <span @click="openReply(comment)">回复</span>
        <span v-if="isMine(comment)" @click="emit('remove', comment)">删除</span>
        <span v-else @click="emit('report', 'COMMENT', comment.id)">举报</span>
      </div>

      <!-- 行内回复框（2026-11-28：接上 @ 候选） -->
      <div v-if="replyTo && String(replyTo.id) === String(comment.id)" class="reply-editor">
        <textarea
          :id="'reply-editor-' + comment.id"
          v-model="replyText"
          maxlength="1000"
          :placeholder="'回复 ' + comment.authorName + '…（输入 @ 可以 @ 人）'"
          @input="mention.onInput"
          @keydown="mention.onKey"
          @blur="blurClose"
        ></textarea>
        <div class="reply-editor-foot">
          <span>{{ String(replyText || '').length }} / 1000</span>
          <span class="reply-editor-ops">
            <button class="btn btn-sm" @click="closeReply">取消</button>
            <button class="btn btn-primary btn-sm" :disabled="sending" @click="send">发布回复</button>
          </span>
        </div>
      </div>

      <div
        v-for="r in preview"
        :key="r.id"
        class="reply-sub"
        :data-cid="r.id"
        :class="{ 'cm-focus': String(focusId) === String(r.id) }"
      >
        <div class="reply-av">{{ initial(r.authorName) }}</div>
        <div class="reply-body">
          <div class="reply-head">
            <b style="color: #1d2129; font-weight: 600">{{ r.authorName }}</b>
            <span v-if="r.isBot" class="ai-badge">AI</span>
            <span style="color: #86909c">回复了</span>
            <b style="color: #4e5969; font-weight: 600">{{ r.replyObjectUserName || '' }}</b>
            <span class="reply-time">{{ fmt(r.createdAt) }}</span>
          </div>
          <div class="reply-text" v-html="bodyHtml(r)"></div>
          <div class="reply-like">
            <span @click="emit('like', r)">👍 {{ r.likeCount }}{{ r.liked ? ' · 已赞' : '' }}</span>
            <span @click="openReply(r)">回复</span>
            <span v-if="isMine(r)" @click="emit('remove', r)">删除</span>
            <span v-else @click="emit('report', 'COMMENT', r.id)">举报</span>
          </div>

          <div v-if="replyTo && String(replyTo.id) === String(r.id)" class="reply-editor">
            <textarea
              :id="'reply-editor-' + r.id"
              v-model="replyText"
              maxlength="1000"
              :placeholder="'回复 ' + r.authorName + '…（输入 @ 可以 @ 人）'"
              @input="mention.onInput"
              @keydown="mention.onKey"
              @blur="blurClose"
            ></textarea>
            <div class="reply-editor-foot">
              <span>{{ String(replyText || '').length }} / 1000</span>
              <span class="reply-editor-ops">
                <button class="btn btn-sm" @click="closeReply">取消</button>
                <button class="btn btn-primary btn-sm" :disabled="sending" @click="send">发布回复</button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="!comment.expanded && moreCount > 0"
        style="margin-top: 9px; font-size: 12px; color: #165dff; cursor: pointer"
        @click="emit('expand', comment.id)"
      >
        展开全部 {{ total }} 条回复
      </div>
    </div>

    <!-- @ 候选：每实例一份（fixed 定位到当前输入框下方） -->
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
        <b>{{ u.name }}</b><span v-if="u.isBot" class="ai-badge">AI</span><span>@{{ u.name }}</span>
      </div>
      <div v-if="!mention.state.items.length" class="mention-empty">没找到用户</div>
    </div>
  </div>
</template>
