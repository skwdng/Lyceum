<script setup>
/**
 * 告警页（/admin/alerts，A3）。
 *
 * 两个视角：
 * · 未处理（OPEN，默认）：红点数的来源，只有这里的行能点「已处理」
 * · 全部（ALL）：已处理的也在，带处理人 / 时间 / 备注，可撤回
 *
 * 三个动作（设计 §6.2）：
 * · 已处理 → 弹框可填备注 → ACKED → 红点 -1（当天不再为这个对象重复提醒）
 * · 去看 —— USER 打开用户违规浮窗；POST/COMMENT 打开内容抽屉；
 *          REPORT_BACKLOG 跳举报页；DAU_MISSING 跳报表页
 * · 静音规则 → 选规则 + 1 小时 / 今天 / 3 天；期间不再生成新告警（已有的照常显示）
 *
 * 「已处理」不写处理记录（后端不落 sy_audit_log），所以这里也不用提示"已记入处理记录"。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAlertStore } from '../../stores/alert.js';
import { toast } from '../../utils/toast.js';
import { fmtTime } from './helpers.js';
import { userPop } from './userPop.js';
import { postDrawer } from './postDrawer.js';

const router = useRouter();
const alert = useAlertStore();

const tab = ref('OPEN');
const ackTarget = ref(null);      // 当前要标记的告警
const ackNote = ref('');
const muteOpen = ref(false);
const muteRule = ref('USER_REPORT_BURST');
const muteSpan = ref('1h');
const busy = ref('');

const RULES = [
  ['USER_REPORT_BURST', '用户被举报激增'],
  ['POST_REPORT_BURST', '内容被举报激增'],
  ['REPORT_BACKLOG', '举报积压'],
  ['DAU_MISSING', '活跃统计缺失']
];
const SPANS = [
  ['1h', '1 小时'],
  ['today', '今天剩余时间'],
  ['3d', '3 天']
];

const rows = computed(() => alert.items || []);

onMounted(() => alert.refreshList(tab.value));

function switchTab(t) {
  tab.value = t;
  alert.refreshList(t);
}

function levelClass(a) {
  return a.level === 'CRIT' ? 'al-crit' : 'al-warn';
}

function statusText(a) {
  if (a.status === 'OPEN') return '未处理';
  if (a.status === 'ACKED') return '已处理';
  return '已恢复';
}

function ruleLabel(k) {
  const hit = RULES.find((r) => r[0] === k);
  return hit ? hit[1] : k;
}

function openAck(a) {
  ackTarget.value = a;
  ackNote.value = '';
}

async function doAck() {
  const a = ackTarget.value;
  if (!a || busy.value) return;
  busy.value = 'ack';
  try {
    const r = await alert.ack(a.id, ackNote.value.trim() || null);
    toast('已标记处理，未处理剩 ' + ((r && r.unread) || 0) + ' 条');
    ackTarget.value = null;
  } catch (e) {
    toast((e && e.message) || '标记失败');
  } finally {
    busy.value = '';
  }
}

async function reopen(a) {
  if (busy.value) return;
  busy.value = 'reopen';
  try {
    await alert.reopen(a.id);
    toast('已撤回，回到未处理');
  } catch (e) {
    toast((e && e.message) || '撤回失败');
  } finally {
    busy.value = '';
  }
}

/** 去看：按 targetType 分流到已有的浮窗/抽屉/页面（不新造任何详情页） */
function goSee(a) {
  const t = a.targetType;
  if (t === 'USER') {
    userPop.open(String(a.targetId), window.innerWidth / 2, 160);
    return;
  }
  if (t === 'POST' || t === 'COMMENT') {
    postDrawer.open(a.targetId, t === 'COMMENT' ? a.targetId : null);
    return;
  }
  if (a.ruleKey === 'REPORT_BACKLOG') {
    router.push('/admin/reports');
    return;
  }
  if (a.ruleKey === 'DAU_MISSING') {
    router.push('/admin/analytics');
    return;
  }
  toast('这条告警没有可跳转的对象');
}

function canSee(a) {
  return !!a.targetType || a.ruleKey === 'REPORT_BACKLOG' || a.ruleKey === 'DAU_MISSING';
}

