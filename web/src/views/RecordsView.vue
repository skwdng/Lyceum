<script setup>
/**
 * 辩论记录（等价旧 records.js，纯展示）。
 *
 * 2026-11-28：每一行可以点开看**整场逐句**（RecordDetailView）。
 * 只有带 match_id 的行才可点 —— 更早的历史数据没有这个关联，点了也打不开一场不存在的对局。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { baseApi } from '../api.js';

const router = useRouter();
const records = ref([]);
const error = ref('');

const avg = computed(() =>
  records.value.length
    ? Math.round(records.value.reduce((a, b) => a + b.total, 0) / records.value.length)
    : '—'
);
const totalTurns = computed(() => records.value.reduce((a, b) => a + b.turns, 0));

/** 有 match_id 才能点进详情；没有的行保持原样（不可点、不报错）。 */
function openRecord(r) {
  if (!r || !r.match_id) return;
  router.push({ name: 'record-detail', params: { matchId: String(r.match_id) } });
}

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
  <p class="sub">没有段位、没有排名，只记录你打过什么。点任意一行可以看那一场的整场逐句。</p>

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
          <tr><th>辩题</th><th>席位</th><th>我方发言</th><th>得分</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in records"
            :key="i"
            :class="{ 'rec-click': !!r.match_id }"
            :title="r.match_id ? '点开看这一场的整场逐句' : '这条记录没有关联对局，看不了逐句'"
            @click="openRecord(r)"
          >
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

<style scoped>
/* 可点的行：指针 + hover 提示（没有 match_id 的行不加这个样式，保持"不可点"的观感） */
.rec-click {
  cursor: pointer;
}
.rec-click:hover td {
  background: #f7f8fa;
}
</style>
