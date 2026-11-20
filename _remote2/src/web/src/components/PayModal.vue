<script setup>
/**
 * 模拟收银台。
 *
 * <p>与旧版的**唯一有意差异**：旧版用 `confirm()`（浏览器原生弹窗，样式不可控、会阻塞整页），
 * 这里换成页内弹窗。流程完全一致：
 *   ① 先下单（`POST /api/pay/orders`，此时不入账）→ ② 用户在弹窗里确认 → ③ 回调（验签 + 幂等入账）。
 * 订单必须在弹窗**之前**创建：`sign` 是绑在这笔订单上的，先弹窗后下单就得把金额再传一遍。
 */
import { ref } from 'vue';
import { walletApi } from '../api.js';
import { money } from '../utils/format.js';

const props = defineProps({
  order: { type: Object, required: true }   // { orderId, amountCents, sign }
});
const emit = defineEmits(['paid', 'cancel']);

const busy = ref(false);
const err = ref('');

async function confirmPay() {
  if (busy.value) return;
  busy.value = true;
  err.value = '';
  try {
    const r = await walletApi.payCallback(
      props.order.orderId,
      props.order.amountCents,
      props.order.sign,
      'MOCK-' + Date.now()
    );
    emit('paid', r);
  } catch (e) {
    err.value = (e && e.message) || '支付失败';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mask" @click.self="emit('cancel')">
    <div class="panel" style="width: min(420px, 100%)">
      <div class="row" style="justify-content: space-between; align-items: center">
        <h2 style="margin: 0; font-size: 17px">模拟收银台</h2>
        <button class="btn sm ghost" :disabled="busy" @click="emit('cancel')">关闭</button>
      </div>

      <div style="margin: 18px 0 6px">
        <div class="big" style="font-size: 32px">¥{{ money(order.amountCents) }}</div>
        <div style="font-size: 12px; color: #8a909c">订单 {{ order.orderId }}</div>
      </div>

      <p class="sub" style="margin-bottom: 0">
        这是本地模拟支付，不会真实扣款。真实环境这里会跳转微信 / 支付宝。
      </p>

      <p v-if="err" style="font-size: 12.5px; color: #c0392b">{{ err }}</p>

      <div class="row" style="margin-top: 16px; gap: 8px">
        <button class="btn primary" :disabled="busy" @click="confirmPay">
          {{ busy ? '处理中…' : '确认已付款' }}
        </button>
        <button class="btn ghost" :disabled="busy" @click="emit('cancel')">取消</button>
      </div>
    </div>
  </div>
</template>
