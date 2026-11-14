import { T as reactive } from "./index-7_1-pJLb.js";
const state = reactive({
  open: false,
  postId: null,
  /** 需要定位并高亮的评论 id（楼或楼中楼都可以）；null = 只开抽屉不定位 */
  commentId: null,
  /** 每次 open 都 +1，抽屉据此重新加载（同一个帖子连点两次也能刷新） */
  seq: 0
});
const listeners = /* @__PURE__ */ new Set();
const postDrawer = {
  state,
  open(postId, commentId = null) {
    if (!postId) return;
    state.postId = Number(postId);
    state.commentId = commentId == null ? null : Number(commentId);
    state.seq += 1;
    state.open = true;
  },
  close() {
    state.open = false;
  },
  fireChanged() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn("postDrawer onChanged 回调失败", e);
      }
    });
  },
  onChanged(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
export {
  postDrawer as p
};
