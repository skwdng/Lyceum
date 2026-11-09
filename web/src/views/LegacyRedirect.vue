<script setup>
/**
 * 未迁移页面的临时落脚点：把浏览器送回旧前端对应视图。
 *
 * 旧前端 `boot()` 支持 `?v=<NAV key>` 深链（如 `/siyige/?v=community`），
 * 所以侧栏里没迁完的入口在新页面点下去不是白屏/404，而是"无缝回到旧页面那一屏"。
 *
 * 每一批迁完，就把 router.js 里对应路由换成真组件，这个组件自然少用一次；
 * 批 4 全量迁完后它会被删掉。
 */
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { API_BASE } from '../api.js';

const route = useRoute();

onMounted(() => {
  const v = route.meta.legacy || 'solo';
  // replace 而不是 assign：不在历史里留一条"中转页"，用户点后退不会来回弹
  location.replace(API_BASE + '/?v=' + encodeURIComponent(v));
});
</script>

<template>
  <div class="empty">正在打开旧版页面…</div>
</template>
