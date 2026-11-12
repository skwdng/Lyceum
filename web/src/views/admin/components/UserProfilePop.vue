<script setup>
/**
 * 用户违规浮窗（批次 4/6）：点用户名弹出，显示基本信息 + 统计 + 违规历史，并可直接禁言/封禁。
 *
 * <p>定位：按点击处坐标 fixed 定位，并夹在视口内（靠近右边/下边时自动往回收），
 * 这样在表格最右列点也不会弹出屏幕外。
 *
 * <p>三处入口共用这一个组件：帖子管理 / 评论管理 / 用户管理。
 */
import { computed, ref, watch } from 'vue';
import { adminApi, contentApi } from '../../../api.js';
import { toast } from '../../../utils/toast.js';
import { errText } from '../helpers.js';
import { postDrawer } from '../postDrawer.js';

const props = defineProps({
  userId: { type: String, required: true },
  /** 点击处的视口坐标，用来就近弹出 */
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'changed']);

const W = 460;
const H = 420;

const data = ref(null);
const loading = ref(true);
const error = ref('');
const busy = ref('');
const muteDays = ref(3);

const pos = computed(() => {
  const left = Math.min(Math.max(12, props.x), Math.max(12, window.innerWidth - W - 12));
  const top = Math.min(Math.max(12, props.y), Math.max(12, window.innerHeight - H - 12));
  return { left: left + 'px', top: top + 'px', width: W + 'px' };
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await contentApi.profile(props.userId);
  } catch (e) {
    error.value = errText(e) || '加载失败';
  } finally {
    loading.value = false;
  }
}

watch(() => props.userId, load, { immediate: true });

