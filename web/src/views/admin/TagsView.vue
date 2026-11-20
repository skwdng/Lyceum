<script setup>
/**
 * 标签管理（T3）：列表 / 预置 / 改名（撞名自动合并） / 删除。
 *
 * 三个动作的行为（设计方案 §5）：
 * · 改名：新名撞上已有标签 → 弹「「AI」已存在，是否把「人工智能」并入它？」→ 确认即合并
 *   （源标签消失、帖子都挂到目标、使用次数相加）。界面上**不出现独立的合并按钮**。
 * · 删除：二次确认里写明「将解除 N 篇帖子的「X」标签，且不可恢复」。
 * · 预置：建一个官方标签；重名直接把已有的返回，不报错。
 *
 * 权限：整页要 `content:moderate`（后端每个接口都挂了 @Require，前端只是体验层）。
 */
import { ref, computed, onMounted } from 'vue';
import { adminApi } from '../../api.js';
import { toast } from '../../utils/toast.js';
import { errText } from '../../utils/community.js';

const items = ref([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const q = ref('');
const loading = ref(true);
const error = ref('');
const busy = ref('');

/** 预置标签输入 */
const newName = ref('');
/** 改名弹窗：{ id, oldName, useCount, name } */
const renameRow = ref(null);
const renameTo = ref('');
/** 合并确认：{ source, sourceId, target, moved } —— 后端第一次调用就会合并，所以先在前端问清 */
const mergeHint = ref(null);

const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await adminApi.tags(q.value.trim(), page.value, size.value);
    items.value = (r && r.items) || [];
    total.value = (r && r.total) || 0;
  } catch (e) {
    error.value = errText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

let searchTimer = null;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 280);
}

function goPage(p) {
  page.value = p;
  load();
}

// ==================== 预置 ====================

