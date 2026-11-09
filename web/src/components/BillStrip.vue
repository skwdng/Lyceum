<script setup>
/**
 * 本场费用条（等价旧 wallet.js 的 billHTML）。
 *
 * <p>批 1 先把组件备好，批 2 的复盘页直接用 —— 不复制一份样式，避免两处金额口径不一致。
 */
import { computed } from 'vue';
import { useWalletStore } from '../stores/wallet.js';
import { money } from '../utils/format.js';

const props = defineProps({
  billTokens: { type: Number, default: 0 }
});

const wallet = useWalletStore();

const info = computed(() => wallet.info || {});
const per1k = computed(() => Number(info.value.centsPer1kTokens) || 3);
const fee = computed(() => Number(info.value.serviceFeeCents) || 30);
const modelCents = computed(() => Math.ceil((props.billTokens / 1000) * per1k.value));
const totalCents = computed(() => modelCents.value + fee.value);
</script>

<template>
  <div v-if="billTokens > 0" class="bill-strip">
    <div class="row" style="justify-content: space-between; align-items: center">
      <b style="font-size: 12.5px">本场费用</b>
      <b style="font-size: 14px">¥{{ money(totalCents) }}</b>
    </div>
    <div class="kv"><span>模型成本</span><b>{{ billTokens }} token → ¥{{ money(modelCents) }}</b></div>
    <div class="kv"><span>服务费</span><b>¥{{ money(fee) }}</b></div>
    <div style="font-size: 11.5px; color: #a8adb8; margin-top: 4px">
      已从钱包扣除；余额 ¥{{ money(info.balanceCents) }}
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
