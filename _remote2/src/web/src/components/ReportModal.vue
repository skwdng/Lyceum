<script setup>
/** 举报弹窗（等价旧 cmRenderReportModal + cmSubmitReport）。 */
import { ref } from 'vue';
import { communityApi } from '../api.js';
import { CM_REASONS, errText } from '../utils/community.js';
import { toast } from '../utils/toast.js';

const props = defineProps({
  targetType: { type: String, required: true },   // POST | COMMENT
  targetId: { type: [String, Number], required: true }
});
const emit = defineEmits(['close', 'done']);

const reason = ref('SPAM');
const detail = ref('');
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  busy.value = true;
  try {
    const res = await communityApi.report({
      targetType: props.targetType,
      targetId: props.targetId,
      reason: reason.value,
      detail: detail.value.trim() || null
    });
    toast('举报已提交（编号 ' + (res && res.reportId) + '）');
    emit('done');
    emit('close');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="cm-modal">
      <h3>举报{{ targetType === 'COMMENT' ? '这条评论' : '这篇帖子' }}</h3>
      <div class="page-desc">举报会提交给管理员人工处理，被举报内容不会自动隐藏。</div>

      <div class="cm-field" style="margin-top: 16px">
        <div class="cm-field-label">举报原因</div>
        <div class="cm-opts">
          <button
            v-for="r in CM_REASONS"
            :key="r[0]"
            class="cm-opt"
            :class="{ on: reason === r[0] }"
            @click="reason = r[0]"
          >
            <b>{{ r[1] }}</b>
          </button>
        </div>
      </div>

      <div class="cm-field" style="margin-bottom: 0">
        <div class="cm-field-label">补充说明 <span>可选，最多 500 字</span></div>
        <textarea v-model="detail" class="cm-textarea" maxlength="500" placeholder="具体哪里有问题？"></textarea>
      </div>

      <div class="cm-modal-foot">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="busy" @click="submit">
          {{ busy ? '提交中…' : '提交举报' }}
        </button>
      </div>
    </div>
  </div>
</template>
