<script setup>
/**
 * 本场费用条（等价旧 wallet.js 的 billHTML）。
 *
 * 批 1 先做成组件，批 2 的复盘页直接用；批 5 加上「AI 档位 / 付款人 / 免费档」三件事：
 * · **自带 Key（BYOK）全免**：模型成本 0、服务费 0，服务费那行显示「免费」而不是 ¥0.30；
 * · **基础版（BASIC）也免费**（后端 chargeModelCost/chargeServiceFee 都为 false）；
 * · **付款人**：多人房整场费用记在房主名下（后端 payer_user_id），不是发起人自己。
 *
 * 显示条件也放宽了：BYOK/基础版打完 billTokens 是 0，旧逻辑 `billTokens>0` 会把整条藏起来，
 * 于是"免费"这件事反而看不见 —— 现在只要知道档位就显示。
 */
import { computed } from 'vue';
import { useWalletStore } from '../stores/wallet.js';
import { money } from '../utils/format.js';

const props = defineProps({
  billTokens: { type: Number, default: 0 },
  /** 本场 AI 档位：BASIC / PRO / BYOK（'' = 未知，按 PRO 展示） */
  tier: { type: String, default: '' },
  /** 付款人标签，例如「房主」；空 = 自己付 */
  payer: { type: String, default: '' }
});

const wallet = useWalletStore();

const info = computed(() => wallet.info || {});
const per1k = computed(() => Number(info.value.centsPer1kTokens) || 3);
const fee = computed(() => Number(info.value.serviceFeeCents) || 30);

const tierKey = computed(() => String(props.tier || 'PRO').toUpperCase());
const tierLabel = computed(() =>
  tierKey.value === 'BYOK' ? '自带 Key' : tierKey.value === 'BASIC' ? '基础版' : '高级版'
);
/** 免费档：自带 Key（用自己额度/本地模型）、基础版（本地 ollama） */
const isFree = computed(() => tierKey.value === 'BYOK' || tierKey.value === 'BASIC');

const modelCents = computed(() => (isFree.value ? 0 : Math.ceil((props.billTokens / 1000) * per1k.value)));
const feeCents = computed(() => (isFree.value ? 0 : fee.value));
const totalCents = computed(() => modelCents.value + feeCents.value);
const show = computed(() => props.billTokens > 0 || !!props.tier);
</script>

<template>
  <div v-if="show" class="bill-strip">
    <div class="row" style="justify-content: space-between; align-items: center">
      <b style="font-size: 12.5px">本场费用</b>
      <b style="font-size: 14px">{{ isFree ? '免费' : '¥' + money(totalCents) }}</b>
    </div>
    <div class="kv"><span>档位</span><b>{{ tierLabel }}</b></div>
    <div class="kv"><span>模型成本</span><b>{{ billTokens }} token → {{ isFree ? '免费' : '¥' + money(modelCents) }}</b></div>
    <div class="kv"><span>服务费</span><b>{{ isFree ? '免费' : '¥' + money(feeCents) }}</b></div>
    <div v-if="payer" class="kv"><span>付款人</span><b>{{ payer }}</b></div>
    <div style="font-size: 11.5px; color: #a8adb8; margin-top: 4px">
      {{ isFree ? '平台零成本，本场不扣费' : '已从钱包扣除' }}；余额 ¥{{ money(info.balanceCents) }}
    </div>
  </div>
</template>

<style scoped>
.bill-strip {
  margin-top: 12px;
  padding: 12px 14px;
  background: #fbfcfe;
  border: 1px solid #dce3f5;
  border-radius: 12px;
}
</style>
