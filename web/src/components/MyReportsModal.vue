<script setup>
/** 我的举报（等价旧 cmRenderMyReports）。 */
import { ref, onMounted } from 'vue';
import { communityApi } from '../api.js';
import { fmt, reasonName, actionName, errText } from '../utils/community.js';
import { toast } from '../utils/toast.js';

const emit = defineEmits(['close']);

const data = ref(null);
const busy = ref(false);

async function load(page = 1) {
  busy.value = true;
  try {
    data.value = await communityApi.myReports(page, 10);
  } catch (e) {
    toast('加载失败：' + errText(e));
    data.value = { items: [], total: 0, page: 1, size: 10 };
  } finally {
    busy.value = false;
  }
}

onMounted(() => load(1));
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="cm-modal">
      <h3>我的举报</h3>
      <div class="page-desc">共 {{ (data && data.total) || 0 }} 条 · 处理结果由管理员决定</div>

      <div style="max-height: 52vh; overflow: auto; margin-top: 12px">
        <div v-if="!data" style="padding: 28px 0; text-align: center; color: #86909c; font-size: 13px">
          加载中…
        </div>
        <div
          v-else-if="!(data.items || []).length"
          style="padding: 28px 0; text-align: center; color: #86909c; font-size: 13px"
        >
          还没有举报记录
        </div>
        <div
          v-for="r in (data && data.items) || []"
          :key="r.id"
          style="padding: 12px 0; border-bottom: 1px solid #f2f3f5"
        >
          <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #86909c">
            <span class="mini-tag">{{ r.targetType === 'POST' ? '帖子' : '评论' }}</span>
            <span>{{ reasonName(r.reason) }}</span>
            <span style="margin-left: auto">{{ fmt(r.createdAt) }}</span>
          </div>
          <div style="margin-top: 6px; font-size: 13.5px; color: #1d2129">
            {{ r.targetSummary || '（内容已删除）' }}
          </div>
          <div v-if="r.detail" style="margin-top: 4px; font-size: 12.5px; color: #86909c">
            补充：{{ r.detail }}
          </div>
          <div style="margin-top: 6px; font-size: 12.5px">
            <b v-if="r.status === 'PENDING'" style="color: #b8740a">待处理</b>
            <b v-else-if="r.status === 'REJECTED'" style="color: #86909c">已驳回</b>
            <b v-else style="color: #00b42a">已处理{{ r.action ? '（' + actionName(r.action) + '）' : '' }}</b>
            <span v-if="r.handledAt" style="color: #a9aeb8"> · {{ fmt(r.handledAt) }}</span>
          </div>
        </div>
      </div>

      <div class="cm-modal-foot">
        <button
          v-if="data && data.total > data.size"
          class="btn"
          :disabled="(data.page || 1) <= 1 || busy"
          @click="load((data.page || 1) - 1)"
        >
          上一页
        </button>
        <button
          v-if="data && data.total > data.size"
          class="btn"
          :disabled="(data.page || 1) >= Math.ceil(data.total / data.size) || busy"
          @click="load((data.page || 1) + 1)"
        >
          下一页
        </button>
        <button class="btn btn-primary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>