async function act(key, fn, msg) {
  if (busy.value) return;
  busy.value = key;
  try {
    await fn();
    toast(msg);
    await load();
    emit('changed');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

const mute = () => act('mute', () => contentApi.mute(props.userId, muteDays.value, null), `已禁言 ${muteDays.value} 天`);
const ban = () => act('ban', () => adminApi.setStatus(props.userId, 0), '已全站封禁');
const unban = () => act('unban', () => adminApi.setStatus(props.userId, 1), '已解封');

function fmt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const yuan = (cents) => '¥' + (Number(cents || 0) / 100).toFixed(2);

/**
 * 从"被处置的内容"跳到帖子详情：先关浮窗（浮窗层级更高，不关会挡着抽屉），再开抽屉。
 * 评论会自动定位并高亮那一层；帖子只开抽屉。
 */
function jump(h) {
  if (!h || !h.postId) return toast('这条记录找不到所属帖子（内容可能已被彻底删除）');
  const commentId = h.type === 'COMMENT' ? h.targetId : null;
  emit('close');
  postDrawer.open(h.postId, commentId);
}
</script>

<template>
  <div class="upop-mask" @click.self="emit('close')">
    <div class="upop" :style="pos">
      <div class="upop-head">
        <b>{{ userId }}</b>
        <span v-if="data && data.user.disabled" class="tag red">已封禁</span>
        <span v-else-if="data && data.moderation.muted" class="tag orange">禁言中</span>
        <span v-else class="tag ok">正常</span>
        <span class="spacer"></span>
        <button class="upop-x" @click="emit('close')">×</button>
      </div>

      <div class="upop-body">
        <div v-if="loading" class="muted" style="padding: 14px 0">加载中…</div>
        <div v-else-if="error" class="adm-error">
          <b>加载失败</b><span class="msg">{{ error }}</span>
          <button class="btn sm" @click="load">重试</button>
        </div>

        <template v-else-if="data">
          <div class="upop-row">
            <span>昵称：<b>{{ data.user.name || '(未命名)' }}</b></span>
            <span class="muted">注册于 {{ fmt(data.user.createdAt) }}</span>
          </div>

          <div class="upop-stats">
            <span>帖子 {{ data.stats.posts }}<i v-if="data.stats.hiddenPosts">（已屏蔽 {{ data.stats.hiddenPosts }}）</i></span>
            <span>评论 {{ data.stats.comments }}<i v-if="data.stats.hiddenComments">（已屏蔽 {{ data.stats.hiddenComments }}）</i></span>
            <span>对局 {{ data.stats.matches }}</span>
            <span>余额 {{ yuan(data.stats.walletCents) }}</span>
          </div>

          <div class="upop-sub">禁言记录</div>
          <div v-if="!data.moderation.banHistory.length" class="muted upop-empty">没有禁言记录</div>
          <div v-for="(b, i) in data.moderation.banHistory" :key="i" class="upop-item">
            <span class="tag" :class="b.active ? 'orange' : ''">{{ b.active ? '生效中' : '已过期' }}</span>
            <span>{{ fmt(b.createdAt) }}</span>
            <span>至 {{ fmt(b.untilAt) }}</span>
            <span class="muted">{{ b.operator || 'admin' }}</span>
            <span class="upop-reason" :title="b.reason">{{ b.reason || '（无理由）' }}</span>
          </div>

          <div class="upop-sub">被处置的内容</div>
          <div v-if="!data.moderation.hiddenContent.length" class="muted upop-empty">没有处置记录</div>
          <div v-for="h in data.moderation.hiddenContent" :key="h.auditId" class="upop-item">
            <span class="tag" :class="h.undone ? 'ok' : 'red'">{{ h.undone ? '已恢复' : '已屏蔽' }}</span>
            <!-- 点这条 → 关掉浮窗、打开帖子详情抽屉；是评论的话自动定位到那一层 -->
            <a class="upop-jump" @click="jump(h)">{{ h.type === 'POST' ? '帖子' : '评论' }} #{{ h.targetId }}</a>
            <span class="muted">{{ fmt(h.createdAt) }}</span>
            <span class="upop-reason" :title="h.detail">{{ h.detail }}</span>
          </div>
        </template>
      </div>

      <div class="upop-foot">
        <select v-model.number="muteDays" class="upop-sel">
          <option :value="1">1 天</option>
          <option :value="3">3 天</option>
          <option :value="7">7 天</option>
        </select>
        <button class="btn sm" :disabled="!!busy" @click="mute">禁言</button>
        <button class="btn sm danger" :disabled="!!busy" @click="ban">封禁</button>
        <button class="btn sm" :disabled="!!busy" @click="unban">解封</button>
        <span class="spacer"></span>
        <span v-if="busy" class="muted" style="font-size: 11.5px">处理中…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upop-mask { position: fixed; inset: 0; z-index: 120; background: transparent; }
.upop { position: fixed; background: #fff; border: 1px solid #E5E6EB; border-radius: 12px;
  box-shadow: 0 8px 28px rgba(20,25,40,.16); display: flex; flex-direction: column; max-height: 78vh; }
.upop-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #EFF0F1; }
.upop-x { margin-left: 6px; border: none; background: none; font-size: 18px; line-height: 1; color: #86909C; cursor: pointer; }
.upop-body { padding: 12px 14px; overflow: auto; }
.upop-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; }
.upop-stats { display: flex; gap: 12px; flex-wrap: wrap; margin: 10px 0; font-size: 12.5px; color: #4E5969; }
.upop-stats i { font-style: normal; color: #F53F3F; }
.upop-sub { font-size: 12.5px; font-weight: 600; margin: 12px 0 6px; }
.upop-empty { font-size: 12px; }
.upop-item { display: flex; gap: 8px; align-items: center; font-size: 12px; padding: 4px 0; border-top: 1px dashed #F2F3F5; }
.upop-jump { color: #165DFF; cursor: pointer; white-space: nowrap; }
.upop-jump:hover { text-decoration: underline; }
.upop-reason { color: #86909C; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 190px; }
.upop-foot { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-top: 1px solid #EFF0F1; }
.upop-sel { padding: 4px 6px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 12px; }
</style>
