<script setup>
/**
 * 参数管理（参数管理第一批）：10 个"启动时定死"的配置改成后台可改、立即生效。
 *
 * 三条交互原则（设计方案 §7）：
 * 1. **改一行存一行**：后端接口就是"改一个 {key,value}"，没有批量语义，
 *    所以这里不做"底部一个保存按钮把所有行一起提交"（半途失败会让人不知道哪几行生效了）。
 * 2. **前端先校验、后端再校验**：类型/范围/格式不对就在行内红字提示、不发请求；
 *    后端仍然会再校验一次（前端拦不住的，比如直接调接口）。
 * 3. **每行都显示「来源」和「生效时机」**：来源 = 数据库 / 默认值（一眼看出改没改过），
 *    生效时机 = 立即生效 / 下次扫描生效（告警阈值要等下一次扫描）。
 *
 * 权限：整页要 `admin:manage`（超管专属）—— 菜单里没权限就看不到，
 * 直接输 URL 也会撞 AdminLayout 的「无权限」卡片，后端每个接口另有一次 403。
 */
import { computed, onMounted, ref } from 'vue';
import { configApi } from '../../api.js';
import { toast } from '../../utils/toast.js';
import { errText } from '../../utils/community.js';

const items = ref([]);
const groups = ref([]);
const loading = ref(true);
const error = ref('');
/** 每行的编辑值（不改动 items 本身，方便做"有没有改动"的判断） */
const drafts = ref({});
/** 正在保存的那一行（key） */
const busy = ref('');
/** 行内校验错误：key -> 文案 */
const rowErrors = ref({});
/** 历史展开状态：key -> { open, loading, items } */
const histories = ref({});

const itemsOf = (group) => items.value.filter((it) => it.group === group);
const dirty = (it) => drafts.value[it.key] !== undefined && drafts.value[it.key] !== it.value;
const isBool = (it) => it.type === 'BOOL';

function fmt(ms) {
  if (!ms) return '—';
  const d = new Date(Number(ms));
  const p2 = (n) => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}

/** 整数字段的范围提示（INT 才显示；与后端 ConfigKey 里的 min/max 同源） */
function rangeText(it) {
  if (it.type !== 'INT') return '';
  if (it.min === null && it.max === null) return '';
  if (it.min !== null && it.max !== null) return '范围 ' + it.min + ' - ' + it.max;
  return it.min !== null ? '不小于 ' + it.min : '不大于 ' + it.max;
}

