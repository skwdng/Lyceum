<template>
  <div class="wrap">
    <h1 class="pg">设置</h1>
    <p class="sub">外观设置只影响本机界面的配色与字体，不影响对局、评分和数据。</p>

    <div class="card">
      <div class="row" style="justify-content: space-between; align-items: baseline">
        <div>
          <b style="font-size: 14px">皮肤</b>
          <span class="sub" style="margin-left: 8px">默认就是现在的皮肤，想换随时换回来</span>
        </div>
        <button class="btn sm ghost" @click="reset">恢复默认</button>
      </div>

      <div class="skins">
        <button
          v-for="s in SKINS"
          :key="s.id"
          class="skin"
          :class="{ on: skin === s.id }"
          :title="s.hint"
          @click="pick(s.id)"
        >
          <div class="sw">
            <i v-for="c in s.sw" :key="c" :style="{ background: c }"></i>
          </div>
          <div class="nm">
            {{ s.name }}
            <span v-if="skin === s.id" class="tag">当前</span>
          </div>
          <div class="ds">{{ s.desc }}</div>
        </button>
      </div>

      <p class="sub" style="margin-top: 12px; font-size: 12px">
        提示：深色皮肤（庭辩现场 / 思辨仪器 / 深夜电台 / 竞技场）在强光下阅读长文可能偏累；
        如果只是换换心情，也可以在任意页面用浏览器控制台执行
        <code>localStorage.removeItem('sy_skin'); location.reload()</code> 回到默认。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { SKINS, applySkin, currentSkin } from '../skins.js';
import { toast } from '../utils/toast.js';

const skin = ref(currentSkin());

function pick(id) {
  skin.value = applySkin(id);
  const s = SKINS.find((x) => x.id === skin.value);
  toast(s && s.id !== 'default' ? `已切换到「${s.name}」` : '已恢复默认皮肤');
}

function reset() {
  pick('default');
}
</script>

<style scoped>
.wrap { max-width: 980px; margin: 0 auto; padding: 22px 24px 40px; }
.pg { font-size: 22px; margin-bottom: 4px; }
.skins {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.skin {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.skin:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08); }
.skin.on { outline: 2px solid var(--blue); outline-offset: 1px; }
.sw { display: flex; height: 34px; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
.sw i { flex: 1; }
.nm { margin-top: 9px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.ds { margin-top: 3px; font-size: 11.5px; color: var(--sub); line-height: 1.6; }
code { font-family: Consolas, monospace; font-size: 11px; background: var(--blue-w); padding: 1px 4px; border-radius: 4px; }
@media (max-width: 520px) {
  .wrap { padding: 16px; }
  .skins { grid-template-columns: 1fr; }
}
</style>
