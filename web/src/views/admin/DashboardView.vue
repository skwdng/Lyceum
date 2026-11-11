<script setup>
/**
 * 概览（原 AdminView 的统计卡 L290–294）。
 *
 * 本期**只搬数字**：`stats` 由 AdminLayout 挂载时拉一次（stores/admin.js），这里只读，
 * 不发请求 —— 坑 #1「别把 stats 请求放在每个子页各发一次」。
 * 图表（Sparkline / 折线）要等 P2 的组件 + P3 的 /api/admin/analytics/**，见各卡下方的 TODO。
 */
import { useAdminStore } from '../../stores/admin.js';

const admin = useAdminStore();
</script>

<template>
  <div data-panel="dashboard">
    <div class="cards">
      <div class="card">
        <div class="k">待处理举报</div>
        <div class="v">{{ admin.pendingCount }}</div>
        <!-- TODO(P4): 接图表 —— 待处理举报的 7 天趋势（Sparkline） -->
      </div>
      <div class="card">
        <div class="k">今日新增</div>
        <div class="v">{{ (admin.stats && admin.stats.todayReports) || 0 }}</div>
        <!-- TODO(P4): 接图表 —— 今日举报量与昨日对比（折线 + 涨跌） -->
      </div>
      <div class="card">
        <div class="k">禁言中用户</div>
        <div class="v">{{ (admin.stats && admin.stats.bannedUsers) || 0 }}</div>
        <!-- TODO(P4): 接图表 —— 禁言/封禁分布（环形） -->
      </div>
    </div>
  </div>
</template>
