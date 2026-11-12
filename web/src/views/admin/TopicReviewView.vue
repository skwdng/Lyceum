<script setup>
/**
 * 辩题审核（批次 6/6）。
 *
 * <p>管理端列表**不过滤 REJECT**（要能看到被驳回/下架的题才能改判）；
 * 前台题库 `Store.topics()` 会过滤，所以下架后的题在用户侧立刻消失、在管理端仍能查到。
 *
 * <p>下架和驳回落的是同一个状态（REJECT），区别只是语义：驳回 = 没过审，下架 = 上架后撤下。
 * 两者都能再改回「通过」。
 */
import { computed, onMounted, ref } from 'vue';
import { topicAdminApi } from '../../api.js';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';

const STATUSES = [['ALL', '全部'], ['PASS', '正常'], ['REJECT', '已驳回/下架'], ['NEED_EDIT', '待修改'], ['pending', '待审']];
const SOURCES = [['', '全部来源'], ['official', '官方'], ['custom', '自定义']];

const modStatus = ref('ALL');
const source = ref('');
const q = ref('');
const topicId = ref('');
const from = ref('');
const to = ref('');
const page = ref(1);
const size = 20;
const total = ref(0);
const items = ref([]);
const loading = ref(true);
const error = ref('');
const busy = ref('');
/** 驳回/下架的理由输入：{ id, mode: 'reject'|'offline', reason } */
const prompt = ref(null);

const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await topicAdminApi.list({
      modStatus: modStatus.value,
      source: source.value || undefined,
      q: q.value.trim() || undefined,
      id: topicId.value.trim() || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      page: page.value,
      size
    });
    items.value = res.items || [];
    total.value = res.total || 0;
  } catch (e) {
    error.value = errText(e) || '加载失败';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function search() {
  page.value = 1;
  load();
}

function go(p) {
  if (p < 1 || p > pages.value) return;
  page.value = p;
  load();
}

async function act(key, fn, msg) {
  if (busy.value) return;
  busy.value = key;
  try {
    await fn();
    toast(msg);
    await load();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

const approve = (t) => act('ok' + t.id, () => topicAdminApi.approve(t.id), `已通过：${t.title}`);

function openPrompt(t, mode) {
  prompt.value = { id: t.id, title: t.title, mode, reason: '' };
}

function submitPrompt() {
  const p = prompt.value;
  if (!p.reason.trim()) return toast('理由必填（留痕用）');
  const call = p.mode === 'reject' ? topicAdminApi.reject(p.id, p.reason.trim())
    : topicAdminApi.offline(p.id, p.reason.trim());
  act(p.mode + p.id, () => call, p.mode === 'reject' ? '已驳回' : '已下架');
  prompt.value = null;
}

function fmt(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const tagClass = (s) => (s === 'PASS' ? 'ok' : (s === 'REJECT' ? 'red' : 'orange'));
</script>

<template>
  <div data-panel="topic-review">
    <div class="panel">
      <h2>
        辩题审核
        <span class="spacer"></span>
        <span class="muted" style="font-weight: 400; font-size: 12px">共 {{ total }} 题（含已驳回/下架）</span>
      </h2>
      <div class="body">
        <div class="tr-bar">
          <input v-model="q" class="tr-input" placeholder="搜索题目标题…" @keyup.enter="search" />
          <input v-model="topicId" class="tr-input" style="min-width: 130px" placeholder="题目 ID（精确）"
                 @keyup.enter="search" />
          <select v-model="modStatus" class="tr-input" style="width: 150px" @change="search">
            <option v-for="s in STATUSES" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
          </select>
          <select v-model="source" class="tr-input" style="width: 120px" @change="search">
            <option v-for="s in SOURCES" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
          </select>
          <input v-model="from" class="tr-input" style="width: 150px" type="date" title="审核起始日期" @change="search" />
          <span class="muted" style="font-size: 12px">至</span>
          <input v-model="to" class="tr-input" style="width: 150px" type="date" title="审核结束日期" @change="search" />
          <button class="btn primary sm" @click="search">搜索</button>
          <button class="btn sm"
                  @click="q = ''; topicId = ''; modStatus = 'ALL'; source = ''; from = ''; to = ''; search()">重置</button>
        </div>
        <div class="muted" style="font-size: 11.5px; margin: -4px 0 12px">
          日期筛的是「审核时间」；还没审核过的题没有审核时间，按日期筛不会出现
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
                <th>标题</th>
                <th style="width: 110px">分类</th>
                <th style="width: 90px">难度</th>
                <th style="width: 90px">来源</th>
                <th style="width: 80px">热度</th>
                <th style="width: 110px">审核状态</th>
                <th style="width: 160px">理由</th>
                <th style="width: 128px">审核时间</th>
                <th style="width: 230px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!items.length">
                <td colspan="9" class="muted" style="padding: 22px; text-align: center">没有符合条件的辩题</td>
              </tr>
              <tr v-for="t in items" :key="t.id">
                <td class="tr-title" :title="t.title">{{ t.title }}</td>
                <td>{{ t.cat }}</td>
                <td>{{ t.diff }}</td>
                <td><span class="tag">{{ t.source === 'custom' ? '自定义' : '官方' }}</span></td>
                <td class="muted">{{ t.plays }}</td>
                <td><span class="tag" :class="tagClass(t.modStatus)">{{ t.modStatus }}</span></td>
                <td class="muted tr-reason" :title="t.modReason">{{ t.modReason || '—' }}</td>
                <td class="muted">{{ fmt(t.modAt) }}</td>
                <td>
                  <span class="tr-ops">
                    <button class="btn sm" :disabled="!!busy" @click="approve(t)">通过</button>
                    <button class="btn sm danger" :disabled="!!busy" @click="openPrompt(t, 'reject')">驳回</button>
                    <button class="btn sm warn" :disabled="!!busy" @click="openPrompt(t, 'offline')">下架</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="tr-page">
          <button class="btn sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
          <span class="muted">{{ page }} / {{ pages }}</span>
          <button class="btn sm" :disabled="page >= pages" @click="go(page + 1)">下一页</button>
        </div>
      </div>
    </div>

    <div v-if="prompt" class="mask" @click.self="prompt = null">
      <div class="modal" style="width: 480px">
        <h3>{{ prompt.mode === 'reject' ? '驳回' : '下架' }}辩题</h3>
        <div class="body">
          <div class="tr-hint">{{ prompt.title }}</div>
          <label class="tr-lb">理由（必填，会留痕）</label>
          <textarea v-model="prompt.reason" class="tr-ta" rows="3" maxlength="300"
                    :placeholder="prompt.mode === 'reject' ? '例如：辩题立场不中立' : '例如：收到用户投诉，暂时下架'"></textarea>
          <div class="muted" style="font-size: 11.5px; margin-top: 6px">
            下架后前台题库立刻看不到这道题，管理端仍可查到并改回「通过」。
          </div>
        </div>
        <div class="foot">
          <button class="btn" @click="prompt = null">取消</button>
          <button class="btn danger" :disabled="!!busy" @click="submitPrompt">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tr-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
/* width:auto 是必需的：全局 `.adm-root input{width:100%}` 会让每个控件独占一行 */
.tr-input { width: auto; padding: 7px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px; min-width: 200px; }
.tr-title { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-reason { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-ops { display: inline-flex; gap: 6px; align-items: center; }
.tr-page { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 12px; }
.tr-hint { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.tr-lb { display: block; font-size: 12.5px; color: #86909C; margin-bottom: 6px; }
.tr-ta { width: 100%; padding: 8px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px; resize: vertical; }
</style>
