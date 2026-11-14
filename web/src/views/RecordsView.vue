<script setup>
/** 辩论记录（等价旧 records.js，纯展示）。 */
import { ref, computed, onMounted } from 'vue';
import { baseApi } from '../api.js';

const records = ref([]);
const error = ref('');

const avg = computed(() =>
  records.value.length
    ? Math.round(records.value.reduce((a, b) => a + b.total, 0) / records.value.length)
    : '—'
);
const totalTurns = computed(() => records.value.reduce((a, b) => a + b.turns, 0));

onMounted(async () => {
  try {
    records.value = (await baseApi.records()) || [];
  } catch (e) {
    error.value = (e && e.message) || '加载失败';
  }
});
</script>

<template>
  <h1 class="pg">辩论记录</h1>
  <p class="sub">没有段位、没有排名，只记录你打过什么。</p>

  <div v-if="error" class="card"><div class="empty">{{ error }}</div></div>

  <template v-else>
    <div class="grid g3" style="margin-bottom: 14px">
      <div class="card">
        <div style="font-size: 12px; color: #8a909c">总场次</div>
        <div class="big" style="font-size: 30px">{{ records.length }}</div>
      </div>
      <div class="card">
        <div style="font-size: 12px; color: #8a909c">平均分</div>
        <div class="big" style="font-size: 30px">{{ avg }}</div>
      </div>
      <div class="card">
        <div style="font-size: 12px; color: #8a909c">总发言回合</div>
        <div class="big" style="font-size: 30px">{{ totalTurns }}</div>
      </div>
    </div>

    <div class="card">
      <table v-if="records.length" class="t">
        <thead>
          <tr><th>辩题</th><th>席位</th><th>发言</th><th>得分</th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in records" :key="i">
            <td>{{ r.topic_title }}</td>
            <td class="mono">{{ r.seats }}</td>
            <td class="mono">{{ r.turns }}</td>
            <td><b>{{ r.total }}</b></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">还没有记录，去单人辩论打一场</div>
    </div>
  </template>
</template>
