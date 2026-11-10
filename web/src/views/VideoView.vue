<script setup>
/**
 * 视频（等价旧 video.js）：竖滑信息流 / 点赞 / 评论 / 发布 / 审核台。
 *
 * 与旧版一致：
 * · 一次拉 6 条、滚到底自动续；滚到视口内的视频自动播放（IntersectionObserver threshold .6）；
 * · 点赞走服务端返回的 liked/likes，不做本地猜测；
 * · 发布后先显示**机器初审**结果（审核状态 + 判定依据 + 是否上广场），过审才刷新信息流；
 * · 审核台是否可见由后端 `/api/video/audit/rules` 的 consoleEnabled 决定，前端不写死。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { videoApi, ApiError } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { toast } from '../utils/toast.js';

const auth = useAuthStore();

const SEGS = ['', '立论', '驳立论', '质询', '自由辩', '总结', '名场面'];
const SEG_NAMES = { 立论: '立论', 驳立论: '驳立论', 质询: '质询', 自由辩: '自由辩', 总结: '总结', 名场面: '名场面' };

const list = ref([]);
const cursor = ref(0);
const stats = ref({});
const seg = ref('');
const loading = ref(false);
const consoleEnabled = ref(false);
const feedEl = ref(null);

// 抽屉：comments | publish | audit | auditDetail | null
const sheet = ref(null);
const sheetTitle = ref('视频');
const detail = ref(null);          // {video, comments}
const publishResult = ref(null);
const publishing = ref(false);
const commentDraft = ref('');
const auditList = ref([]);
const auditStats = ref({});
const auditStatus = ref('REVIEW');
const auditDetail = ref(null);     // {video, list}
const auditReason = ref('内容与辩论无关');

const pTitle = ref('');
const pDesc = ref('');
const pUrl = ref('https://www.w3schools.com/html/mov_bbb.mp4');
const pTopic = ref('');
const pSeg = ref('名场面');
const pSide = ref('正');

const passedCount = computed(() => stats.value.passed || 0);

let io = null;

async function loadFeed(reset) {
  if (loading.value) return;
  loading.value = true;
  try {
    if (reset) {
      list.value = [];
      cursor.value = 0;
    }
    const d = await videoApi.feed(cursor.value, seg.value);
    list.value = list.value.concat((d && d.list) || []);
    cursor.value = (d && d.nextCursor) || 0;
    stats.value = (d && d.stats) || {};
    await nextTick();
    bindPlayers();
  } catch (e) {
    toast('加载失败：' + errText(e));
  } finally {
    loading.value = false;
  }
}

/** 进入视口就播、离开就停（旧版同款） */
function bindPlayers() {
  const box = feedEl.value;
  if (!box) return;
  if (io) io.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const v = e.target.querySelector('video');
        if (!v) return;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      });
    },
    { threshold: 0.6 }
  );
  box.querySelectorAll('.vslide').forEach((s) => io.observe(s));
}

function onFeedScroll() {
  const box = feedEl.value;
  if (!box) return;
  if (box.scrollTop + box.clientHeight > box.scrollHeight - 240) loadFeed(false);
}

onMounted(async () => {
  await loadFeed(true);
  try {
    const r = await videoApi.rules();
    consoleEnabled.value = !!(r && r.consoleEnabled);
  } catch (e) {
    consoleEnabled.value = false;
  }
});

onBeforeUnmount(() => {
  if (io) io.disconnect();
});

function switchSeg(s) {
  if (seg.value === s) return;
  seg.value = s;
  loadFeed(true);
}

async function toggleLike(v) {
  if (!auth.user) {
    toast('先登录再点赞');
    return;
  }
  try {
    const d = await videoApi.like(v.id, v.liked);
    v.liked = !!d.liked;
    v.likes = d.likes;
  } catch (e) {
    toast(errText(e));
  }
}

function share(v) {
  const url = location.origin + location.pathname + '#v' + v.id;
  if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
  toast('链接已复制');
}

async function openComments(v) {
  sheet.value = 'comments';
  sheetTitle.value = '评论';
  detail.value = null;
  try {
    detail.value = await videoApi.detail(v.id);
  } catch (e) {
    toast(errText(e));
  }
}

