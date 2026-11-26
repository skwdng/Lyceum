<script setup>
/**
 * 屏蔽词管理（W3）：三个 tab = 三个 scope，一份表。
 *
 * 为什么分三个 tab 而不是一个「敏感词」列表：三个 scope 的**后果**不同
 * —— COMMUNITY 是打码、VIDEO_REJECT 是驳回、VIDEO_REVIEW 是转人工。
 * 合并成一个列表，运营很容易把「只该转人工」的词丢进「直接驳回」里。
 *
 * 三条交互约定：
 * 1. **写完就不用管**：后端每次写都会重建内存词表，页面不需要「刷新缓存」这类按钮；
 * 2. **空词表要显眼**：社区词表为空时顶部红条常驻 —— 那时候发帖不会再打码；
 * 3. **导入是幂等的**：重复的词会被跳过并计数，页面把 added / skipped / 不合法 分开告诉用户。
 */
import { computed, onMounted, ref } from 'vue';
import { wordApi } from '../../api.js';
import { toast } from '../../utils/toast.js';
import { errText } from '../../utils/community.js';
import { downloadPath } from './exportFile.js';

/** tab 顺序 = 后端 WordScope 声明顺序；label/effect 以后端 summary 为准（这里只做首屏占位） */
const SCOPES = [
  { scope: 'COMMUNITY', label: '社区（打码）', effect: '打码', hint: '帖子/评论里的词会被替换成 ＊；标签里出现会被直接拒绝' },
  { scope: 'VIDEO_REJECT', label: '视频-硬违规（驳回）', effect: '驳回', hint: '视频标题/描述命中就直接驳回' },
  { scope: 'VIDEO_REVIEW', label: '视频-转人工（审查）', effect: '审查', hint: '命中后转人工复核，不自动杀' }
];

const active = ref('COMMUNITY');
const items = ref([]);
const total = ref(0);
const page = ref(1);
const size = ref(50);
const q = ref('');
const loading = ref(true);
const error = ref('');
const busy = ref('');
const draft = ref('');
const importing = ref(false);
const summary = ref({ scopes: [], communityEmpty: false });

const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
const current = computed(() => SCOPES.find((s) => s.scope === active.value) || SCOPES[0]);
const scopeStat = computed(() => (summary.value.scopes || []).find((s) => s.scope === active.value) || {});

function fmt(ms) {
  if (!ms) return '—';
  const d = new Date(Number(ms));
  const p2 = (n) => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}

async function loadSummary() {
  try {
    summary.value = await wordApi.summary();
  } catch (e) {
    // 汇总失败不该把列表也拦住；红条靠 communityEmpty，取不到就当未知
    summary.value = summary.value || { scopes: [], communityEmpty: false };
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await wordApi.list({ scope: active.value, q: q.value.trim(), page: page.value, size: size.value });
    items.value = (r && r.items) || [];
    total.value = (r && r.total) || 0;
  } catch (e) {
    error.value = errText(e);
  } finally {
    loading.value = false;
  }
}

async function reloadAll() {
  await loadSummary();
  await load();
}

onMounted(reloadAll);

function switchScope(s) {
  if (active.value === s) return;
  active.value = s;
  page.value = 1;
  load();
}

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

// ==================== 导入 ====================

async function doImport() {
  const text = draft.value.trim();
  if (!text) return toast('先粘贴要添加的词');
  importing.value = true;
  try {
    const r = await wordApi.importText(active.value, text);
    const added = (r && r.added) || 0;
    const skipped = (r && r.skipped) || 0;
    const invalid = (r && r.invalid) || [];
    const bits = ['新增 ' + added + ' 条'];
    if (skipped) bits.push('跳过重复 ' + skipped + ' 条');
    if (invalid.length) bits.push('不合法 ' + invalid.length + ' 条');
    toast(bits.join('，') + '（已立即生效）');
    if (invalid.length) {
      // 把被拒的原因说清楚（太多就只报前 3 条，避免 toast 占满屏）
      toast(invalid.slice(0, 3).map((x) => '「' + (x.word || '空') + '」' + x.reason).join('；'));
    }
    if (added || skipped) draft.value = '';
    await reloadAll();
  } catch (e) {
    toast(errText(e));
  } finally {
    importing.value = false;
  }
}

// ==================== 启停 / 删除 ====================

