<script setup>
/**
 * 钱包（等价旧 wallet.js 的 openWallet 弹窗，改成独立路由 #/wallet）。
 *
 * 与旧版的差异（已确认）：
 * · 旧版是侧栏余额胶囊 → 弹窗；这里做成路由页 + 侧栏胶囊（点胶囊进本页）。
 * · 旧版模拟收银台用 `confirm()`；这里换成页内 `<PayModal>`，流程一致：
 *   下单（不入账）→ 用户确认 → 回调（验签 + 幂等入账）。
 */
import { ref, computed, onMounted } from 'vue';
import { walletApi, ApiError } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useWalletStore } from '../stores/wallet.js';
import { money } from '../utils/format.js';
import { toast } from '../utils/toast.js';
import PayModal from '../components/PayModal.vue';

const auth = useAuthStore();
const wallet = useWalletStore();

const tx = ref([]);
const txError = ref('');
const order = ref(null);          // 当前待支付的订单
const busy = ref(false);

const info = computed(() => wallet.info || {});

/** BYOK（用自己的 API）表单 */
const llm = ref({ baseUrl: '', model: '', apiKey: '', state: '读取中…', msg: '' });

const RECHARGE = [100, 500, 1000, 2000];   // 单位：分

onMounted(async () => {
  if (!auth.user) return;        // 未登录由外壳的引导卡接管
  await wallet.refresh();
  loadTx();
  loadLlm();
});

async function loadTx() {
  txError.value = '';
  try {
    const d = await walletApi.history(10);
    tx.value = (d && d.list) || [];
  } catch (e) {
    txError.value = (e && e.message) || '加载失败';
  }
}

async function loadLlm() {
  try {
    const d = await walletApi.llmProfile();
    llm.value.state = d.enabled ? '已启用 · ' + (d.keyMask || '') : d.configured ? '已保存（未启用）' : '未配置';
    if (d.baseUrl) llm.value.baseUrl = d.baseUrl;
    if (d.model) llm.value.model = d.model;
  } catch (e) {
    llm.value.state = '读取失败';
  }
}

/** 点「充 ¥X」：先下单（不入账），再弹收银台 */
async function recharge(cents) {
  if (busy.value) return;
  busy.value = true;
  try {
    const o = await walletApi.createOrder(cents);
    order.value = o;
  } catch (e) {
    toast('下单失败：' + ((e && e.message) || ''));
  } finally {
    busy.value = false;
  }
}

async function onPaid(r) {
  order.value = null;
  await wallet.refresh();
  await loadTx();
  toast(r && r.already ? '这笔订单已入账过' : '支付成功，余额 ¥' + money(r && r.balanceCents));
}

async function saveLlm(enabled) {
  llm.value.msg = '';
  try {
    const d = await walletApi.saveLlmProfile({
      baseUrl: llm.value.baseUrl || '',
      model: llm.value.model || '',
      apiKey: llm.value.apiKey || '',
      enabled: !!enabled
    });
    llm.value.msg = enabled ? '已启用 · ' + (d.keyMask || '') : '已停用（改用平台额度）';
    llm.value.apiKey = '';
    loadLlm();
  } catch (e) {
    llm.value.msg = '保存失败：' + ((e && e.message) || '');
  }
}

async function testLlm() {
  llm.value.msg = '测试中…';
  try {
    const d = await walletApi.testLlm();
    llm.value.msg = d.ok
      ? '连通正常 · ' + d.latencyMs + 'ms · 模型回「' + (d.reply || '') + '」'
      : '失败：' + (d.reason || '未知原因');
  } catch (e) {
    llm.value.msg = '测试失败：' + (e instanceof ApiError ? e.code || e.message : (e && e.message));
  }
}
</script>

<template>
  <h1 class="pg">钱包</h1>
  <p class="sub">余额、充值、最近的流水都在这里 · 开局预扣预估费用，打完按实际 token 用量多退少补。</p>

  <div class="grid g2">
    <div>
      <div class="card">
        <div style="margin: 4px 0 6px">
          <div class="big" style="font-size: 34px">¥{{ money(info.balanceCents) }}</div>
          <div style="font-size: 12px; color: #8a909c">当前余额</div>
        </div>

        <div class="card" style="margin-top: 10px; padding: 12px; background: #fbfcf8">
          <div class="kv"><span>一场费用</span><b>约 ¥{{ money(info.estimateCents) }}</b></div>
          <div class="kv"><span>模型成本</span><b>{{ info.centsPer1kTokens || 0 }} 分 / 千 token（按实际用量）</b></div>
          <div class="kv"><span>服务费</span><b>{{ info.serviceFeeCents || 0 }} 分 / 场</b></div>
        </div>

        <div style="margin-top: 14px">
          <div class="row" style="gap: 8px; flex-wrap: wrap">
            <button
              v-for="c in RECHARGE"
              :key="c"
              class="btn sm ghost"
              :disabled="busy"
              @click="recharge(c)"
            >
              充 ¥{{ money(c) }}
            </button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 14px">
        <b style="font-size: 12.5px">最近流水</b>
        <div style="margin-top: 6px">
          <div v-if="txError" class="empty" style="padding: 12px 0">{{ txError }}</div>
          <template v-else-if="tx.length">
            <div v-for="(x, i) in tx" :key="i" class="kv" style="font-size: 12px">
              <span>{{ x.note || x.kind }}</span>
              <b :style="{ color: x.amount_cents >= 0 ? '#0E9F6E' : '#C0392B' }">
                {{ x.amount_cents >= 0 ? '+' : '' }}{{ money(x.amount_cents) }} 元
              </b>
            </div>
          </template>
          <div v-else class="empty" style="padding: 12px 0">还没有流水</div>
        </div>
      </div>
    </div>

    <div class="card" style="align-self: start">
      <div class="row" style="justify-content: space-between; align-items: center">
        <b style="font-size: 12.5px">用自己的 API</b>
        <span style="font-size: 11.5px; color: #8a909c">{{ llm.state }}</span>
      </div>
      <div style="font-size: 11.5px; color: #a8adb8; margin: 4px 0 10px">
        填自己的 key 跑对局：模型成本不算钱，只收 0.30 元/场服务费。
      </div>

      <div class="auth-field">
        <label>Base URL</label>
        <input v-model="llm.baseUrl" placeholder="https://api.deepseek.com/v1">
      </div>
      <div class="auth-field">
        <label>模型</label>
        <input v-model="llm.model" placeholder="deepseek-chat">
      </div>
      <div class="auth-field">
        <label>API Key（留空表示不改）</label>
        <input v-model="llm.apiKey" type="password" placeholder="sk-…">
      </div>

      <div class="row" style="gap: 8px">
        <button class="btn sm ghost" @click="saveLlm(true)">保存并启用</button>
        <button class="btn sm ghost" @click="saveLlm(false)">停用</button>
        <button class="btn sm ghost" @click="testLlm">测试连通</button>
      </div>
      <div v-if="llm.msg" style="font-size: 11.5px; margin-top: 8px; color: #8a909c">{{ llm.msg }}</div>
    </div>
  </div>

  <PayModal
    v-if="order"
    :order="order"
    @paid="onPaid"
    @cancel="order = null"
  />
</template>
