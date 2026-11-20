<script setup>
/** 社区列表里的帖子卡（等价旧 community.js 的 cmPostCard）。 */
import { computed } from 'vue';
import { highlight } from '../utils/markdown.js';
import { typeName, typeClass, fmt, initial, tagsHead } from '../utils/community.js';

const props = defineProps({
  post: { type: Object, required: true },
  q: { type: String, default: '' }
});
const emit = defineEmits(['open', 'tag']);

const topic = computed(() => props.post.topicTitle || props.post.topicId || '');
const titleHtml = computed(() => highlight(props.post.title, props.q));
const excerptHtml = computed(() => highlight(props.post.excerpt || '', props.q));
/** T2：卡片最多显示 3 个标签，多的显示 +N */
const tagView = computed(() => tagsHead(props.post.tags, 3));
</script>

<template>
  <div class="post" @click="emit('open', post.id)">
    <div class="post-main">
      <div class="post-title">
        <span :class="typeClass(post.type)">{{ typeName(post.type) }}</span>
        <em v-html="titleHtml"></em>
      </div>
      <div class="post-excerpt" v-html="excerptHtml"></div>
      <!-- T2：标签（前 3 个 + 折叠计数）；点标签直接筛列表，不打开帖子 -->
      <div v-if="tagView.shown.length" class="post-tags">
        <span
          v-for="t in tagView.shown"
          :key="t.id"
          class="p-tag"
          :data-tag-id="t.id"
          @click.stop="emit('tag', t.id)"
        >{{ t.name }}</span>
        <span v-if="tagView.more" class="p-tag more">+{{ tagView.more }}</span>
      </div>
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
