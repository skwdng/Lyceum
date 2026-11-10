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
    hotAt: 0,
    /** AI 档位：{ basic, pro, byok } 各含 key/label/available/model/note */
    aiTiers: null,
    aiTiersAt: 0
  }),

  getters: {
    /** 可选的档位（基础版没启用时后端 available=false，这里直接过滤掉，不给用户看见） */
    availableTiers(state) {
      const d = state.aiTiers || {};
      return ['basic', 'pro', 'byok']
        .map((k) => d[k])
        .filter((x) => x && x.available !== false);
    }
  },

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
    },

    /**
     * AI 档位（基础版 / 高级版 / 自带 Key）。
     *
     * 缓存 5 分钟：开局面板每次打开都拉一次没必要，而且档位是「部署环境有什么」的静态信息。
     * 拉不到时返回 null，调用方退化到「只显示高级版」。
     */
    async ensureAiTiers(force) {
      const fresh = Date.now() - this.aiTiersAt < 5 * 60 * 1000;
      if (!force && fresh && this.aiTiers) return this.aiTiers;
      try {
        this.aiTiers = await debateApi.aiTiers();
        this.aiTiersAt = Date.now();
      } catch (e) {
        /* 保留旧缓存 */
      }
      return this.aiTiers;
    },

    resetAiTiers() {
      this.aiTiers = null;
      this.aiTiersAt = 0;
    }
  }
});
