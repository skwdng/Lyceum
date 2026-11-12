<script setup>
/**
 * 举报处理（原 AdminView 的 reports 面板 L297–364 + 详情弹窗 L488–526，
 * 逻辑 L29–33 / L120–127 / L152–175 原样搬入）。
 *
 * 与旧版逐条等价的点：
 * · 进来默认 `status=PENDING`、每页 20 条，先拉第一页；
 * · 三个筛选按钮只是把 status 改掉再拉第一页；
 * · 详情弹窗打开时先清空 `note`；「处置」成功后清详情、toast、刷新列表**并且**刷 stats（徽标要跟着变）；
 * · 只有 BAN / DELETE_AND_BAN 才带 `banDays`（后端契约，前端不猜）。
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { adminApi } from '../../api.js';
import { useAdminStore } from '../../stores/admin.js';
import { toast } from '../../utils/toast.js';
import { actionName, errText, fmtTime, reasonName } from './helpers.js';
import { userPop } from './userPop.js';
import { postDrawer } from './postDrawer.js';

const admin = useAdminStore();

const reports = ref(null);
const reportStatus = ref('PENDING');
const detail = ref(null);
const note = ref('');
const banDays = ref(7);

/** 浮窗里禁言/封禁后，队列与徽标一起刷新 */
/**
 * 点「目标摘要」→ 打开帖子详情抽屉（评论自动定位）。
 *
 * <p>入参既可以是列表里的分组（`targetType/targetId/postId`），
 * 也可以是详情弹窗里的 report（同一套字段）。
 */
function openTargetOf(it) {
  const t = it || {};
  const isComment = t.targetType === 'COMMENT';
  const postId = isComment ? t.postId : (t.postId || t.targetId);
  if (!postId) return toast('找不到这条内容所属的帖子（可能已被彻底删除）');
  if (!t.targetExists && t.targetExists !== undefined) {
    // 目标已删除时也允许打开抽屉：管理端要能看到"这帖子里还剩下什么"
  }
  postDrawer.open(postId, isComment ? t.targetId : null);
}
const offPop = userPop.onChanged(() => loadReports(reports.value ? reports.value.page : 1));
onUnmounted(offPop);
onMounted(() => loadReports(1));

async function loadReports(page = 1, status) {
  if (status) reportStatus.value = status;
  try {
    reports.value = await adminApi.reports(reportStatus.value, page, 20);
  } catch (e) {
    toast(errText(e));
  }
}

async function openDetail(reportId) {
  detail.value = null;
  note.value = '';
  try {
    detail.value = await adminApi.report(reportId);
  } catch (e) {
    toast(errText(e));
  }
}

async function resolveReport(action) {
  const d = detail.value;
  if (!d || !d.report) return;
  const body = { action, note: note.value.trim() || null };
  if (action === 'BAN' || action === 'DELETE_AND_BAN') body.banDays = Number(banDays.value) || 7;
  try {
    await adminApi.resolve(d.report.reportId, body);
    detail.value = null;
    toast('已处理：' + actionName(action));
    await Promise.all([admin.loadStats(), loadReports(reports.value ? reports.value.page : 1)]);
  } catch (e) {
    toast(errText(e));
  }
}
</script>

