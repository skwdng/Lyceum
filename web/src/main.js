import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router.js';
import './style.css';
import './chat.css';       // 批 2 的聊天样式（旧 .soc-chat 那套）
import './debate.css';     // 批 2 的辩论样式（对局舞台 / 选座位 / 复盘）

const app = createApp(App);

// pinia 必须早于 router 安装：路由守卫里要用 authStore 判断登录态
app.use(createPinia());
app.use(router);
app.mount('#app');