/** 拉列表：每次拉完把编辑值重置成库里的当前值（保存是"改一行存一行"，不存在未提交的批量改动） */
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await configApi.list();
    items.value = (r && r.items) || [];
    groups.value = (r && r.groups) || [];
    const next = {};
    for (const it of items.value) next[it.key] = it.value;
    drafts.value = next;
  } catch (e) {
    error.value = errText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ==================== 校验（后端还会再校验一次） ====================

function localError(it, raw) {
  const v = String(raw === undefined || raw === null ? '' : raw).trim();
  if (it.type === 'BOOL') {
    return v === 'true' || v === 'false' ? '' : '只能是 开 或 关';
  }
  if (it.type === 'INT') {
    if (!/^-?\d+$/.test(v)) return '必须是整数';
    const n = Number(v);
    if (it.min !== null && it.min !== undefined && n < it.min) return '不能小于 ' + it.min;
    if (it.max !== null && it.max !== undefined && n > it.max) return '不能大于 ' + it.max;
    return '';
  }
  if (!v) return '不能为空';
  if (v.length > 500) return '太长（最多 500 字符）';
  if (it.key === 'ai.tiers.basic.base-url' && !/^https?:\/\//.test(v)) {
    return '地址要以 http:// 或 https:// 开头';
  }
  return '';
}

// ==================== 保存 ====================

function patchItem(next) {
  const i = items.value.findIndex((x) => x.key === next.key);
  if (i >= 0) items.value.splice(i, 1, next);
  drafts.value[next.key] = next.value;
}

async function save(it) {
  const value = drafts.value[it.key];
  const bad = localError(it, value);
  rowErrors.value[it.key] = bad;
  if (bad) return;                       // 行内红字，不发请求

  busy.value = it.key;
  try {
    const r = await configApi.set(it.key, String(value).trim());
    if (r && r.item) patchItem(r.item);
    toast(it.effectLabel === '立即生效'
      ? '已保存「' + it.label + '」，立即生效'
      : '已保存「' + it.label + '」，下次扫描生效');
    if (histories.value[it.key] && histories.value[it.key].open) await loadHistory(it);
  } catch (e) {
    rowErrors.value[it.key] = errText(e);
  } finally {
    busy.value = '';
  }
}

// ==================== 历史与回滚 ====================

async function loadHistory(it) {
  const st = histories.value[it.key] || { open: true, loading: false, items: [] };
  st.loading = true;
  histories.value = { ...histories.value, [it.key]: st };
  try {
    const r = await configApi.log(it.key, 20);
    st.items = (r && r.items) || [];
  } catch (e) {
    toast(errText(e));
    st.items = [];
  } finally {
    st.loading = false;
    histories.value = { ...histories.value, [it.key]: { ...st } };
  }
}

async function toggleHistory(it) {
  const st = histories.value[it.key];
  if (st && st.open) {
    histories.value = { ...histories.value, [it.key]: { ...st, open: false } };
    return;
  }
  histories.value = { ...histories.value, [it.key]: { open: true, loading: true, items: (st && st.items) || [] } };
  await loadHistory(it);
}

function oldText(it, row) {
  return row.oldValue === null || row.oldValue === undefined
    ? '（默认 ' + it.defaultValue + '）'
    : row.oldValue;
}

async function rollback(it, row) {
  const msg = '把「' + it.label + '」回滚到 ' + oldText(it, row) + ' 吗？回滚本身也会记一条历史。';
  if (!window.confirm(msg)) return;
  busy.value = it.key;
  try {
    const r = await configApi.rollback(row.id);
    if (r && r.item) patchItem(r.item);
    toast('已回滚「' + it.label + '」');
    await loadHistory(it);
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

/** 目前有多少项是"被后台改过"的（页头那句话用） */
const overridden = computed(() => items.value.filter((it) => it.source === 'DB').length);
</script>

<template>
  <div class="panel" data-panel="config">
    <h2>
      参数管理
      <span class="spacer"></span>
      <span class="muted" style="font-size: 12.5px">
        仅超管 · {{ overridden }} / {{ items.length }} 项已改过
      </span>
    </h2>

    <div class="body">
      <p class="muted cfg-intro">
        改完不用重启：标「立即生效」的下一次请求就按新值算；标「下次扫描生效」的要等下一次告警扫描
        （或点一次告警页的「立即扫描」）。「来源」写<b>默认值</b>表示这一项还没被改过，
        删掉库里的那行也会回到默认值。
      </p>

      <div v-if="error" class="adm-error">
        <b>加载失败</b><span class="msg">{{ error }}</span>
        <button class="btn sm" @click="load">重试</button>
      </div>
      <div v-else-if="loading" class="muted" style="padding: 18px 0">加载中…</div>

      <template v-else>
        <section v-for="g in groups" :key="g" class="cfg-group" :data-group="g">
          <h3>{{ g }}</h3>
          <div class="tbl-x">
            <table>
              <thead>
                <tr>
                  <th style="width: 34%">参数</th>
                  <th style="width: 26%">值</th>
                  <th style="width: 110px">生效</th>
                  <th style="width: 90px">来源</th>
                  <th style="width: 150px">最后修改</th>
                  <th style="width: 150px">操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="it in itemsOf(g)" :key="it.key">
                  <tr :data-cfg-key="it.key" :data-source="it.source">
                    <td>
                      <b class="cfg-label">{{ it.label }}</b>
                      <div v-if="it.hint" class="cfg-hint">{{ it.hint }}</div>
                      <div class="cfg-key">{{ it.key }}</div>
                    </td>
                    <td>
                      <select v-if="isBool(it)" v-model="drafts[it.key]" class="cfg-input" data-cfg-input>
                        <option value="true">开</option>
                        <option value="false">关</option>
                      </select>
                      <input
                        v-else-if="it.type === 'INT'"
                        v-model="drafts[it.key]"
                        class="cfg-input"
                        type="number"
                        :min="it.min"
                        :max="it.max"
                        data-cfg-input
                      >
                      <input v-else v-model="drafts[it.key]" class="cfg-input" type="text" data-cfg-input>
                      <div v-if="rangeText(it)" class="cfg-hint">{{ rangeText(it) }}</div>
                      <div v-if="rowErrors[it.key]" class="cfg-err" data-cfg-error>{{ rowErrors[it.key] }}</div>
                    </td>
                    <td>
                      <span class="tag" :class="{ ok: it.effect === 'NOW' }">{{ it.effectLabel }}</span>
                    </td>
                    <td>
                      <span class="cfg-src" :class="{ db: it.source === 'DB' }" :data-source="it.source">
                        {{ it.sourceLabel }}
                      </span>
                    </td>
                    <td class="muted">
                      {{ it.updatedBy ? it.updatedBy + ' · ' + fmt(it.updatedAt) : '—' }}
                    </td>
                    <td class="cfg-ops">
                      <button
                        class="btn sm primary"
                        data-cfg-save
                        :disabled="busy === it.key || !dirty(it)"
                        @click="save(it)"
                      >
                        {{ busy === it.key ? '保存中…' : '保存' }}
                      </button>
                      <button class="btn sm" data-cfg-history @click="toggleHistory(it)">
                        {{ histories[it.key] && histories[it.key].open ? '收起' : '历史' }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="histories[it.key] && histories[it.key].open" class="cfg-histrow">
                    <td colspan="6">
                      <div class="cfg-hist" :data-cfg-hist="it.key">
                        <div v-if="histories[it.key].loading" class="muted">加载历史…</div>
                        <div v-else-if="!histories[it.key].items.length" class="muted">
                          还没有改过这一项（默认值 {{ it.defaultValue }}）。
                        </div>
                        <table v-else>
                          <thead>
                            <tr>
                              <th style="width: 150px">时间</th>
                              <th style="width: 120px">谁</th>
                              <th>改动</th>
                              <th style="width: 90px">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="row in histories[it.key].items" :key="row.id" :data-cfg-log="row.id">
                              <td class="muted">{{ fmt(row.createdAt) }}</td>
                              <td class="muted">{{ row.operator || '—' }}</td>
                              <td>
                                <code>{{ oldText(it, row) }}</code>
                                <span class="muted"> → </span>
                                <code>{{ row.newValue }}</code>
                              </td>
                              <td>
                                <button class="btn sm" :disabled="busy === it.key" @click="rollback(it, row)">
                                  回滚
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cfg-intro { font-size: 12.5px; line-height: 1.8; margin: 0 0 14px; }
.cfg-group { margin-bottom: 18px; }
.cfg-group h3 { font-size: 12.5px; color: #4E5969; margin: 0 0 8px; font-weight: 600; }
.cfg-group h3::before { content: ''; display: inline-block; width: 3px; height: 12px;
  background: #165DFF; border-radius: 2px; margin-right: 7px; vertical-align: -1px; }
.cfg-label { font-weight: 600; }
.cfg-hint { font-size: 11.5px; color: #86909C; line-height: 1.6; margin-top: 2px; }
.cfg-key { font-size: 11px; color: #C0C4CC; margin-top: 2px; font-family: ui-monospace, monospace; }
.cfg-input { width: auto; min-width: 150px; }
.cfg-err { font-size: 11.5px; color: #F53F3F; margin-top: 4px; }
.cfg-src { display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 11.5px;
  background: #F2F3F5; color: #86909C; }
.cfg-src.db { background: #E8F3FF; color: #165DFF; }
.cfg-ops { display: flex; gap: 6px; flex-wrap: wrap; }
.cfg-histrow > td { background: #FAFBFC; padding: 10px 18px 14px; }
.cfg-hist table { background: #fff; border-radius: 8px; }
.cfg-hist code { font-family: ui-monospace, monospace; font-size: 12px; }
</style>
