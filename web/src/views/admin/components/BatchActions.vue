<script setup>
/**
 * 批量处置条：列表页多选之后出现在表格顶部，**统一填一次理由**再执行。
 *
 * <p>三种列表共用：
 * <ul>
 *   <li>帖子管理：`kind="post"` → 批量屏蔽 / 批量解除屏蔽</li>
 *   <li>评论管理：`kind="comment"` → 同上</li>
 *   <li>用户管理：`kind="user"` → 批量禁言(1/3/7 天) / 批量封禁 / 批量解封</li>
 * </ul>
 *
 * <p>为什么不让每个页面各写一套：理由输入、二次确认、部分失败的提示文案都是一样的，
 * 复制三份等于埋三个"改了忘两处"的坑。
 */
import { computed, ref } from 'vue';
import { contentApi } from '../../../api.js';
import { toast } from '../../../utils/toast.js';
import { errText } from '../helpers.js';

const props = defineProps({
  /** 'post' | 'comment' | 'user' */
  kind: { type: String, required: true },
  ids: { type: Array, default: () => [] }
});
const emit = defineEmits(['clear', 'done']);

const busy = ref('');
const modal = ref(null);   // { action, title }
const note = ref('');
const muteDays = ref(3);

const count = computed(() => props.ids.length);
const isUser = computed(() => props.kind === 'user');

const BUTTONS = computed(() => (isUser.value
  ? [
      { action: 'mute', label: '批量禁言', needNote: true, cls: 'warn' },
      { action: 'ban', label: '批量封禁', needNote: true, cls: 'danger' },
      { action: 'unban', label: '批量解封', needNote: false, cls: '' }
    ]
  : [
      { action: 'hide', label: '批量屏蔽', needNote: true, cls: 'danger' },
      { action: 'unhide', label: '批量解除屏蔽', needNote: false, cls: '' }
    ]));

function open(b) {
  if (!count.value) return toast('请先勾选');
  note.value = '';
  if (b.needNote) {
    modal.value = { action: b.action, title: b.label };
  } else {
    run(b.action, null);
  }
}

async function run(action, reason) {
  busy.value = action;
  try {
    const res = isUser.value
      ? await contentApi.batchUsers({ action, ids: props.ids, days: muteDays.value, reason })
      : await contentApi.batchContent(props.kind, action, props.ids, reason);

    const done = res.done || 0;
    const failed = res.failed || [];
    if (failed.length === 0) {
      toast(`已处理 ${done} 条`);
    } else {
      // 部分失败：把第一条原因也带上，省得用户再点一遍才知道为什么
      toast(`成功 ${done} 条，失败 ${failed.length} 条（${failed[0].id}：${failed[0].reason}）`);
    }
    modal.value = null;
    emit('clear');
    emit('done');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

function submit() {
  if (!modal.value) return;
  run(modal.value.action, note.value.trim() || null);
}
</script>

<template>
  <div v-if="count" class="batch">
    <span class="batch-n">已选 <b>{{ count }}</b> {{ isUser ? '个用户' : '条内容' }}</span>

    <template v-if="isUser">
      <select v-model.number="muteDays" class="batch-sel" title="禁言天数">
        <option :value="1">1 天</option>
        <option :value="3">3 天</option>
        <option :value="7">7 天</option>
      </select>
    </template>

    <button v-for="b in BUTTONS" :key="b.action" class="btn sm" :class="b.cls" :disabled="!!busy" @click="open(b)">
      {{ b.label }}
    </button>
    <button class="btn sm" :disabled="!!busy" @click="emit('clear')">取消选择</button>
    <span v-if="busy" class="muted" style="font-size: 11.5px">处理中…</span>

    <div v-if="modal" class="mask" @click.self="modal = null">
      <div class="modal" style="width: 460px">
        <h3>{{ modal.title }} · 共 {{ count }} {{ isUser ? '个用户' : '条内容' }}</h3>
        <div class="body">
          <label class="batch-lb">
            理由{{ modal.action === 'hide' || modal.action === 'ban' ? '（会写进处理记录并通知作者）' : '（可空）' }}
          </label>
          <textarea v-model="note" class="batch-ta" rows="3" maxlength="200"
                    placeholder="例如：批量刷屏广告"></textarea>
          <div class="muted" style="font-size: 11.5px; margin-top: 6px">
            逐条处理；个别失败（已屏蔽、已被删）不会影响其它条目。
          </div>
        </div>
        <div class="foot">
          <button class="btn" @click="modal = null">取消</button>
          <button class="btn primary" :disabled="!!busy" @click="submit">确定{{ modal.title.replace('批量', '') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batch { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  padding: 10px 12px; margin-bottom: 12px; border-radius: 10px;
  background: #E8F3FF; border: 1px solid #BEDAFF; }
.batch-n { font-size: 13px; margin-right: 4px; }
.batch-sel { padding: 4px 6px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 12px; background: #fff; }
.batch-lb { display: block; font-size: 12.5px; color: #86909C; margin-bottom: 6px; }
.batch-ta { width: 100%; padding: 8px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px; resize: vertical; }
</style>