async function sendComment() {
  const text = String(commentDraft.value || '').trim();
  if (!text) return;
  try {
    await videoApi.comment(detail.value.video.id, text);
    commentDraft.value = '';
    detail.value = await videoApi.detail(detail.value.video.id);
    loadFeed(true);
  } catch (e) {
    toast(errText(e));
  }
}

function openPublish() {
  if (!auth.user) {
    toast('先登录再发布');
    return;
  }
  publishResult.value = null;
  sheet.value = 'publish';
  sheetTitle.value = '发布辩论视频';
}

async function publish() {
  const title = String(pTitle.value || '').trim();
  if (!title) return toast('先写标题');
  publishing.value = true;
  publishResult.value = { pending: true };
  try {
    const d = await videoApi.publish({
      title,
      description: pDesc.value,
      url: pUrl.value,
      topic: pTopic.value,
      segment: pSeg.value,
      side: pSide.value,
      durationSec: 30
    });
    publishResult.value = d;
    if (d && d.visible) loadFeed(true);
  } catch (e) {
    publishResult.value = { error: errText(e) };
  } finally {
    publishing.value = false;
  }
}

// ==================== 审核台 ====================

async function openAudit() {
  sheet.value = 'audit';
  sheetTitle.value = '审核台';
  await loadQueue('REVIEW');
}

async function loadQueue(status) {
  auditStatus.value = status;
  try {
    const d = await videoApi.queue(status, 50);
    auditList.value = (d && d.list) || [];
    auditStats.value = (d && d.stats) || {};
  } catch (e) {
    toast(errText(e));
  }
}

async function openAuditDetail(v) {
  sheet.value = 'auditDetail';
  sheetTitle.value = '审核详情';
  auditDetail.value = null;
  try {
    auditDetail.value = await videoApi.logs(v.id);
  } catch (e) {
    toast(errText(e));
  }
}

async function decide(id, decision) {
  try {
    await videoApi.decide(id, decision, decision === 'REJECT' ? auditReason.value || '人工驳回' : '');
    toast(decision === 'PASS' ? '已通过，已上广场' : '已驳回');
    loadFeed(true);
    await loadQueue(auditStatus.value);
    sheet.value = 'audit';
  } catch (e) {
    toast(errText(e));
  }
}

async function restore(id) {
  try {
    const d = await videoApi.restore(id);
    toast('已恢复至 ' + (d && d.restoredTo));
    loadFeed(true);
    await loadQueue(auditStatus.value);
    sheet.value = 'audit';
  } catch (e) {
    toast(errText(e));
  }
}

const PILL = {
  PASSED: ['ok', '已通过'],
  REVIEW: ['warn', '待复核'],
  PENDING: ['warn', '待初审'],
  REJECTED: ['bad', '已驳回']
};
function pill(st) {
  const m = PILL[st] || ['warn', st || '-'];
  return { cls: m[0], text: m[1] };
}

function errText(e) {
  if (e instanceof ApiError) return e.code && e.code !== 'HTTP_400' ? e.code + '：' + e.message : e.message;
  return (e && e.message) || '操作失败';
}
</script>

