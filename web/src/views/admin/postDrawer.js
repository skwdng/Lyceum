/**
 * 帖子详情抽屉的**全局单例状态**（与 `userPop.js` 一个思路）。
 *
 * 为什么要全局：抽屉本身放在 `AdminLayout` 里渲染一次，然后**任何显示帖子标题或评论内容的地方**
 * 点一下就能打开它 —— 帖子管理的标题、评论管理的评论/所在帖子、用户浮窗里的"被处置的内容"、
 * 处理记录的对象列、举报处理的目标摘要。每处各放一份组件的话，迟早漏一处。
 *
 * `open(postId, commentId)`：传了 commentId 就滚动到那一层并高亮 2 秒（评论定位）。
 * `onChanged`：抽屉里屏蔽/解除/禁言之后，当前页面要刷新。
 */
import { reactive } from 'vue';

const state = reactive({
  open: false,
  postId: null,
  /** 需要定位并高亮的评论 id（楼或楼中楼都可以）；null = 只开抽屉不定位 */
  commentId: null,
  /** 每次 open 都 +1，抽屉据此重新加载（同一个帖子连点两次也能刷新） */
  seq: 0
});

const listeners = new Set();

export const postDrawer = {
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
        console.warn('postDrawer onChanged 回调失败', e);
      }
    });
  },

  onChanged(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