<template>
  <div data-panel="reports">
    <div class="panel">
      <h2>
        举报队列
        <span class="muted" style="font-weight: 400">按目标聚合 · 举报人数多的在前</span>
        <span class="spacer"></span>
        <button
          v-for="q in [['PENDING', '待处理'], ['RESOLVED', '已处理'], ['REJECTED', '已驳回']]"
          :key="q[0]"
          class="btn sm"
          :class="{ primary: reportStatus === q[0] }"
          @click="loadReports(1, q[0])"
        >
          {{ q[1] }}
        </button>
      </h2>
      <div v-if="!reports" class="muted" style="padding: 20px">加载中…</div>
      <div v-else-if="!(reports.items || []).length" class="muted" style="padding: 28px; text-align: center">
        没有待处理的举报 🎉
      </div>
      <table v-else>
        <thead>
          <tr>
            <th style="width: 72px">类型</th>
            <th>被举报内容</th>
            <th style="width: 120px">举报人数</th>
            <th style="width: 200px">原因</th>
            <th style="width: 130px">最近</th>
            <th style="width: 80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in reports.items" :key="it.firstReportId">
            <td>
              <span class="tag" :class="it.targetType === 'POST' ? 'blue' : 'orange'">
                {{ it.targetType === 'POST' ? '帖子' : '评论' }}
              </span>
            </td>
            <td>
              <div style="font-weight: 600">
                <a class="rp-title" @click="openTargetOf(it)">{{ it.targetSummary || '（内容已删除）' }}</a>
              </div>
              <div class="muted" style="font-size: 12px; margin-top: 2px">
                <a v-if="it.targetAuthor" class="rp-link" @click="userPop.open(it.targetAuthor, $event)">{{ it.targetAuthor }}</a>{{ it.postId ? ' · 帖子 #' + it.postId : '' }}
                <span v-if="!it.targetExists" class="tag">目标已删除</span>
              </div>
            </td>
            <td>
              {{ it.reporterCount }} 人
              <span v-if="it.multiReport" class="tag red">多人举报</span>
            </td>
            <td>
              <span v-for="r in it.reasons || []" :key="r" class="tag">{{ reasonName(r) }}</span>
            </td>
            <td class="muted">{{ fmtTime(it.lastAt) }}</td>
            <td><button class="btn sm primary" @click="openDetail(it.firstReportId)">处理</button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="reports && reports.total > reports.size" class="pager">
        <span class="muted">共 {{ reports.total }} 条 · 第 {{ reports.page }} 页</span>
        <button class="btn sm" :disabled="reports.page <= 1" @click="loadReports(reports.page - 1)">上一页</button>
        <button
          class="btn sm"
          :disabled="reports.page >= Math.ceil(reports.total / reports.size)"
          @click="loadReports(reports.page + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 举报详情（仍是弹窗，行为与旧版一致） -->
    <div v-if="detail" class="mask" @click.self="detail = null">
      <div class="modal" style="width: 620px">
        <h3>处理举报</h3>
        <div class="body">
          <div v-if="detail.report" class="muted" style="font-size: 12.5px; margin-bottom: 10px">
            {{ detail.report.targetType === 'POST' ? '帖子' : '评论' }} · 举报人 {{ detail.report.reporterName || detail.report.reporterId }}
            · {{ reasonName(detail.report.reason) }}
          </div>
          <div class="card" style="background: #f7f8fa; border: 1px solid #eff0f1; border-radius: 10px; padding: 12px 14px">
            <div style="font-weight: 600">
              <a class="rp-title" @click="openTargetOf(detail.report)">{{ (detail.target && detail.target.summary) || detail.report.targetSummary || '（内容已删除）' }}</a>
            </div>
            <div class="muted" style="font-size: 12px; margin-top: 4px">
              作者 <a v-if="detail.target && detail.target.author" class="rp-link"
                     @click="userPop.open(detail.target.author, $event)">{{ detail.target.author }}</a>
              <template v-else>-</template>
            </div>
            <div v-if="detail.report.detail" style="margin-top: 8px; font-size: 12.5px">
              补充：{{ detail.report.detail }}
            </div>
          </div>

          <label style="margin-top: 12px; display: block">处理备注（可选）</label>
          <input v-model="note" placeholder="写明依据，会记进审计" style="width: 100%">

          <label style="margin-top: 12px; display: block">禁言天数（选择「禁言」时生效）</label>
          <select v-model="banDays" style="width: 140px">
            <option :value="1">1 天</option>
            <option :value="3">3 天</option>
            <option :value="7">7 天</option>
            <option :value="30">30 天</option>
          </select>
        </div>
        <div class="foot">
          <button class="btn" @click="detail = null">取消</button>
          <button class="btn" @click="resolveReport('IGNORE')">忽略</button>
          <button class="btn warn" @click="resolveReport('BAN')">禁言</button>
          <button class="btn danger" @click="resolveReport('DELETE')">删除内容</button>
          <button class="btn danger" @click="resolveReport('DELETE_AND_BAN')">删除并禁言</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 作者 id 可点（看封禁历史） */
.rp-link { color: #165DFF; cursor: pointer; }
.rp-link:hover { text-decoration: underline; }
/* 目标摘要可点（看帖子详情，评论自动定位） */
.rp-title { color: inherit; cursor: pointer; }
.rp-title:hover { color: #165DFF; text-decoration: underline; }
</style>
