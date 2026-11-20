<script setup>
/**
 * 报表分析（P4 新页面）：模块浏览 / 活跃 / 内容 / 营收 / 质量。
 *
 * 数据全部来自 `/api/admin/analytics/**`（服务端 60 秒缓存），前端只做格式化与图表映射。
 *
 * 页面结构上的一条原则：**每个区块自己带导出按钮**。
 * 因为导出的是"这个区块看到的那份数据"（同一个接口、同一个 range），
 * 而不是另算一遍 —— 否则迟早出现"页面 42、Excel 41"这种没法解释的问题。
 */
import { computed, onMounted, ref } from 'vue';
import { analyticsApi } from '../../api.js';
import BarChart from '../../components/charts/BarChart.vue';
import DonutChart from '../../components/charts/DonutChart.vue';
import LineChart from '../../components/charts/LineChart.vue';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';
import { useAdminStore } from '../../stores/admin.js';

const adminStore = useAdminStore();
/** 导出全站数据是独立权限（只给超管）：没权限就不渲染这些按钮 */
const canExport = computed(() => adminStore.has('analytics:export'));
import { downloadExport } from './exportFile.js';

const RANGES = [['7d', '近 7 天'], ['30d', '近 30 天'], ['90d', '近 90 天']];
const range = ref('30d');
const loading = ref(true);
/** 整页级的加载失败：显示「加载失败 + 重试」，而不是只弹个 toast 留一片空白 */
const error = ref('');
/** 正在导出中的按钮 key（导出是二进制下载，连点会重复下文件） */
const exporting = ref('');

const modules = ref(null);
const active = ref(null);
const quality = ref(null);
const reportsTrend = ref([]);
const postsTrend = ref([]);
const revenueTrend = ref([]);
const reasonDonut = ref([]);
const tierDonut = ref([]);

const MODULE_LABELS = {
  community: '社区', chat: '聊天', match: '多人辩论', solo: '单人辩论', video: '视频',
  hot: '热辩榜', diag: '能力分析', records: '辩论记录', wallet: '钱包', friends: '好友', admin: '管理台'
};
const moduleName = (k) => MODULE_LABELS[k] || k;

const toPoints = (res) => (res && res.points ? res.points : []);

