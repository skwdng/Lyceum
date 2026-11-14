<script setup>
/** 社区列表里的帖子卡（等价旧 community.js 的 cmPostCard）。 */
import { computed } from 'vue';
import { highlight } from '../utils/markdown.js';
import { typeName, typeClass, fmt, initial } from '../utils/community.js';

const props = defineProps({
  post: { type: Object, required: true },
  q: { type: String, default: '' }
});
const emit = defineEmits(['open']);

const topic = computed(() => props.post.topicTitle || props.post.topicId || '');
const titleHtml = computed(() => highlight(props.post.title, props.q));
const excerptHtml = computed(() => highlight(props.post.excerpt || '', props.q));
</script>

<template>
  <div class="post" @click="emit('open', post.id)">
    <div class="post-main">
      <div class="post-title">
        <span :class="typeClass(post.type)">{{ typeName(post.type) }}</span>
        <em v-html="titleHtml"></em>
      </div>
      <div class="post-excerpt" v-html="excerptHtml"></div>
      <div class="post-meta">
        <span class="au"><i class="mini-av">{{ initial(post.authorName) }}</i>{{ post.authorName }}</span>
        <span v-if="topic" class="mini-tag">辩题 · {{ topic }}</span>
        <span>👁 {{ post.viewCount }}</span>
        <span>👍 {{ post.likeCount }}</span>
        <span>发布 {{ fmt(post.createdAt) }}</span>
        <span style="margin-left: auto">最后回复 · {{ post.lastCommentAt ? fmt(post.lastCommentAt) : '暂无' }}</span>
      </div>
    </div>
    <div class="post-reply"><b>{{ post.commentCount }}</b><small>回复</small></div>
  </div>
</template>