<template>
  <div class="vwrap">
    <div class="vtop">
      <b style="font-size: 16px">视频</b>
      <span style="font-size: 12.5px; color: #9aa0ae">辩论短视频 · {{ passedCount }} 条在架</span>
      <span style="flex: 1"></span>
      <button class="btn sm ghost" @click="openPublish">发布</button>
      <button v-if="consoleEnabled" class="btn sm ghost" @click="openAudit">审核台</button>
    </div>

    <div class="vfilter">
      <button
        v-for="s in SEGS"
        :key="s || 'all'"
        class="vseg"
        :class="{ on: seg === s }"
        @click="switchSeg(s)"
      >
        {{ s || '全部' }}
      </button>
    </div>

    <div ref="feedEl" class="vfeed" @scroll="onFeedScroll">
      <div v-if="!list.length" class="vempty">{{ loading ? '加载中…' : '这个筛选下还没有过审的视频' }}</div>

      <div v-for="v in list" :key="v.id" class="vslide">
        <div class="vwater">辩</div>
        <video :src="v.url" preload="metadata" playsinline muted loop></video>

        <div class="vside">
          <button :class="{ on: v.liked }" @click="toggleLike(v)">
            <span>{{ v.liked ? '♥' : '♡' }}</span><i>{{ v.likes || 0 }}</i>
          </button>
          <button @click="openComments(v)"><span>💬</span><i>{{ v.comments || 0 }}</i></button>
          <button @click="share(v)"><span>↗</span><i>分享</i></button>
        </div>

        <div class="vinfo">
          <div class="vtags">
            <span v-if="v.segment" class="vtag">{{ v.segment }}</span>
            <span v-if="v.topic" class="vtag o">{{ v.topic }}</span>
            <span v-if="v.side" class="vtag">{{ v.side }}方</span>
          </div>
          <h3>{{ v.title }}</h3>
          <div class="vby">
            {{ v.author || '匿名辩手' }} · {{ v.views || 0 }} 次播放{{ v.duration_sec ? ' · ' + v.duration_sec + 's' : '' }}
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== 抽屉 ==================== -->
    <div v-if="sheet" class="vmask show" @click.self="sheet = null">
      <div class="vsheet">
        <div class="vshd">
          <b>{{ sheetTitle }}</b>
          <span style="flex: 1"></span>
          <button class="btn sm ghost" @click="sheet = null">关闭</button>
        </div>

        <div class="vsbd">
          <!-- 评论 -->
          <template v-if="sheet === 'comments'">
            <div v-if="!detail" class="vempty">加载中…</div>
            <template v-else>
              <div class="vcard">
                <b>{{ detail.video.title }}</b>
                <div class="vkv"><span>作者</span><b>{{ detail.video.author || '匿名' }}</b></div>
                <div class="vkv">
                  <span>审核</span>
                  <b><span class="vpill" :class="pill(detail.video.audit_status).cls">{{ pill(detail.video.audit_status).text }}</span></b>
                </div>
              </div>
              <div style="display: flex; gap: 8px; margin: 12px 0">
                <input v-model="commentDraft" class="vinput" placeholder="说点什么…" @keydown.enter="sendComment">
                <button class="btn sm primary" @click="sendComment">发送</button>
              </div>
              <div v-if="(detail.comments || []).length">
                <div v-for="c in detail.comments" :key="c.id" class="vcmt">
                  <div class="vwho">{{ c.author || '匿名' }}</div>
                  {{ c.content }}
                </div>
              </div>
              <div v-else class="vempty">还没有评论</div>
            </template>
          </template>

          <!-- 发布 -->
          <template v-else-if="sheet === 'publish'">
            <div class="vfield">
              <label>标题</label>
              <input v-model="pTitle" class="vinput" placeholder="例如：质询名场面：三句话逼出对方口径矛盾">
            </div>
            <div class="vfield">
              <label>简介（可选）</label>
              <textarea v-model="pDesc" class="vinput" placeholder="这场为什么值得看"></textarea>
            </div>
            <div class="vfield">
              <label>视频地址</label>
              <input v-model="pUrl" class="vinput">
            </div>
            <div class="vfield">
              <label>关联辩题（可选）</label>
              <input v-model="pTopic" class="vinput" placeholder="例如：取消期末考试">
            </div>
            <div class="vrow">
              <div class="vfield" style="flex: 1">
                <label>环节</label>
                <select v-model="pSeg" class="vinput">
                  <option v-for="s in SEGS.filter(Boolean)" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
              <div class="vfield" style="flex: 1">
                <label>立场</label>
                <select v-model="pSide" class="vinput">
                  <option value="正">正方</option>
                  <option value="反">反方</option>
                </select>
              </div>
            </div>

            <button class="btn primary" style="width: 100%" :disabled="publishing" @click="publish">
              {{ publishing ? '提交中…' : '提交审核' }}
            </button>

            <div v-if="publishResult" style="margin-top: 12px">
              <div v-if="publishResult.pending" class="vempty">正在机器初审…</div>
              <div v-else-if="publishResult.error" class="vcard" style="color: #e5484d">{{ publishResult.error }}</div>
              <div v-else class="vcard">
                <div class="vkv">
                  <span>审核结果</span>
                  <b><span class="vpill" :class="pill(publishResult.auditStatus).cls">{{ pill(publishResult.auditStatus).text }}</span></b>
                </div>
                <div class="vkv"><span>判定依据</span><b style="text-align: right; max-width: 62%">{{ publishResult.reason }}</b></div>
                <div class="vkv"><span>是否上广场</span><b>{{ publishResult.visible ? '是' : '否' }}</b></div>
              </div>
            </div>
          </template>

          <!-- 审核台 -->
          <template v-else-if="sheet === 'audit'">
            <div class="vcard">
              <div class="vkv"><span>视频总数</span><b>{{ auditStats.videos || 0 }}</b></div>
              <div class="vkv"><span>已通过</span><b>{{ auditStats.passed || 0 }}</b></div>
              <div class="vkv"><span>待处理</span><b style="color: #e8b279">{{ auditStats.pending || 0 }}</b></div>
              <div class="vkv"><span>已驳回</span><b>{{ auditStats.rejected || 0 }}</b></div>
            </div>

            <div class="vrow" style="margin-bottom: 12px; margin-top: 12px">
              <button
                v-for="q in [['REVIEW', '待复核'], ['PENDING', '待初审'], ['REJECTED', '已驳回'], ['PASSED', '已通过']]"
                :key="q[0]"
                class="btn sm ghost"
                :class="{ primary: auditStatus === q[0] }"
                @click="loadQueue(q[0])"
              >
                {{ q[1] }}
              </button>
            </div>

            <div v-if="!auditList.length" class="vempty">这个队列是空的</div>
            <div
              v-for="v in auditList"
              :key="v.id"
              class="vcard vrowitem"
              style="cursor: pointer"
              @click="openAuditDetail(v)"
            >
              <div class="vthumb">🎬</div>
              <div style="flex: 1; min-width: 0">
                <b style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ v.title }}</b>
                <div style="font-size: 12px; color: #9aa0ae; margin-top: 3px">
                  {{ v.author || '匿名' }} · <span class="vpill" :class="pill(v.audit_status).cls">{{ pill(v.audit_status).text }}</span>
                </div>
                <div style="font-size: 12px; color: #9aa0ae">{{ v.audit_note || '' }}</div>
              </div>
            </div>
          </template>

          <!-- 审核详情 -->
          <template v-else-if="sheet === 'auditDetail'">
            <div v-if="!auditDetail" class="vempty">加载中…</div>
            <template v-else>
              <div class="vcard">
                <b>{{ auditDetail.video.title }}</b>
                <div class="vkv"><span>作者</span><b>{{ auditDetail.video.author || '匿名' }}</b></div>
                <div class="vkv"><span>环节 / 辩题</span><b>{{ auditDetail.video.segment || '-' }} / {{ auditDetail.video.topic || '-' }}</b></div>
                <div class="vkv">
                  <span>当前状态</span>
                  <b><span class="vpill" :class="pill(auditDetail.video.audit_status).cls">{{ pill(auditDetail.video.audit_status).text }}</span></b>
                </div>
              </div>

              <div class="vrow" style="margin: 12px 0">
                <button class="btn sm" style="background: #0e9f6e; color: #fff" @click="decide(auditDetail.video.id, 'PASS')">通过</button>
                <button class="btn sm" style="background: #e5484d; color: #fff" @click="decide(auditDetail.video.id, 'REJECT')">驳回</button>
                <button class="btn sm ghost" @click="restore(auditDetail.video.id)">一键恢复</button>
                <button class="btn sm ghost" @click="sheet = 'audit'">返回队列</button>
              </div>
              <input v-model="auditReason" class="vinput" placeholder="驳回理由（会记进审核记录）">

              <b style="font-size: 12.5px; color: #9aa0ae; display: block; margin-top: 14px">审核记录（可追溯）</b>
              <div style="margin-top: 8px">
                <div v-for="(a, i) in auditDetail.list || []" :key="i" class="vcmt">
                  <div class="vwho">
                    {{ a.stage === 'MACHINE' ? '机器' : a.operator || '人工' }} · {{ a.result }}{{ a.restored ? ' · 已恢复' : '' }}
                  </div>
                  {{ a.reason || '' }}
                </div>
                <div v-if="!(auditDetail.list || []).length" class="vempty">没有记录</div>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
