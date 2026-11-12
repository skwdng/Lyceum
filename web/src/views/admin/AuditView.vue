<script setup>
/**
 * 处理记录 / 审计（原 AdminView 的 audit 面板 L367–422，逻辑 L35 / L136–142 / L177–190）。
 *
 * 「一键恢复」的三条既有语义原样保留：
 * · 必须二次确认，文案一字不改（恢复＝内容重新可见，**禁言不会一并解除**）；
 * · 只有 `canRestore` 的记录才给按钮，其余显示「不可恢复」；
 * · 已经是 RESTORE 的审计行没有"恢复"操作，状态列显示 `—`。
 *
 * 与旧版的唯一差异（用户不可见）：旧版恢复后顺带刷新举报队列的本地缓存；
 * 现在队列是独立子页，下次进入时自己重拉，不在本页发多余请求。
 */
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api.js';
import { useAdminStore } from '../../stores/admin.js';
import { toast } from '../../utils/toast.js';
import { actionName, errText, fmtTime } from './helpers.js';

const admin = useAdminStore();

const audit = ref(null);

onMounted(() => loadAudit(1));

async function loadAudit(page = 1) {
  try {
    audit.value = await adminApi.audit(page, 20);
  } catch (e) {
    toast(errText(e));
  }
}

async function restoreAudit(id) {
  if (!window.confirm('确认撤销这次处理？内容会重新可见')) return;
  try {
    await adminApi.restoreAudit(id);
    toast('已恢复：内容重新可见（禁言不会一并解除）');
    await Promise.all([
      loadAudit(audit.value ? audit.value.page : 1),
      admin.loadStats()
    ]);
  } catch (e) {
    toast(errText(e));
  }
}
</script>

<template>
  <div data-panel="audit">
    <div class="panel">
      <h2>处理记录<span class="spacer"></span></h2>
      <div v-if="!audit" class="muted" style="padding: 20px">加载中…</div>
      <div v-else-if="!(audit.items || []).length" class="muted" style="padding: 28px; text-align: center">
        还没有处理记录
      </div>
      <table v-else>
        <thead>
          <tr>
            <th style="width: 130px">时间</th>
            <th style="width: 90px">操作人</th>
            <th style="width: 140px">动作</th>
            <th style="width: 110px">对象</th>
            <th style="width: 80px">来源</th>
            <th>详情</th>
            <th style="width: 100px">状态</th>
            <th style="width: 90px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in audit.items" :key="r.id">
            <td class="muted" style="white-space: nowrap">{{ fmtTime(r.createdAt) }}</td>
            <td>{{ r.adminName || '#' + r.adminId }}</td>
            <td style="white-space: nowrap">
              <span class="tag" :class="r.action === 'RESTORE' ? 'blue' : 'orange'">{{ actionName(r.action) }}</span>
              <div v-if="r.verdict" class="muted" style="font-size: 11.5px">{{ actionName(r.verdict) }}</div>
            </td>
            <td style="white-space: nowrap">
              <template v-if="r.targetType === 'USER'">用户 {{ r.targetOwner || '' }}</template>
              <template v-else>{{ r.targetType ? (r.targetType === 'POST' ? '帖子' : '评论') + ' #' + r.targetId : '-' }}</template>
            </td>
            <td style="white-space: nowrap">
              <span class="tag" :class="r.source === 'MANUAL' ? 'blue' : ''">{{ r.source === 'MANUAL' ? '内容管理' : '举报' }}</span>
            </td>
            <td>{{ r.detail || '' }}</td>
            <td>
              <span v-if="r.action === 'RESTORE'" class="muted" style="font-size: 12px">—</span>
              <template v-else-if="r.undone">
                <span class="tag">已撤销</span>
                <div class="muted" style="font-size: 11.5px">{{ fmtTime(r.undoAt) }}</div>
              </template>
              <span v-else class="tag ok">生效中</span>
            </td>
            <td style="text-align: right">
              <template v-if="r.action !== 'RESTORE' && !r.undone">
                <button v-if="r.canRestore" class="btn sm danger" @click="restoreAudit(r.id)">恢复</button>
                <span v-else class="muted" style="font-size: 12px">不可恢复</span>
              </template>
              <span v-else-if="r.action !== 'RESTORE'" class="muted" style="font-size: 12px">已撤销</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="audit && audit.total > audit.size" class="pager">
        <span class="muted">共 {{ audit.total }} 条 · 第 {{ audit.page }} 页</span>
        <button class="btn sm" :disabled="audit.page <= 1" @click="loadAudit(audit.page - 1)">上一页</button>
        <button class="btn sm" :disabled="audit.page >= Math.ceil(audit.total / audit.size)" @click="loadAudit(audit.page + 1)">
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
