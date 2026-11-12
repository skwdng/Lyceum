<script setup>
/**
 * 视频复核台（批次 5/6）：把视频模块已有的审核队列搬到管理台。
 *
 * <p>为什么不是直接调视频模块那 4 个接口：它们挂在 `/api/video/*`、只认用户令牌，
 * 而管理台手里只有管理员令牌；且那边要求"必须是管理员"（已收紧），从用户侧调一律 403。
 * 所以管理台走自己的 `/api/admin/video-audit/**`，数据层（VideoRepo）完全复用。
 */
import { computed, onMounted, ref } from 'vue';
import { videoAuditApi } from '../../api.js';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';

const STATUSES = [['REVIEW', '待复核'], ['PASSED', '已通过'], ['REJECTED', '已驳回'], ['ALL', '全部']];

const status = ref('REVIEW');
const page = ref(1);
const size = 20;
const list = ref([]);
const stats = ref(null);
const total = ref(0);
const pages = ref(1);
const loading = ref(true);
const error = ref('');
const busy = ref('');
const logsOpen = ref(false);
const logs = ref([]);
const logsVideo = ref(null);
/** 驳回理由输入：{ id, reason } */
const rejectOf = ref(null);

const pendingCount = computed(() => (stats.value ? stats.value.pending : 0));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await videoAuditApi.queue(status.value, page.value, size);
    list.value = res.list || [];
    stats.value = res.stats || null;
    total.value = res.total || 0;
    pages.value = res.pages || 1;
  } catch (e) {
    error.value = errText(e) || '加载失败';
    list.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** 切状态回到第 1 页（否则停在"待复核 3/3"这种不存在的页上） */
function switchStatus(s) {
  status.value = s;
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

const pass = (v) => act('pass' + v.id, () => videoAuditApi.decide(v.id, 'PASS', null), `已通过 #${v.id}`);

function openReject(v) {
  rejectOf.value = { id: v.id, reason: '' };
}

function submitReject() {
  const r = rejectOf.value;
  if (!r.reason.trim()) return toast('驳回需要填理由');
  act('reject' + r.id, () => videoAuditApi.decide(r.id, 'REJECT', r.reason.trim()), `已驳回 #${r.id}`);
  rejectOf.value = null;
}

const restore = (v) => act('restore' + v.id, () => videoAuditApi.restore(v.id), `已恢复 #${v.id}`);

async function openLogs(v) {
  logsOpen.value = true;
  logs.value = [];
  logsVideo.value = v;
  try {
    const res = await videoAuditApi.logs(v.id);
    logs.value = res.list || [];
    logsVideo.value = res.video || v;
  } catch (e) {
    toast(errText(e));
  }
}

function fmt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const ts = (v) => (typeof v === 'number' ? fmt(v) : (v ? String(v).slice(0, 16).replace('T', ' ') : ''));
</script>

<template>
  <div data-panel="video-audit">
    <div class="panel">
      <h2>
        视频复核
        <span class="spacer"></span>
        <span class="muted" style="font-weight: 400; font-size: 12px">
          待复核 {{ pendingCount }} · 共 {{ stats ? stats.videos : 0 }} · 已通过 {{ stats ? stats.passed : 0 }} · 已驳回 {{ stats ? stats.rejected : 0 }}
        </span>
      </h2>
      <div class="body">
        <div class="va-bar">
          <button v-for="s in STATUSES" :key="s[0]" class="btn sm" :class="{ primary: status === s[0] }"
                  @click="switchStatus(s[0])">{{ s[1] }}</button>
          <span class="spacer"></span>
          <span class="muted" style="font-size: 12px">共 {{ total }} 条</span>
          <button class="btn sm" :disabled="loading" @click="load">刷新</button>
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
                <th style="width: 64px">ID</th>
                <th>标题</th>
                <th style="width: 130px">作者</th>
                <th style="width: 96px">审核状态</th>
                <th style="width: 96px">上架</th>
                <th style="width: 120px">理由</th>
                <th style="width: 270px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!list.length">
                <td colspan="7" class="muted" style="padding: 22px; text-align: center">这个筛选下没有视频</td>
              </tr>
              <tr v-for="v in list" :key="v.id">
                <td class="muted">{{ v.id }}</td>
                <td>{{ v.title }}</td>
                <td>{{ v.author || v.user_id }}</td>
                <td>
                  <span class="tag" :class="v.audit_status === 'PASSED' ? 'ok' : (v.audit_status === 'REJECTED' ? 'red' : 'orange')">
                    {{ v.audit_status }}
                  </span>
                </td>
                <td>
                  <span class="tag" :class="v.online ? 'ok' : ''">{{ v.online ? '上架' : '下架' }}</span>
                </td>
                <td class="muted va-reason" :title="v.audit_reason || v.reason">{{ v.audit_reason || v.reason || '—' }}</td>
                <td>
                  <span class="va-ops">
                    <button class="btn sm" :disabled="!!busy" @click="pass(v)">通过</button>
                    <button class="btn sm danger" :disabled="!!busy" @click="openReject(v)">驳回</button>
                    <button class="btn sm" :disabled="!!busy" @click="restore(v)">恢复</button>
                    <button class="btn sm" @click="openLogs(v)">日志</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="va-page">
          <button class="btn sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
          <span class="muted">{{ page }} / {{ pages }}（共 {{ total }} 条）</span>
          <button class="btn sm" :disabled="page >= pages" @click="go(page + 1)">下一页</button>
        </div>
      </div>
    </div>

    <!-- 驳回理由 -->
    <div v-if="rejectOf" class="mask" @click.self="rejectOf = null">
      <div class="modal" style="width: 460px">
        <h3>驳回视频 #{{ rejectOf.id }}</h3>
        <div class="body">
          <label class="va-lb">理由（必填，会写进审核日志）</label>
          <textarea v-model="rejectOf.reason" class="va-ta" rows="3" maxlength="200"
                    placeholder="例如：画面含违规内容"></textarea>
        </div>
        <div class="foot">
          <button class="btn" @click="rejectOf = null">取消</button>
          <button class="btn danger" :disabled="!!busy" @click="submitReject">确定驳回</button>
        </div>
      </div>
    </div>

    <!-- 审核日志 -->
    <div v-if="logsOpen" class="mask" @click.self="logsOpen = false">
      <div class="modal" style="width: 720px">
        <h3>审核日志 · {{ logsVideo ? logsVideo.title : '' }}</h3>
        <div class="body">
          <div v-if="!logs.length" class="muted">没有审核记录</div>
          <table v-else>
            <thead>
              <tr>
                <th style="width: 60px">ID</th>
                <th style="width: 90px">来源</th>
                <th style="width: 90px">结果</th>
                <th>理由</th>
                <th style="width: 130px">操作人</th>
                <th style="width: 130px">时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in logs" :key="g.id">
                <td class="muted">{{ g.id }}</td>
                <td><span class="tag">{{ g.stage }}</span></td>
                <td>{{ g.result }}</td>
                <td class="muted">{{ g.reason }}</td>
                <td>{{ g.operator }}</td>
                <td class="muted">{{ ts(g.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="foot">
          <button class="btn" @click="logsOpen = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.va-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.va-ops { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.va-reason { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.va-page { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 12px; }
.va-lb { display: block; font-size: 12.5px; color: #86909C; margin-bottom: 6px; }
.va-ta { width: 100%; padding: 8px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px; resize: vertical; }
</style>
