<script setup>
/**
 * 发帖 / 编辑帖子弹窗（等价旧 cmPostModal + cmSubmitPost）。
 *
 * 与旧版一致的细节：
 * · 三种类型（闲聊/教程/求助）按钮选，默认闲聊；
 * · 标题 40 字、正文支持 Markdown、关联辩题可选；
 * · **@ 提及只在「发新帖」时提交** —— 编辑旧帖再发一遍会让被 @ 的人重复收通知（旧版同款决策）。
 */
import { ref, computed, onMounted } from 'vue';
import { communityApi } from '../api.js';
import { useMetaStore } from '../stores/meta.js';
import { useMention } from '../composables/useMention.js';
import { toast } from '../utils/toast.js';
import { errText } from '../utils/community.js';

const props = defineProps({
  post: { type: Object, default: null }   // 有值=编辑，null=新建
});
const emit = defineEmits(['close', 'saved']);

const meta = useMetaStore();
const mention = useMention();

const editing = computed(() => !!props.post);
const type = ref(props.post ? props.post.type : 'CHAT');
const title = ref(props.post ? props.post.title : '');
const topicId = ref(props.post && props.post.topicId ? String(props.post.topicId) : '');
const body = ref(props.post ? props.post.body : '');
const busy = ref(false);

const TYPES = [
  ['CHAT', '闲聊', '随便聊聊'],
  ['GUIDE', '教程', '分享经验方法'],
  ['HELP', '求助', '卡住了求指点']
];

onMounted(() => meta.ensureTopics());

async function submit() {
  if (busy.value) return;
  const t = title.value.trim();
  const b = body.value.trim();
  if (!t) return toast('先写标题');
  if (!b) return toast('正文还没写');
  busy.value = true;
  try {
    const payload = { type: type.value, title: t, body: b };
    if (editing.value) {
      payload.topicId = topicId.value || null;
      await communityApi.updatePost(props.post.id, payload);
      toast('已保存');
    } else {
      const mentions = mention.ids(b);
      if (mentions.length) payload.mentions = mentions;
      if (topicId.value) payload.topicId = topicId.value;
      const res = await communityApi.createPost(payload);
      toast(String(b).indexOf('＊') >= 0 ? '发布成功，含敏感词已自动打码' : '发布成功');
      emit('saved', { id: res && res.postId, created: true });
      return;
    }
    emit('saved', { id: props.post.id, created: false });
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
      <h3>{{ editing ? '编辑帖子' : '发布帖子' }}</h3>
      <div class="page-desc">先选类型，再写标题和正文 · 正文支持 Markdown，图片只能用外链</div>

      <div class="cm-field" style="margin-top: 16px">
        <div class="cm-field-label">帖子类型</div>
        <div class="cm-opts three">
          <button
            v-for="t in TYPES"
            :key="t[0]"
            class="cm-opt"
            :class="{ on: type === t[0] }"
            @click="type = t[0]"
          >
            <b>{{ t[1] }}</b><small>{{ t[2] }}</small>
          </button>
        </div>
      </div>

      <div class="cm-field">
        <div class="cm-field-label">标题 <span>40 字以内</span></div>
        <input v-model="title" class="cm-input" maxlength="40" placeholder="一句话说清楚你要聊什么">
      </div>

      <div class="cm-field">
        <div class="cm-field-label">关联辩题 <span>可选</span></div>
        <select v-model="topicId" class="cm-input">
          <option value="">不关联辩题</option>
          <option v-for="t in meta.topics" :key="t.id" :value="String(t.id)">{{ t.title }}</option>
        </select>
      </div>

      <div class="cm-field" style="margin-bottom: 0">
        <div class="cm-field-label">正文 <span>输入 @ 可以 @ 人</span></div>
        <textarea
          v-model="body"
          class="cm-textarea"
          placeholder="展开说说…"
          @input="mention.onInput"
          @keydown="mention.onKey"
          @blur="setTimeout(mention.close, 120)"
        ></textarea>
      </div>

      <div class="cm-modal-foot">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="busy" @click="submit">
          {{ busy ? '提交中…' : (editing ? '保存' : '发布') }}
        </button>
      </div>
    </div>

    <!-- @ 候选（fixed 定位到输入框下方，与旧版一致） -->
    <div
      v-if="mention.state.open"
      class="mention-box"
      :style="{ left: mention.state.left + 'px', top: mention.state.top + 'px' }"
    >
      <div
        v-for="(u, i) in mention.state.items"
        :key="u.id"
        class="mention-item"
        :class="{ on: i === mention.state.active }"
        @mousedown.prevent="mention.pick(i)"
      >
        <b>{{ u.name }}</b><span>@{{ u.name }}</span>
      </div>
    </div>
  </div>
</template>