/** 静音时长 -> 截止时间（epoch 毫秒） */
function spanUntil(span) {
  const now = Date.now();
  if (span === '1h') return now + 3600_000;
  if (span === '3d') return now + 3 * 86400_000;
  // 今天剩余：到今天 23:59:59（至少留 1 分钟，避免"选了今天只静音 3 秒"）
  const end = new Date();
  end.setHours(23, 59, 59, 0);
  return Math.max(now + 60_000, end.getTime());
}

async function doMute() {
  if (busy.value) return;
  busy.value = 'mute';
  try {
    await alert.mute(muteRule.value, spanUntil(muteSpan.value));
    toast('已静音「' + ruleLabel(muteRule.value) + '」，期间不再产生新告警');
    muteOpen.value = false;
  } catch (e) {
    toast((e && e.message) || '静音失败');
  } finally {
    busy.value = '';
  }
}

async function doUnmute(m) {
  try {
    await alert.unmute(m.ruleKey);
    toast('已解除静音');
  } catch (e) {
    toast((e && e.message) || '解除失败');
  }
}

async function doScan() {
  if (busy.value) return;
  busy.value = 'scan';
  try {
    const r = await alert.scan();
    toast('扫描完成：新增 ' + r.raised + ' · 回落 ' + r.resolved);
  } catch (e) {
    toast((e && e.message) || '扫描失败');
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <div class="panel" data-panel="alerts">
    <h2>
      告警
      <span class="spacer"></span>
      <span class="muted" style="font-size: 12.5px">
        未处理 {{ alert.openTotal }} · 全部 {{ alert.total }}
      </span>
      <button class="btn sm" :disabled="busy === 'scan'" @click="doScan">
        {{ busy === 'scan' ? '扫描中…' : '立即扫描' }}
      </button>
      <button class="btn sm" @click="muteOpen = true">静音规则</button>
    </h2>

    <div class="al-tabs">
      <button class="btn sm" :class="{ primary: tab === 'OPEN' }" @click="switchTab('OPEN')">
        只看未处理
      </button>
      <button class="btn sm" :class="{ primary: tab === 'ALL' }" @click="switchTab('ALL')">
        全部
      </button>
      <span class="spacer"></span>
      <span v-for="m in alert.mutes" :key="m.ruleKey" class="al-mute">
        {{ m.label || ruleLabel(m.ruleKey) }} 静音至 {{ fmtTime(m.until) }}
        <i @click="doUnmute(m)">✕</i>
      </span>
    </div>

    <div v-if="alert.error" class="adm-error">
      <b>加载失败</b><span class="msg">{{ alert.error }}</span>
      <button class="btn sm" @click="alert.refreshList(tab)">重试</button>
    </div>
    <div v-else-if="alert.loading" class="muted" style="padding: 18px 0">加载中…</div>

    <div v-else class="tbl-x">
      <table>
        <thead>
          <tr>
            <th style="width: 70px">级别</th>
            <th>告警</th>
            <th style="width: 80px">实际值</th>
            <th style="width: 150px">最近触发</th>
            <th style="width: 90px">状态</th>
            <th style="width: 190px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in rows" :key="a.id" :data-alert-id="a.id" :data-rule="a.ruleKey">
            <td>
              <span class="al-lv" :class="levelClass(a)">{{ a.level }}</span>
            </td>
            <td>
              <div class="al-title">{{ a.title }}</div>
              <div class="al-sub">
                <span class="al-rule">{{ a.ruleLabel || ruleLabel(a.ruleKey) }}</span>
                <span v-if="a.detail"> · {{ a.detail }}</span>
                <span v-if="a.ackedAt"> · {{ a.ackedBy }} {{ fmtTime(a.ackedAt) }}
                  <template v-if="a.ackedNote">「{{ a.ackedNote }}」</template>
                </span>
              </div>
            </td>
            <td><b>{{ a.metric }}</b></td>
            <td class="muted">{{ fmtTime(a.lastSeen) }}</td>
            <td>
              <span class="al-st" :class="'st-' + a.status">{{ statusText(a) }}</span>
            </td>
            <td class="al-ops">
              <button v-if="a.status === 'OPEN'" class="btn sm primary" :disabled="!!busy" @click="openAck(a)">
                已处理
              </button>
              <button v-else-if="a.status === 'ACKED'" class="btn sm" :disabled="!!busy" @click="reopen(a)">
                撤回
              </button>
              <button v-if="canSee(a)" class="btn sm" @click="goSee(a)">去看</button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="6" class="muted" style="text-align: center; padding: 26px 0">
              没有告警。扫描每 5 分钟自动跑一次，也可以点右上角「立即扫描」。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="muted" style="font-size: 12px; margin-top: 12px">
      阈值与规则在 <code>AlertRule.java</code>（验证期 3，上线改 30）；每 5 分钟自动扫一次。
      「已处理」只改告警自己的状态，不写进处理记录页。
    </p>

    <!-- 已处理：可填备注 -->
    <div v-if="ackTarget" class="mask" @click.self="ackTarget = null">
      <div class="modal" style="width: 460px" data-panel="alert-ack">
        <h3>标记已处理</h3>
        <div class="body">
          <p style="font-size: 13px; line-height: 1.7">{{ ackTarget.title }}</p>
          <label class="al-lb">备注（可空，会显示在「全部」视图里）</label>
          <input
            v-model="ackNote"
            class="al-input"
            maxlength="200"
            data-ack-note
            placeholder="例如：已联系当事人 / 已知问题，正在修"
            @keyup.enter="doAck"
          >
          <p class="muted" style="font-size: 11.5px; margin-top: 8px">
            处理后当天不会为同一个对象再提醒；指标回落会自动恢复，已处理的不会来回跳。
          </p>
        </div>
        <div class="foot">
          <button class="btn" :disabled="busy === 'ack'" @click="ackTarget = null">取消</button>
          <button class="btn primary" :disabled="busy === 'ack'" @click="doAck">
            {{ busy === 'ack' ? '提交中…' : '标记已处理' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 静音规则 -->
    <div v-if="muteOpen" class="mask" @click.self="muteOpen = false">
      <div class="modal" style="width: 440px" data-panel="alert-mute">
        <h3>静音规则</h3>
        <div class="body">
          <label class="al-lb">规则</label>
          <select v-model="muteRule" class="al-input">
            <option v-for="r in RULES" :key="r[0]" :value="r[0]">{{ r[1] }}</option>
          </select>
          <label class="al-lb" style="margin-top: 12px">静音时长</label>
          <select v-model="muteSpan" class="al-input">
            <option v-for="s in SPANS" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
          </select>
          <p class="muted" style="font-size: 11.5px; margin-top: 10px">
            静音期间<b>不再产生新告警</b>，已经存在的照常显示（该处理的还是要处理）。
          </p>
        </div>
        <div class="foot">
          <button class="btn" :disabled="busy === 'mute'" @click="muteOpen = false">取消</button>
          <button class="btn primary" :disabled="busy === 'mute'" @click="doMute">
            {{ busy === 'mute' ? '提交中…' : '确定静音' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.al-tabs { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.al-mute { font-size: 11.5px; color: #B8740A; background: #FFF7E8; border: 1px solid #FFE4BA;
  border-radius: 6px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 6px; }
.al-mute i { cursor: pointer; font-style: normal; color: #86909C; }
.al-lv { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
.al-lv.al-warn { background: #FFF7E8; color: #B8740A; }
.al-lv.al-crit { background: #FFECE8; color: #CB2634; }
.al-title { font-size: 13px; font-weight: 600; line-height: 1.5; }
.al-sub { font-size: 11.5px; color: #86909C; margin-top: 3px; line-height: 1.6; }
.al-rule { color: #4E5969; }
.al-st { font-size: 12px; }
.al-st.st-OPEN { color: #F53F3F; font-weight: 600; }
.al-st.st-ACKED { color: #00B42A; }
.al-st.st-RESOLVED { color: #86909C; }
.al-ops { display: inline-flex; gap: 6px; }
.al-lb { display: block; font-size: 12.5px; color: #86909C; margin: 10px 0 6px; }
.al-input { width: 100%; padding: 9px 11px; border: 1px solid #E5E6EB; border-radius: 9px;
  font-size: 13.5px; background: #fff; }
</style>
