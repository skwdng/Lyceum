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

/**
 * 筛选条件。全部空 = 不过滤（与改造前行为一致）。
 * `q` 关键词（详情/操作人/内容作者）、`adm` 操作人（纯数字按 id）、
 * `action` / `verdict` / `targetType` / `source` 精确匹配，`from` / `to` 为 `yyyy-MM-dd`（含当天）。
 */
const f = ref({ q: '', adm: '', action: '', verdict: '', targetType: '', source: '', from: '', to: '' });

const ACTIONS = [['', '全部动作'], ['REPORT_RESOLVE', '举报处置'], ['RESTORE', '撤销处理']];
const VERDICTS = [['', '全部结果'], ['IGNORE', '忽略'], ['DELETE', '删除内容'], ['BAN', '禁言'], ['DELETE_AND_BAN', '删除+禁言']];
const TARGETS = [['', '全部对象'], ['POST', '帖子'], ['COMMENT', '评论'], ['USER', '用户']];
const SOURCES = [['', '全部来源'], ['REPORT', '举报'], ['MANUAL', '内容管理']];

onMounted(() => loadAudit(1));

function filters() {
  const v = f.value;
  return {
    q: v.q.trim() || undefined,
    admin: v.adm.trim() || undefined,
    action: v.action || undefined,
    verdict: v.verdict || undefined,
    targetType: v.targetType || undefined,
    source: v.source || undefined,
    from: v.from || undefined,
    to: v.to || undefined
  };
}

async function loadAudit(page = 1) {
  try {
    audit.value = await adminApi.auditFiltered({ ...filters(), page, size: 20 });
  } catch (e) {
    toast(errText(e));
  }
}

function search() {
  loadAudit(1);
}

function resetFilters() {
  f.value = { q: '', adm: '', action: '', verdict: '', targetType: '', source: '', from: '', to: '' };
  loadAudit(1);
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
      <h2>
        处理记录
        <span class="spacer"></span>
        <span v-if="audit" class="muted" style="font-weight: 400; font-size: 12px">共 {{ audit.total }} 条</span>
      </h2>

      <div class="au-bar">
        <input v-model="f.q" class="au-input" placeholder="关键词（详情/操作人/作者）" @keyup.enter="search" />
        <input v-model="f.adm" class="au-input" style="min-width: 130px" placeholder="操作人（id 或账号）"
               @keyup.enter="search" />
        <select v-model="f.action" class="au-input" style="width: 120px" @change="search">
          <option v-for="o in ACTIONS" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
        </select>
        <select v-model="f.verdict" class="au-input" style="width: 130px" @change="search">
          <option v-for="o in VERDICTS" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
        </select>
        <select v-model="f.targetType" class="au-input" style="width: 110px" @change="search">
          <option v-for="o in TARGETS" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
        </select>
        <select v-model="f.source" class="au-input" style="width: 120px" @change="search">
          <option v-for="o in SOURCES" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
        </select>
        <input v-model="f.from" class="au-input" style="width: 150px" type="date" title="起始日期" @change="search" />
        <span class="muted" style="font-size: 12px">至</span>
        <input v-model="f.to" class="au-input" style="width: 150px" type="date" title="结束日期" @change="search" />
        <button class="btn primary sm" @click="search">搜索</button>
        <button class="btn sm" @click="resetFilters">重置</button>
      </div>

      <div v-if="!audit" class="muted" style="padding: 20px">加载中…</div>
      <div v-else-if="!(audit.items || []).length" class="muted" style="padding: 28px; text-align: center">
        没有符合条件的处理记录
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

<style scoped>
/* 筛选条：一行放不下会自动换行（1480 以下基本会换两行，别硬挤） */
.au-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  padding: 12px 18px; border-bottom: 1px solid #EFF0F1; }
.au-input { width: auto; padding: 7px 10px; border: 1px solid #E5E6EB; border-radius: 8px;
  font-size: 13px; min-width: 190px; background: #fff; }
</style>