async function toggle(row) {
  busy.value = 'tg-' + row.id;
  try {
    if (row.enabled) await wordApi.disable(row.id);
    else await wordApi.enable(row.id);
    toast('已' + (row.enabled ? '停用' : '启用') + '「' + row.word + '」，立即生效');
    await reloadAll();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

async function remove(row) {
  if (!window.confirm('删除「' + row.word + '」？删除后这个词不再参与匹配，且不可恢复。')) return;
  busy.value = 'del-' + row.id;
  try {
    await wordApi.remove(row.id);
    toast('已删除「' + row.word + '」');
    await reloadAll();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

// ==================== 导出 ====================

async function doExport() {
  busy.value = 'export';
  try {
    const name = await downloadPath(wordApi.exportPath(active.value), 'words-' + active.value.toLowerCase() + '.txt');
    toast('已导出 ' + name);
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <div class="panel" data-panel="words">
    <h2>
      屏蔽词管理
      <span class="spacer"></span>
      <span class="muted" style="font-size: 12.5px">仅内容审核及以上</span>
    </h2>

    <div class="body">
      <!-- 三个 scope 的 tab -->
      <div class="wd-tabs">
        <button
          v-for="s in SCOPES"
          :key="s.scope"
          class="wd-tab"
          :class="{ on: active === s.scope }"
          :data-scope="s.scope"
          @click="switchScope(s.scope)"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- 社区词表为空：红色横幅常驻 -->
      <div v-if="summary.communityEmpty" class="wd-alert" data-words-alert>
        <b>⚠ 社区词表为空</b>
        <span>
          库里一条社区词都没有了：当前按内置词表（community-sensitive-words.txt）兜底打码，
          后台改词暂不生效。请立刻在「社区（打码）」里补词。
        </span>
      </div>

      <div class="wd-meta" data-words-summary>
        <span>
          词数 <b>{{ scopeStat.enabled || 0 }}</b>
          <span v-if="scopeStat.disabled" class="muted">（停用 {{ scopeStat.disabled }}）</span>
        </span>
        <span class="muted">
          最近变更 {{ scopeStat.lastChangedBy || '—' }} {{ fmt(scopeStat.lastChangedAt) }}
          <span class="muted">· 打码来源 {{ summary.maskedBy || '—' }}</span>
        </span>
        <span class="spacer"></span>
        <button class="btn sm" data-words-export :disabled="busy === 'export'" @click="doExport">导出 txt</button>
      </div>

      <p class="wd-hint">{{ current.hint }}</p>

      <!-- 批量导入 -->
      <div class="wd-import">
        <label class="wd-label">＋ 批量添加（一行一个，也支持逗号 / 顿号分隔，最多 500 条）</label>
        <textarea
          v-model="draft"
          class="wd-ta"
          rows="4"
          data-words-input
          placeholder="赌博&#10;色情，代考、洗稿"
        />
        <div class="wd-import-foot">
          <span class="muted">重复的词会自动跳过；写完立即生效（重建内存词表，不用重启）</span>
          <span class="spacer"></span>
          <button class="btn primary sm" data-words-import :disabled="importing" @click="doImport">
            {{ importing ? '导入中…' : '导入' }}
          </button>
        </div>
      </div>

      <!-- 搜索 -->
      <div class="wd-bar">
        <input v-model="q" class="wd-input" data-words-search placeholder="按词搜索" @input="onSearch">
      </div>

      <div v-if="error" class="adm-error">
        <b>加载失败</b><span class="msg">{{ error }}</span>
        <button class="btn sm" @click="reloadAll">重试</button>
      </div>
      <div v-else-if="loading" class="muted" style="padding: 16px 0">加载中…</div>
      <div v-else-if="!items.length" class="muted" style="padding: 16px 0">
        这一份词表还没有词。把要遮/要拒的词粘到上面点「导入」即可。
      </div>

      <div v-else class="tbl-x">
        <table>
          <thead>
            <tr>
              <th style="width: 34%">词</th>
              <th style="width: 90px">状态</th>
              <th style="width: 130px">创建者</th>
              <th style="width: 120px">时间</th>
              <th style="width: 150px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id" :data-word-id="row.id" :data-word="row.word">
              <td><b class="wd-word">{{ row.word }}</b></td>
              <td>
                <span class="tag" :class="{ ok: row.enabled }">{{ row.enabled ? '启用' : '停用' }}</span>
              </td>
              <td class="muted">{{ row.createdBy || '—' }}</td>
              <td class="muted">{{ fmt(row.createdAt) }}</td>
              <td class="wd-ops">
                <button class="btn sm" data-word-toggle :disabled="busy === 'tg-' + row.id" @click="toggle(row)">
                  {{ row.enabled ? '停用' : '启用' }}
                </button>
                <button class="btn sm danger" data-word-del :disabled="busy === 'del-' + row.id" @click="remove(row)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="pages > 1" class="pager">
        <span class="muted">{{ page }} / {{ pages }} 页（共 {{ total }} 条）</span>
        <button class="btn sm" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <button class="btn sm" :disabled="page >= pages" @click="goPage(page + 1)">下一页</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wd-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.wd-tab { border: 1px solid #E5E6EB; background: #fff; color: #4E5969; border-radius: 9px;
  padding: 7px 14px; font-size: 13px; cursor: pointer; }
.wd-tab:hover { background: #F7F8FA; }
.wd-tab.on { background: #E8F3FF; border-color: #165DFF; color: #165DFF; font-weight: 600; }
.wd-alert { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; background: #FFF3F3;
  border: 1px solid #FFD6D6; color: #8B1A25; border-radius: 10px; padding: 10px 14px;
  font-size: 12.5px; margin-bottom: 12px; }
.wd-meta { display: flex; gap: 14px; align-items: center; font-size: 12.5px; margin-bottom: 6px; }
.wd-hint { font-size: 12px; color: #86909C; margin: 2px 0 12px; }
.wd-import { border: 1px dashed #D6DAE1; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;
  background: #FCFCFD; }
.wd-label { display: block; font-size: 12.5px; color: #4E5969; margin-bottom: 8px; font-weight: 600; }
.wd-ta { width: 100%; border: 1px solid #E5E6EB; border-radius: 8px; padding: 8px 10px;
  font-size: 13px; font-family: ui-monospace, monospace; resize: vertical; }
.wd-import-foot { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 12px; }
.wd-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.wd-input { width: auto; min-width: 220px; padding: 8px 10px; border: 1px solid #E5E6EB;
  border-radius: 8px; font-size: 13px; background: #fff; }
.wd-word { font-weight: 600; }
.wd-ops { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
