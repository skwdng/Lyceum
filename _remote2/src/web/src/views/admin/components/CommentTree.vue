<script setup>
/**
 * 评论树：**两层**结构 —— `root_id` 为空的是「楼」，非空的是「楼中楼」。
 *
 * <p>数据由后端按楼分组好（`items[].replies`），这里只负责渲染，不再自己分组：
 * 前端分组会出现"翻页时一层楼被拆到两页"的问题，所以分页在后端按**楼**做。
 *
 * <p>每条评论都能单独处置（屏蔽/解除 + 禁言/封禁），因为管理台的价值就是"就地处理"。
 * 已屏蔽的评论在这里**照常显示**（带红色「已屏蔽」标记），否则没法解除。
 */
import ModerationBar from './ModerationBar.vue';
import { userPop } from '../userPop.js';

defineProps({
  items: { type: Array, default: () => [] }
});
const emit = defineEmits(['changed']);

function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<template>
  <div class="ct">
    <div v-if="!items.length" class="muted" style="padding: 12px 0">这个帖子还没有评论</div>

    <div v-for="root in items" :id="'c-' + root.id" :key="root.id" class="ct-item ct-root">
      <div class="ct-head">
        <span class="ct-author" @click="userPop.open(root.authorId, $event)">{{ root.authorName || root.authorId }}</span>
        <span class="tag">{{ root.floor }}</span>
        <span v-if="root.hidden" class="tag red">已屏蔽</span>
        <span class="muted ct-time">{{ fmtTime(root.createdAt) }}</span>
        <span class="spacer"></span>
        <ModerationBar type="comment" :id="root.id" :author-id="root.authorId"
                       :hidden="root.hidden" @changed="emit('changed')" />
      </div>
      <div class="ct-body" :class="{ dim: root.hidden }">{{ root.body }}</div>

      <div v-for="r in root.replies" :id="'c-' + r.id" :key="r.id" class="ct-item ct-reply">
        <div class="ct-head">
          <span class="ct-author" @click="userPop.open(r.authorId, $event)">{{ r.authorName || r.authorId }}</span>
          <span class="tag">楼中楼</span>
          <span v-if="r.hidden" class="tag red">已屏蔽</span>
          <span class="muted ct-time">{{ fmtTime(r.createdAt) }}</span>
          <span class="spacer"></span>
          <ModerationBar type="comment" :id="r.id" :author-id="r.authorId"
                         :hidden="r.hidden" @changed="emit('changed')" />
        </div>
        <div class="ct-body" :class="{ dim: r.hidden }">{{ r.body }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ct-item { border-top: 1px solid #F2F3F5; padding: 10px 0; }
.ct-root:first-child { border-top: none; }
.ct-reply { margin-left: 20px; padding-left: 12px; border-left: 2px solid #F2F3F5; border-top: none; }
.ct-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ct-author { font-size: 13px; font-weight: 600; color: #165DFF; cursor: pointer; }
.ct-author:hover { text-decoration: underline; }
.ct-time { font-size: 11.5px; }
.ct-body { margin-top: 6px; font-size: 13px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.ct-body.dim { color: #A8ADB8; text-decoration: line-through; }
</style>
