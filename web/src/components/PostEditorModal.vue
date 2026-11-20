<script setup>
/**
 * 发帖 / 编辑帖子弹窗（等价旧 cmPostModal + cmSubmitPost）。
 *
 * 与旧版一致的细节：
 * · 三种类型（闲聊/教程/求助）按钮选，默认闲聊；
 * · 标题 40 字、正文支持 Markdown、关联辩题可选；
 * · **@ 提及只在「发新帖」时提交** —— 编辑旧帖再发一遍会让被 @ 的人重复收通知（旧版同款决策）。
 */
import { ref, computed, onMounted, watch } from 'vue';
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

// ==================== 标签（T2） ====================
/** 已选标签的名字（后端只要名字，重名/存在性由它按 name_key 归一） */
const tagNames = ref(
  props.post && Array.isArray(props.post.tags) ? props.post.tags.map((t) => String(t.name)) : []
);
/** 联想：输入停顿 250ms 才查（与搜索同一节奏），只显示后端"用过的"标签 */
const tagInput = ref('');
const tagSug = ref([]);
const tagOpen = ref(false);
const tagActive = ref(0);
const MAX_TAGS = 5;                       // 与后端 TagService.MAX_PER_POST 一致

const tagFull = computed(() => tagNames.value.length >= MAX_TAGS);

let tagTimer = null;
watch(tagInput, (v) => {
  clearTimeout(tagTimer);
  const kw = String(v || '').trim();
  if (!kw) {
    tagSug.value = [];
    tagOpen.value = false;
    return;
  }
  tagTimer = setTimeout(async () => {
    try {
      const res = await communityApi.tagSuggest(kw, 8);
      tagSug.value = ((res && res.items) || []).filter(
        (t) => !tagNames.value.some((n) => n.toLowerCase() === String(t.name).toLowerCase())
      );
      tagOpen.value = true;
      tagActive.value = 0;
    } catch (e) {
      tagSug.value = [];
    }
  }, 250);
});

function addTag(raw) {
  const name = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (tagFull.value) return toast(`最多 ${MAX_TAGS} 个标签`);
  if (name.length > 12) return toast('标签最多 12 个字');
  if (tagNames.value.some((n) => n.toLowerCase() === name.toLowerCase())) {
    tagInput.value = '';
    tagOpen.value = false;
    return toast('这个标签已经加过了');
  }
  tagNames.value.push(name);
  tagInput.value = '';
  tagSug.value = [];
  tagOpen.value = false;
}

function removeTag(i) {
  tagNames.value.splice(i, 1);
}

/** 键盘：回车 = 新建或选中联想项；上下选联想；退格删最后一个 */
function onTagKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (tagOpen.value && tagSug.value[tagActive.value]) addTag(tagSug.value[tagActive.value].name);
    else addTag(tagInput.value);
    return;
  }
  if (e.key === 'Backspace' && !tagInput.value && tagNames.value.length) {
    tagNames.value.pop();
    return;
  }
  if (!tagOpen.value) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    tagActive.value = Math.min(tagSug.value.length - 1, tagActive.value + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    tagActive.value = Math.max(0, tagActive.value - 1);
  } else if (e.key === 'Escape') {
    tagOpen.value = false;
  }
}

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
    const payload = { type: type.value, title: t, body: b, tags: tagNames.value };
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

      <!-- T2：标签（最多 5 个；输入即联想，回车＝新建或选中联想项） -->
      <div class="cm-field">
        <div class="cm-field-label">
          标签 <span>可选，最多 {{ MAX_TAGS }} 个 · 回车新建</span>
        </div>
        <div class="tag-pick" data-panel="tag-picker">
          <span v-for="(n, i) in tagNames" :key="n + i" class="tp-chip">
            {{ n }}<i @click="removeTag(i)">✕</i>
          </span>
          <input
            v-model="tagInput"
            :disabled="tagFull"
            class="tp-input"
            maxlength="12"
            :placeholder="tagFull ? '已满 ' + MAX_TAGS + ' 个' : '输入标签，回车添加'"
            @keydown="onTagKey"
            @focus="tagOpen = tagSug.length > 0"
            @blur="setTimeout(() => (tagOpen = false), 150)"
          >
        </div>
        <div v-if="tagOpen && tagSug.length" class="tag-sug">
          <div
            v-for="(t, i) in tagSug"
            :key="t.id"
            class="ts"
            :class="{ on: i === tagActive }"
            @mousedown.prevent="addTag(t.name)"
          >
            {{ t.name }}<small>用 {{ t.useCount }} 次</small>
          </div>
        </div>
        <div v-else-if="tagInput.trim()" class="tag-sug">
          <div class="ts new" @mousedown.prevent="addTag(tagInput)">＋ 新建标签「{{ tagInput.trim() }}」</div>
        </div>
        <div class="tag-hint">标签不能含 # @ / \ ；命中敏感词会被拒绝（不会打码）</div>
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