async function load() {
  loading.value = true;
  error.value = '';
  const r = range.value;
  try {
    const [mod, act, q, rt, pt, vt, reason, tier] = await Promise.all([
      analyticsApi.modules(r),
      analyticsApi.active(r),
      analyticsApi.quality(r),
      analyticsApi.trend('reports', r),
      analyticsApi.trend('posts', r),
      analyticsApi.trend('revenue', r),
      analyticsApi.breakdown('report_reason', r),
      analyticsApi.breakdown('tier', r)
    ]);
    modules.value = mod;
    active.value = act;
    quality.value = q;
    reportsTrend.value = toPoints(rt);
    postsTrend.value = toPoints(pt);
    // 收入后端按「分」返回，图上换成元更好读
    revenueTrend.value = toPoints(vt).map((p) => ({ x: p.x, y: Math.round(p.y / 100 * 100) / 100 }));
    reasonDonut.value = reasonLabeled(toPoints(reason));
    tierDonut.value = toPoints(tier);
  } catch (e) {
    // 401 由 adminRequest 统一广播（自动回登录页），能走到这里的就是真失败
    error.value = errText(e) || '请求失败';
    toast(errText(e));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** 举报原因枚举 -> 中文（与举报列表同一套文案） */
function reasonLabeled(points) {
  const m = { SPAM: '垃圾广告', ABUSE: '人身攻击', ILLEGAL: '违法违规', OTHER: '其他' };
  return points.map((p) => ({ x: m[p.x] || p.x, y: p.y }));
}

// ---------- 图表数据 ----------
const moduleBars = computed(() => (modules.value ? modules.value.modules.slice(0, 10).map((m) => ({ x: moduleName(m.module), y: m.pv })) : []));
const moduleDonut = computed(() => (modules.value ? modules.value.modules.slice(0, 6).map((m) => ({ x: moduleName(m.module), y: m.pv })) : []));

/** 模块趋势：取 PV 前 5 的模块，太多种颜色反而看不清 */
const moduleTrendSeries = computed(() => {
  if (!modules.value || !modules.value.trend) return [];
  const colors = ['#165DFF', '#00B42A', '#FF7D00', '#722ED1', '#0FC6C2'];
  const days = modules.value.trend.days || [];
  return modules.value.trend.series.slice(0, 5).map((s, i) => ({
    name: moduleName(s.module),
    color: colors[i % colors.length],
    points: days.map((d, idx) => ({ x: d, y: s.pv[idx] || 0 }))
  }));
});

const qualityBars = computed(() => (quality.value ? quality.value.dims.map((d) => ({ x: d.label, y: d.value })) : []));

// ---------- 导出 ----------
/** 导出中不允许再点（二进制下载，连点会重复下好几个文件） */
async function exportReport(params, key) {
  if (exporting.value) return;
  exporting.value = key || 'export';
  try {
    const name = await downloadExport({ ...params, range: range.value });
    toast('已导出 ' + name);
  } catch (e) {
    toast(errText(e));
  } finally {
    exporting.value = '';
  }
}
</script>

<template>
  <div data-panel="analytics">
    <div class="adm-toolbar">
      <div class="adm-chips">
        <button
          v-for="r in RANGES"
          :key="r[0]"
          class="adm-chip"
          :class="{ on: range === r[0] }"
          @click="range = r[0]; load()"
        >
          {{ r[1] }}
        </button>
      </div>
      <button class="btn sm" :disabled="loading" @click="load()">刷新</button>
      <span v-if="exporting" class="muted" style="font-size: 12px">导出中…</span>
      <span class="muted" style="font-size: 12px">服务端缓存 5 秒；今天的数据包含尚未落库的实时增量</span>
    </div>

    <!-- 加载失败：给一个明确出口，而不是只弹 toast 留一片空白 -->
    <div v-if="error" class="adm-error">
      <b>加载失败</b>
      <span class="msg">{{ error }}</span>
      <button class="btn sm" @click="load()">重试</button>
    </div>

    <!-- 骨架屏（比一行"加载中…"更能说明"马上要来东西了"） -->
    <div v-if="loading && !modules" class="panel">
      <div class="body">
        <div class="sk" style="height: 240px"></div>
        <div class="sk sk-row" style="width: 60%"></div>
        <div class="sk sk-row" style="width: 85%"></div>
      </div>
    </div>

    <template v-else-if="!error">
      <!-- ======== 模块浏览 ======== -->
      <div class="panel">
        <h2>
          模块浏览
          <span class="spacer"></span>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'csv', report: 'modules' })">CSV</button>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'xlsx', report: 'modules' })">XLSX</button>
        </h2>
        <div class="body scroll">
          <div class="adm-split">
            <div class="adm-pane">
              <div class="adm-pane-t">PV 排行（前 10）</div>
              <BarChart :points="moduleBars" :height="210" empty="这段时间没有浏览数据" />
            </div>
            <div class="adm-pane">
              <div class="adm-pane-t">PV 占比（前 6）</div>
              <DonutChart :points="moduleDonut" :height="210" center-label="总浏览" empty="暂无占比" />
            </div>
          </div>

          <div class="adm-pane-t" style="margin-top: 14px">PV 趋势（前 5 模块）</div>
          <LineChart :series="moduleTrendSeries" :height="220" empty="暂无趋势数据" />

          <div v-if="modules && modules.modules.length" class="tbl-x" style="margin-top: 12px">
            <table>
              <thead>
                <tr>
                  <th>模块</th>
                  <th style="width: 100px">PV</th>
                  <th style="width: 120px">UV（人天）</th>
                  <th style="width: 120px">单日峰值 UV</th>
                  <th style="width: 90px">占比</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in modules.modules" :key="m.module">
                  <td>{{ moduleName(m.module) }}</td>
                  <td>{{ m.pv }}</td>
                  <td>{{ m.uv }}</td>
                  <td>{{ m.uvPeak }}</td>
                  <td class="muted">{{ m.sharePct }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="modules && modules.liveToday" class="muted" style="font-size: 11.5px; margin-top: 8px">
            今日数据 = 已落库 + 尚未回写的实时增量（回写每 5 分钟一次，刚浏览完也能看到）
          </div>
        </div>
      </div>

      <!-- ======== 活跃 ======== -->
      <div class="panel" style="margin-top: 14px">
        <h2>
          活跃用户
          <span class="spacer"></span>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'csv', report: 'active' })">CSV</button>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'xlsx', report: 'active' })">XLSX</button>
        </h2>
        <div class="body">
          <div class="adm-stats">
            <div class="adm-stat"><div class="k">今日 DAU</div><div class="v">{{ active ? active.dau : 0 }}</div></div>
            <div class="adm-stat"><div class="k">WAU（近 7 天去重）</div><div class="v">{{ active ? active.wau : 0 }}</div></div>
            <div class="adm-stat"><div class="k">MAU（近 30 天去重）</div><div class="v">{{ active ? active.mau : 0 }}</div></div>
          </div>
          <LineChart
            :series="[{ name: 'DAU', color: '#165DFF', points: active ? active.points : [] }]"
            :height="200"
            :y-format="(v) => v + ' 人'"
            empty="还没有日活数据（每天 00:05 落库）"
          />
        </div>
      </div>

      <!-- ======== 内容 ======== -->
      <div class="panel" style="margin-top: 14px">
        <h2>
          内容与治理
          <span class="spacer"></span>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'csv', report: 'trend', metric: 'reports' })">举报 CSV</button>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'csv', report: 'trend', metric: 'posts' })">发帖 CSV</button>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'xlsx', report: 'breakdown', dim: 'report_reason' })">举报原因 XLSX</button>
        </h2>
        <div class="body">
          <div class="adm-split">
            <div class="adm-pane">
              <div class="adm-pane-t">举报数</div>
              <LineChart :series="[{ name: '举报', color: '#F53F3F', points: reportsTrend }]" :height="180" empty="没有举报" />
            </div>
            <div class="adm-pane">
              <div class="adm-pane-t">举报原因分布</div>
              <DonutChart :points="reasonDonut" :height="180" center-label="举报" empty="没有举报" />
            </div>
          </div>
          <div class="adm-pane-t" style="margin-top: 12px">发帖数</div>
          <LineChart :series="[{ name: '发帖', color: '#00B42A', points: postsTrend }]" :height="180" empty="没有发帖" />
        </div>
      </div>

      <!-- ======== 营收 ======== -->
      <div class="panel" style="margin-top: 14px">
        <h2>
          营收
          <span class="spacer"></span>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'csv', report: 'trend', metric: 'revenue' })">CSV</button>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'xlsx', report: 'breakdown', dim: 'tier' })">档位 XLSX</button>
        </h2>
        <div class="body">
          <div class="adm-split">
            <div class="adm-pane">
              <div class="adm-pane-t">每日充值收入（元）</div>
              <LineChart
                :series="[{ name: '收入', color: '#FF7D00', points: revenueTrend }]"
                :height="180"
                :y-format="(v) => v + ' 元'"
                empty="没有充值记录"
              />
            </div>
            <div class="adm-pane">
              <div class="adm-pane-t">对局档位分布</div>
              <DonutChart :points="tierDonut" :height="180" center-label="对局" empty="没有对局" />
            </div>
          </div>
        </div>
      </div>

      <!-- ======== 质量 ======== -->
      <div class="panel" style="margin-top: 14px">
        <h2>
          对局质量
          <span class="spacer"></span>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'csv', report: 'quality' })">CSV</button>
          <button v-if="canExport" class="btn sm" :disabled="!!exporting" @click="exportReport({ format: 'xlsx', report: 'quality' })">XLSX</button>
        </h2>
        <div class="body">
          <div class="adm-stats">
            <div class="adm-stat"><div class="k">平均轮数</div><div class="v">{{ quality ? quality.avgTurns : 0 }}</div></div>
            <div class="adm-stat"><div class="k">AI 发言占比</div><div class="v">{{ quality ? quality.aiRatio : 0 }}%</div></div>
            <div class="adm-stat"><div class="k">复盘样本</div><div class="v">{{ quality ? quality.samples : 0 }}</div></div>
          </div>
          <div class="adm-pane-t">六维平均分</div>
          <BarChart
            :points="qualityBars"
            :height="200"
            :y-format="(v) => v + ' 分'"
            empty="还没有复盘数据"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.adm-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.adm-chips { display: flex; gap: 6px; }
.adm-chip { border: 1px solid #E5E6EB; background: #fff; color: #4E5969; border-radius: 8px; padding: 5px 12px; font-size: 12.5px; cursor: pointer; }
.adm-chip:hover { background: #F7F8FA; }
.adm-chip.on { background: #E8F3FF; border-color: #165DFF; color: #165DFF; font-weight: 600; }

.adm-split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.adm-pane { min-width: 0; }
.adm-pane-t { font-size: 12px; color: #86909C; margin-bottom: 6px; }

.adm-stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.adm-stat { flex: 1; min-width: 140px; background: #FAFBFC; border: 1px solid #EFF0F1; border-radius: 10px; padding: 10px 14px; }
.adm-stat .k { font-size: 12px; color: #86909C; }
.adm-stat .v { font-size: 20px; font-weight: 700; }

@media (max-width: 900px) {
  .adm-split { grid-template-columns: 1fr; }
}
</style>
