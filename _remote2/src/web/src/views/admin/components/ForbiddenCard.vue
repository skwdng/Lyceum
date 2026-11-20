<script setup>
/**
 * 「无权限」卡片。
 *
 * <p>为什么不是 404、不是白屏：直接输 URL（或菜单被隐藏后用旧书签）进来时，
 * 用户需要知道**为什么什么都看不到**，以及该找谁 —— 白屏会让人以为系统坏了。
 *
 * <p>前端只是"好看一点"：后端每个接口仍然用 `@Require` 强制校验，
 * 就算有人在控制台改掉 store 里的权限点，请求一样会被 403。
 */
defineProps({
  /** 缺的权限点（有就显示出来，方便去要权限） */
  perm: { type: String, default: '' },
  /** 角色名（显示当前身份，便于自查"是不是登错号了"） */
  role: { type: String, default: '' }
});
</script>

<template>
  <div class="panel forbid" data-panel="forbidden">
    <div class="ic">🔒</div>
    <h2>无权限</h2>
    <p class="muted">
      当前账号<template v-if="role">（{{ role }}）</template>没有访问这个页面的权限<span
        v-if="perm">，缺少 <code>{{ perm }}</code></span>。
    </p>
    <p class="muted" style="font-size: 12.5px">
      需要的话请联系超管在「管理员管理」里调整你的角色。
    </p>
    <router-link class="btn sm primary" to="/admin/dashboard">回到概览</router-link>
  </div>
</template>

<style scoped>
.forbid { text-align: center; padding: 56px 24px; }
.forbid .ic { font-size: 34px; line-height: 1; margin-bottom: 10px; }
.forbid h2 { margin: 0 0 10px; font-size: 18px; }
.forbid code { background: #F2F3F5; padding: 1px 6px; border-radius: 6px; font-size: 12px; }
</style>
