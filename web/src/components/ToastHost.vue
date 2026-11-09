<script setup>
/** 顶部 toast 容器：结构与旧版 #toast/.tst 一致，样式在 style.css 里已复用。 */
import { toastState } from '../utils/toast.js';
</script>

<template>
  <div id="toast">
    <div v-for="t in toastState.items" :key="t.id" class="tst">{{ t.msg }}</div>
  </div>
</template>
