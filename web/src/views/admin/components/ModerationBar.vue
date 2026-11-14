<script setup>
/**
 * 处置按钮条：屏蔽 / 解除屏蔽 / 禁言(1·3·7) / 全站封禁 / 解封。
 *
 * 三处入口（帖子详情、评论行、用户浮窗）共用同一份按钮与二次确认逻辑，
 * 免得三个地方各写一套"点错了怎么办"。
 *
 * 所有动作都走既有接口：hide/unhide 在 `contentApi`，禁言 `contentApi.mute`，
 * 封禁复用用户管理的 `adminApi.setStatus`。
 */
import { computed, ref } from 'vue';
import { adminApi, contentApi } from '../../../api.js';
import { useAdminStore } from '../../../stores/admin.js';
import { toast } from '../../../utils/toast.js';
import { errText } from '../helpers.js';

const props = defineProps({
  /** 'post' | 'comment' */
  type: { type: String, required: true },
  id: { type: [Number, String], required: true },
  authorId: { type: String, default: '' },
  hidden: { type: Boolean, default: false },
  /** 是否显示"禁言/封禁"（列表行里可以关掉，浮窗里必须显示） */
  showUserActions: { type: Boolean, default: true },
  size: { type: String, default: 'sm' }
});

const emit = defineEmits(['changed']);

const busy = ref('');
const muteOpen = ref(false);
const muteDays = ref(3);
const muteReason = ref('');

/**
 * 按钮级权限：没有权限点就**不渲染按钮**（不是灰掉）。
 *
 * <p>后端每个接口还挂着 `@Require`，所以这只是"别让人点到一个注定 403 的按钮"；
 * 真正的强制在服务端。
 */
const adminStore = useAdminStore();
const canModerate = computed(() => adminStore.has('content:moderate'));
const canBan = computed(() => adminStore.has('user:ban'));

const disabled = computed(() => !!busy.value);

async function run(key, fn, okMsg) {
  if (busy.value) return;
  busy.value = key;
  try {
    await fn();
    toast(okMsg);
    emit('changed');
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

function hide() {
  const note = window.prompt('屏蔽理由（可空，会写进处理记录并通知作者）', '');
  if (note === null) return;                     // 用户点了取消
  run('hide', () => contentApi.hide(props.type, props.id, note || null), '已屏蔽');
}

function unhide() {
  run('unhide', () => contentApi.unhide(props.type, props.id), '已解除屏蔽');
}

function openMute() {
  if (!props.authorId) return toast('这条内容没有作者信息');
  muteDays.value = 3;
  muteReason.value = '';
  muteOpen.value = true;
}

function submitMute() {
  run('mute', () => contentApi.mute(props.authorId, muteDays.value, muteReason.value || null),
    `已禁言 ${muteDays.value} 天`);
  muteOpen.value = false;
}

function ban() {
  if (!props.authorId) return toast('这条内容没有作者信息');
  if (!window.confirm(`确定全站封禁 ${props.authorId}？封禁后该用户下一次请求就会被踢下线。`)) return;
  run('ban', () => adminApi.setStatus(props.authorId, 0), '已全站封禁');
}

function unban() {
  if (!props.authorId) return;
  run('unban', () => adminApi.setStatus(props.authorId, 1), '已解封');
}
</script>

<template>
  <span class="mb">
    <!-- 内容处置：content:moderate（VIEWER / 无此权限的角色看不到） -->
    <button v-if="canModerate && !hidden" class="btn" :class="size" :disabled="disabled" @click="hide">屏蔽</button>
    <button v-else-if="canModerate" class="btn" :class="size" :disabled="disabled" @click="unhide">解除屏蔽</button>

    <!-- 用户处置：user:ban（MOD / VIEWER 看不到） -->
    <template v-if="canBan && showUserActions && authorId">
      <button class="btn" :class="size" :disabled="disabled" @click="openMute">禁言</button>
      <button class="btn" :class="size" :disabled="disabled" @click="ban">封禁</button>
      <button class="btn" :class="size" :disabled="disabled" @click="unban">解封</button>
    </template>

    <span v-if="busy" class="muted" style="font-size: 11.5px">处理中…</span>

    <div v-if="muteOpen" class="mask" @click.self="muteOpen = false">
      <div class="modal" style="width: 420px">
        <h3>禁言 {{ authorId }}</h3>
        <div class="body">
          <div class="mb-days">
            <button v-for="d in [1, 3, 7]" :key="d" class="btn sm" :class="{ primary: muteDays === d }"
                    @click="muteDays = d">{{ d }} 天</button>
          </div>
          <label class="mb-lb">理由（可空，≤200 字）</label>
          <input v-model="muteReason" class="mb-input" maxlength="200" placeholder="例如：刷屏广告" />
        </div>
        <div class="foot">
          <button class="btn" @click="muteOpen = false">取消</button>
          <button class="btn primary" :disabled="disabled" @click="submitMute">确定禁言 {{ muteDays }} 天</button>
        </div>
      </div>
    </div>
  </span>
</template>

<style scoped>
.mb { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.mb-days { display: flex; gap: 8px; margin-bottom: 12px; }
.mb-lb { display: block; font-size: 12.5px; color: #86909C; margin-bottom: 6px; }
.mb-input { width: 100%; padding: 8px 10px; border: 1px solid #E5E6EB; border-radius: 8px; font-size: 13px; }
</style>