async function create() {
  const name = newName.value.trim();
  if (!name) return toast('先写标签名');
  busy.value = 'create';
  try {
    const r = await adminApi.createTag(name);
    newName.value = '';
    if (r && r.created === false) toast('这个标签已经存在，没有重复创建');
    else toast('已预置标签「' + ((r && r.tag && r.tag.name) || name) + '」');
    await load();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

// ==================== 改名（撞名 = 合并） ====================

/** 本地先判断撞不撞名：撞了就弹确认，避免"点一下就悄悄合并了" */
function openRename(row) {
  renameRow.value = row;
  renameTo.value = row.name;
  mergeHint.value = null;
}

function closeRename() {
  renameRow.value = null;
  renameTo.value = '';
  mergeHint.value = null;
}

function dupTarget(name) {
  const key = String(name || '').trim().toLowerCase();
  return items.value.find((t) => String(t.name).toLowerCase() === key && t.id !== (renameRow.value || {}).id);
}

async function doRename() {
  const row = renameRow.value;
  if (!row) return;
  const name = renameTo.value.trim();
  if (!name) return toast('新名字不能为空');
  if (name === row.name) return closeRename();

  // 撞名：先问，再真的调后端（后端会合并）
  const dup = dupTarget(name);
  if (dup && !mergeHint.value) {
    mergeHint.value = { target: dup.name, targetId: dup.id, useCount: row.useCount };
    return;
  }

  busy.value = 'rename-' + row.id;
  try {
    const r = await adminApi.renameTag(row.id, name);
    if (r && r.merged) {
      toast('已并入「' + r.mergedInto.name + '」，迁移 ' + r.moved + ' 篇帖子');
    } else {
      toast('已改名为「' + ((r && r.tag && r.tag.name) || name) + '」');
    }
    closeRename();
    await load();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

// ==================== 删除 ====================

async function remove(row) {
  const n = row.useCount || 0;
  const msg = n > 0
    ? `将解除 ${n} 篇帖子的「${row.name}」标签，且不可恢复。\n\n继续删除这个标签？`
    : `「${row.name}」还没有被任何帖子使用。删除后不可恢复，继续？`;
  if (!window.confirm(msg)) return;
  busy.value = 'del-' + row.id;
  try {
    const r = await adminApi.deleteTag(row.id);
    toast('已删除标签，解除 ' + ((r && r.affected) || 0) + ' 篇帖子的关联');
    if (items.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <div class="panel" data-panel="tags">
    <h2>
      标签管理
      <span class="spacer"></span>
      <span class="muted" style="font-size: 12.5px">共 {{ total }} 个标签</span>
    </h2>

    <div class="tg-bar">
      <input v-model="q" class="tg-input" placeholder="搜标签名…" @input="onSearch">
      <input
        v-model="newName"
        class="tg-input"
        maxlength="12"
        placeholder="新标签名（1-12 字），回车预置"
        @keyup.enter="create"
      >
      <button class="btn primary sm" :disabled="busy === 'create'" @click="create">
        {{ busy === 'create' ? '创建中…' : '＋ 预置标签' }}
      </button>
    </div>

    <div v-if="error" class="adm-error">
      <b>加载失败</b><span class="msg">{{ error }}</span>
      <button class="btn sm" @click="load">重试</button>
    </div>
    <div v-else-if="loading" class="muted" style="padding: 18px 0">加载中…</div>

    <div v-else class="tbl-x">
      <table>
        <thead>
          <tr>
            <th style="width: 60px">ID</th>
            <th>名称</th>
            <th style="width: 100px">使用次数</th>
            <th style="width: 150px">创建者</th>
            <th style="width: 160px">创建时间</th>
            <th style="width: 170px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in items" :key="t.id" :data-tag-id="t.id">
            <td>{{ t.id }}</td>
            <td><b class="tg-name">{{ t.name }}</b></td>
            <td>
              <span :class="{ 'tg-zero': !t.useCount }">{{ t.useCount }}</span>
            </td>
            <td class="muted">{{ t.createdBy || '—' }}</td>
            <td class="muted">{{ t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—' }}</td>
            <td class="tg-ops">
              <button class="btn sm" @click="openRename(t)">改名</button>
              <button class="btn sm danger" :disabled="busy === 'del-' + t.id" @click="remove(t)">删除</button>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="6" class="muted" style="text-align: center; padding: 26px 0">
              还没有标签。发帖时用户可以自己建，也可以在上面预置官方标签。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pages > 1" class="pager">
      <button class="btn sm" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
      <span>第 {{ page }} / {{ pages }} 页</span>
      <button class="btn sm" :disabled="page >= pages" @click="goPage(page + 1)">下一页</button>
    </div>

    <p class="muted" style="font-size: 12px; margin-top: 12px">
      删标签 = 解除帖子上的这个标签（帖子保留其它标签），不可恢复；改名撞上已有标签会自动合并。
      所有操作都会写进「处理记录」。
    </p>

    <!-- 改名 / 合并确认 -->
    <div v-if="renameRow" class="mask" @click.self="closeRename">
      <div class="modal" style="width: 470px" data-panel="tag-rename">
        <h3>改名 · {{ renameRow.name }}</h3>
        <div class="body">
          <label class="tg-lb">新名称</label>
          <input v-model="renameTo" class="tg-input" style="width: 100%" maxlength="12" @keyup.enter="doRename">

          <div v-if="mergeHint" class="tg-merge" data-panel="tag-merge-hint">
            <b>「{{ mergeHint.target }}」已存在</b>
            <p>
              是否把「{{ renameRow.name }}」并入它？<br>
              并入后：源标签消失，{{ mergeHint.useCount || 0 }} 篇帖子改挂到「{{ mergeHint.target }}」，
              两边的使用次数相加，且不可恢复。
            </p>
          </div>
        </div>
        <div class="foot">
          <button class="btn" @click="closeRename">取消</button>
          <button class="btn primary" :disabled="busy === 'rename-' + renameRow.id" @click="doRename">
            {{ mergeHint ? '确认合并' : '保存改名' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tg-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.tg-input { padding: 8px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px;
  background: #fff; width: auto; min-width: 190px; }
.tg-name { font-weight: 600; }
.tg-zero { color: #A9AEB8; }
.tg-ops { display: inline-flex; gap: 6px; }
.tg-lb { display: block; font-size: 12.5px; color: #86909C; margin: 0 0 6px; }
.tg-merge { margin-top: 12px; padding: 10px 12px; border-radius: 9px; background: #FFF7E8;
  border: 1px solid #FFE4BA; font-size: 12.5px; color: #B8740A; line-height: 1.7; }
.tg-merge p { margin: 6px 0 0; }
</style>
