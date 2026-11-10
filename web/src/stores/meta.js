import { defineStore } from 'pinia';
import { debateApi, baseApi } from '../api.js';

/**
 * 公共元数据缓存（辩题题库 / 热榜）。
 *
 * 迁移期的需要：社区发帖要选「关联辩题」，单人页也要题库，两处各自拉一次会有时间差
 * （发帖页面里可能选不到刚在单人页看到的新题）。这里做一次 5 分钟缓存。
 */
export const useMetaStore = defineStore('meta', {
  state: () => ({
    topics: [],
    topicsAt: 0,
    hot: null,
    hotAt: 0
  }),

  actions: {
    async ensureTopics(force) {
      const fresh = Date.now() - this.topicsAt < 5 * 60 * 1000;
      if (!force && fresh && this.topics.length) return this.topics;
      try {
        this.topics = (await debateApi.topics()) || [];
        this.topicsAt = Date.now();
      } catch (e) {
        /* 拉不到就沿用旧缓存 */
      }
      return this.topics;
    },

    async ensureHot(force) {
      const fresh = Date.now() - this.hotAt < 60 * 1000;
      if (!force && fresh && this.hot) return this.hot;
      try {
        this.hot = await baseApi.hot(12);
        this.hotAt = Date.now();
      } catch (e) {
        /* 忽略 */
      }
      return this.hot;
    }
  }
});
