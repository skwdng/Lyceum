<script setup>
/**
 * 一条根评论 + 它的楼中楼（等价旧 cmRootHTML / cmReplyHTML）。
 *
 * 行为与旧版一致：默认只显示前 3 条楼中楼，点「展开全部 N 条回复」再去拉；
 * 自己的内容显示「删除」，别人的显示「举报」；@昵称 只变浅蓝不加链接。
 */
import { computed } from 'vue';
import { mentionify, esc } from '../utils/markdown.js';
import { fmt, initial } from '../utils/community.js';

const props = defineProps({
  comment: { type: Object, required: true },
  meId: { type: String, default: '' },
  focusId: { type: [String, Number], default: null }
});
const emit = defineEmits(['like', 'reply', 'remove', 'report', 'expand']);

const isMine = (c) => !!props.meId && String(c.authorId) === String(props.meId);

const preview = computed(() => {
  const all = props.comment.replies || [];
  return props.comment.expanded ? all : all.slice(0, 3);
});
const total = computed(() => props.comment.replyCount || (props.comment.replies || []).length);
const moreCount = computed(() => total.value - preview.value.length);

const bodyHtml = (c) => mentionify(esc(c.body));
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
        <span @click="emit('reply', comment)">回复</span>
        <span v-if="isMine(comment)" @click="emit('remove', comment)">删除</span>
        <span v-else @click="emit('report', 'COMMENT', comment.id)">举报</span>
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
            <span @click="emit('reply', r)">回复</span>
            <span v-if="isMine(r)" @click="emit('remove', r)">删除</span>
            <span v-else @click="emit('report', 'COMMENT', r.id)">举报</span>
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
  </div>
</template>
