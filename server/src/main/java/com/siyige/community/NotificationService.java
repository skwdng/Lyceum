package com.siyige.community;

import com.siyige.auth.UserNames;
import com.siyige.community.ai.AiAccount;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 社区通知服务：谁该收到什么、文案怎么拼、未读怎么算。
 *
 * <h3>三条铁律</h3>
 * <ol>
 *   <li><b>自己操作自己不发</b>：收件人与操作人相同一律 return（决策 5）。</li>
 *   <li><b>通知失败不许影响主流程</b>：每个触发点整段 try/catch，
 *       发评论/点赞不会因为通知挂了而回滚。</li>
 *   <li><b>角标只信 Redis</b>：不回源查库（决策 G）。</li>
 * </ol>
 *
 * <h3>点赞聚合（决策 6/7/8）</h3>
 * <pre>
 * 行不存在        → insert + HINCRBY 1
 * 行存在且已读    → update(人数/actor/时间, is_read=0) + HINCRBY 1
 * 行存在且未读    → update(人数/actor/时间)            ，不 +1
 * 取消点赞        → 从点赞表重算人数；降 0 删行；不碰计数/is_read/created_at
 * </pre>
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    /** excerpt 列是 varchar(120)，留 2 个字符给省略号。 */
    private static final int EXCERPT_MAX = 120;
    /** note 列是 varchar(200)。 */
    private static final int NOTE_MAX = 200;
    private static final int PAGE_SIZE_MAX = 50;
    private static final int SUGGEST_MAX = 10;
    /** 一次最多 @ 10 个（决策 3）。 */
    private static final int MAX_MENTIONS = 10;

    /**
     * 这些 type 的 link 要精确到楼层（带 commentId）。
     *
     * <p>MENTION 也在内：评论里 @ 的跳到那一楼；发帖里 @ 的 {@code target_id} 为 null，
     * 于是 commentId 自然为 null（只到帖子）。
     */
    private static final Set<String> COMMENT_LEVEL = Set.of(
            "REPLY_COMMENT", "LIKE_COMMENT", "COMMENT_DELETED", "MENTION");

    /** AI 在帖子下回复时的内部标记（写进 note，仅用于选文案；列表 item 不返回 note）。 */
    static final String POST_REPLY_MARK = "POST";

    private final NotificationRepo repo;
    private final UnreadCounter counter;
    private final UserNames userNames;

    public NotificationService(NotificationRepo repo, UnreadCounter counter, UserNames userNames) {
        this.repo = repo;
        this.counter = counter;
        this.userNames = userNames;
    }

    // ==================== 触发：评论 / 回复 ====================

    /**
     * 有人发了评论（或回复）。
     *
     * @param replyToUserId 被回复那条评论的作者；不是回复就传 null
     */
    public void onComment(long postId, String actorId, long commentId, String replyToUserId) {
        try {
            Map<String, Object> post = repo.postBrief(postId);
            if (post == null) return;
            String postAuthor = str(post.get("author_id"));
            String actorName = userNames.name(actorId);

            // ① 评论了我的帖子
            if (!same(postAuthor, actorId)) {
                long id = repo.insert(postAuthor, "COMMENT_POST", actorId, actorName,
                        commentId, postId, cut(str(post.get("title"))), null);
                counter.incr(postAuthor);
                log.info("通知 COMMENT_POST id={} to={}", id, postAuthor);
            }

            // ② 回复了我的评论（同一个人可能既被评论又被回复，那是两条，符合直觉）
            if (replyToUserId != null && !same(replyToUserId, actorId)) {
                Map<String, Object> c = repo.commentBrief(commentId);
                String excerpt = c == null ? null : cut(str(c.get("body")));
                long id = repo.insert(replyToUserId, "REPLY_COMMENT", actorId, actorName,
                        commentId, postId, excerpt, null);
                counter.incr(replyToUserId);
                log.info("通知 REPLY_COMMENT id={} to={}", id, replyToUserId);
            }
        } catch (RuntimeException e) {
            log.warn("发评论通知失败（不影响评论本身）postId={} actor={} 原因={}", postId, actorId, e.toString());
        }
    }

    // ==================== 触发：@ 提及（V2） ====================

    /**
     * 正文里 @ 了人：给每个**校验通过**的人发一条 MENTION。
     *
     * <p><b>反向校验</b>（决策 1/3，宁可少发不可错发）：
     * <ol>
     *   <li>只认 userId，**不按昵称猜人**</li>
     *   <li>id 必须存在于真实账号（{@code sy_user.account} 非空）</li>
     *   <li>该 id 的昵称必须真的以 {@code @昵称} 形式出现在正文里（否则是伪造/过期数据）</li>
     *   <li>去重、最多 10 个（超出的直接丢）、自己 @ 自己不发</li>
     * </ol>
     * 不满足的一律**静默丢弃**，不报错——用户不该因为多选了个人就被拦下。
     *
     * @param commentId 评论/回复时是评论 id；发帖时传 null（link 就只到帖子）
     */
    public void onMentions(long postId, Long commentId, String actorId, Object rawMentions, String text) {
        try {
            List<String> ids = validMentionIds(rawMentions, text, actorId);
            if (ids.isEmpty()) return;

            String actorName = userNames.name(actorId);
            String excerpt = cut(text);
            for (String uid : ids) {
                // AI 账号不登录、永远看不到通知：@DeepSeek 时不该给它攒一条永未读的 MENTION
                if (AiAccount.ID.equals(uid)) continue;
                long id = repo.insert(uid, "MENTION", actorId, actorName, commentId, postId, excerpt, null);
                counter.incr(uid);
                log.info("通知 MENTION id={} to={} postId={} commentId={}", id, uid, postId, commentId);
            }
        } catch (RuntimeException e) {
            log.warn("发 @ 通知失败（不影响内容本身）postId={} actor={} 原因={}", postId, actorId, e.toString());
        }
    }

    /** @ 的反向校验：返回**最终该通知谁**（保持入参顺序，最多 10 个）。 */
    List<String> validMentionIds(Object rawMentions, String text, String actorId) {
        if (!(rawMentions instanceof Collection<?> list) || list.isEmpty()) return List.of();
        String body = text == null ? "" : text;

        // ① 规整 + 去重（保持顺序）
        Set<String> seen = new LinkedHashSet<>();
        for (Object o : list) {
            if (o == null) continue;
            String id = String.valueOf(o).trim();
            if (id.isEmpty() || id.length() > 32) continue;
            seen.add(id);
        }
        if (seen.isEmpty()) return List.of();

        // ② 必须是真实账号
        Map<String, String> names = repo.namesByIds(seen);
        if (names.isEmpty()) return List.of();

        // ③ 昵称必须真的以 @昵称 出现在正文里；自己 @ 自己跳过；精确截到 10 个
        List<String> out = new ArrayList<>(MAX_MENTIONS);
        for (String id : seen) {
            if (out.size() >= MAX_MENTIONS) break;
            if (same(id, actorId)) continue;
            String name = names.get(id);
            if (name == null || name.isBlank()) continue;
            if (!body.contains("@" + name)) continue;
            out.add(id);
        }
        return out;
    }

    // ==================== 触发：AI 回复（V1 新增） ====================

    /**
     * AI 回复了某人：**只发一条** {@code REPLY_COMMENT}（决策 4）。
     *
     * <p>为什么不复用 {@link #onComment}：那条路径会同时发「COMMENT_POST 给帖子作者」+
     * 「REPLY_COMMENT 给被回复者」，AI 回复场景下会变成两条通知。
     *
     * <p>actor 记 AI 账号（id / 昵称），前端就能显示成「DeepSeek 回复了你的评论：…」。
     */
    public void onAiReply(long postId, long aiCommentId, String askerId) {
        onAiReply(postId, aiCommentId, askerId, false);
    }

    /**
     * @param toPost true = AI 是在**帖子**（发帖时 @）里回的，文案用「回复了你的帖子」
     */
    public void onAiReply(long postId, long aiCommentId, String askerId, boolean toPost) {
        if (askerId == null || askerId.isBlank()) return;
        try {
            Map<String, Object> post = repo.postBrief(postId);
            if (post == null) return;
            Map<String, Object> c = repo.commentBrief(aiCommentId);
            String excerpt = cut(c == null ? null : str(c.get("body")), 60);
            // note 只做内部标记（item 不返回 note）：text() 据此区分「回复了你的帖子 / 评论」
            long id = repo.insert(askerId, "REPLY_COMMENT", AiAccount.ID, AiAccount.NAME,
                    aiCommentId, postId, excerpt, toPost ? POST_REPLY_MARK : null);
            counter.incr(askerId);
            log.info("通知 REPLY_COMMENT(AI) id={} to={} aiCommentId={}", id, askerId, aiCommentId);
        } catch (RuntimeException e) {
            log.warn("发 AI 回复通知失败（不影响回复本身）postId={} 原因={}", postId, e.toString());
        }
    }

    // ==================== 触发：管理员操作（V3） ====================

    /**
     * 管理员删了内容：通知**内容作者**（决策 5：作者自己删自己的不发；管理员删要发，并带理由）。
     *
     * @param targetType POST | COMMENT
     * @param note       管理员填的处理理由（可空），会拼进文案
     */
    public void onContentDeleted(String targetType, long targetId, String authorId, String note) {
        if (authorId == null || authorId.isBlank()) return;      // 取不到作者就不发
        try {
            String safeNote = cut(note, NOTE_MAX);
            if (NotificationRepo.TARGET_POST.equals(targetType)) {
                Map<String, Object> post = repo.postBrief(targetId);
                String title = cut(post == null ? null : str(post.get("title")));
                long id = repo.insert(authorId, "POST_DELETED", null, null, targetId, targetId, title, safeNote);
                counter.incr(authorId);
                log.info("通知 POST_DELETED id={} to={} postId={}", id, authorId, targetId);
            } else {
                Map<String, Object> c = repo.commentBrief(targetId);
                String excerpt = cut(c == null ? null : str(c.get("body")));
                long postId = c == null ? 0L : CommunityService.num(c.get("post_id"));
                long id = repo.insert(authorId, "COMMENT_DELETED", null, null, targetId,
                        postId > 0 ? postId : null, excerpt, safeNote);
                counter.incr(authorId);
                log.info("通知 COMMENT_DELETED id={} to={} commentId={}", id, authorId, targetId);
            }
        } catch (RuntimeException e) {
            log.warn("发删除通知失败（不影响删除本身）target={}:{} 原因={}", targetType, targetId, e.toString());
        }
    }

    /** 社区禁言：带到期时间与理由。 */
    public void onMuted(String userId, long adminId, String untilText, String reason) {
        try {
            String note = cut(composeNote(untilText, reason), NOTE_MAX);
            long id = repo.insert(userId, "MUTED", String.valueOf(adminId), null, null, null, null, note);
            counter.incr(userId);
            log.info("通知 MUTED id={} to={} until={}", id, userId, untilText);
        } catch (RuntimeException e) {
            log.warn("发禁言通知失败 userId={} 原因={}", userId, e.toString());
        }
    }

    /** 解除社区禁言。 */
    public void onUnmuted(String userId, long adminId) {
        sendAdminNotice(userId, adminId, "UNMUTED");
    }

    /** 全站封禁（带理由）。 */
    public void onBanned(String userId, long adminId, String reason) {
        try {
            long id = repo.insert(userId, "BANNED", String.valueOf(adminId), null, null, null, null,
                    cut(reason, NOTE_MAX));
            counter.incr(userId);
            log.info("通知 BANNED id={} to={}", id, userId);
        } catch (RuntimeException e) {
            log.warn("发封禁通知失败 userId={} 原因={}", userId, e.toString());
        }
    }

    /** 解除全站封禁。 */
    public void onUnbanned(String userId, long adminId) {
        sendAdminNotice(userId, adminId, "UNBANNED");
    }

    private void sendAdminNotice(String userId, long adminId, String type) {
        try {
            long id = repo.insert(userId, type, String.valueOf(adminId), null, null, null, null, null);
            counter.incr(userId);
            log.info("通知 {} id={} to={}", type, id, userId);
        } catch (RuntimeException e) {
            log.warn("发 {} 通知失败 userId={} 原因={}", type, userId, e.toString());
        }
    }

    /** 禁言通知的 note：「至 2026-11-11 22:00，理由：刷屏」。 */
    static String composeNote(String untilText, String reason) {
        StringBuilder sb = new StringBuilder();
        if (untilText != null && !untilText.isBlank()) sb.append("至 ").append(untilText.trim());
        if (reason != null && !reason.isBlank()) {
            if (sb.length() > 0) sb.append("，");
            sb.append("理由：").append(reason.trim());
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    // ==================== 触发：点赞 / 取消点赞 ====================

    /** 点赞：按「收件人 + 被赞对象」聚合成一行。 */
    public void onLike(String targetType, long targetId, String actorId) {
        try {
            Target t = resolveTarget(targetType, targetId);
            if (t == null || same(t.ownerId(), actorId)) return;   // 自己赞自己不发

            String aggKey = aggKey(targetType, targetId);
            int total = (int) Math.max(1L, repo.countLikes(targetType, targetId));
            String actorName = userNames.name(actorId);

            Map<String, Object> agg = repo.findAgg(t.ownerId(), aggKey);
            if (agg == null) {
                long id = repo.insertAgg(t.ownerId(), "LIKE_" + targetType, aggKey, total,
                        actorId, actorName, targetId, t.postId(), t.excerpt());
                counter.incr(t.ownerId());
                log.info("通知 LIKE_{} 首次 id={} to={} count={}", targetType, id, t.ownerId(), total);
            } else {
                boolean wasRead = CommunityService.num(agg.get("is_read")) == 1;
                repo.updateAgg(CommunityService.num(agg.get("id")), total, actorId, actorName);
                if (wasRead) counter.incr(t.ownerId());            // 已读 -> 重新未读，红点再亮（决策 A）
                log.info("通知 LIKE_{} 聚合 id={} to={} count={} wasRead={}",
                        targetType, agg.get("id"), t.ownerId(), total, wasRead);
            }
        } catch (RuntimeException e) {
            log.warn("发点赞通知失败（不影响点赞本身）target={}:{} actor={} 原因={}",
                    targetType, targetId, actorId, e.toString());
        }
    }

    /**
     * 取消点赞：**只**重算人数。
     *
     * <p>不 +1 也不 -1 计数，不动 is_read / created_at（决策 8 / E）：
     * 人数变少不该把红点亮起来，也不该把这行顶到最前。
     */
    public void onUnlike(String targetType, long targetId, String actorId) {
        try {
            Target t = resolveTarget(targetType, targetId);
            if (t == null) return;
            Map<String, Object> agg = repo.findAgg(t.ownerId(), aggKey(targetType, targetId));
            if (agg == null) return;

            long id = CommunityService.num(agg.get("id"));
            int total = (int) repo.countLikes(targetType, targetId);   // 从点赞表重算，不做增减量
            if (total <= 0) {
                repo.delete(id);
                log.info("通知 LIKE_{} 人数归零，删除聚合行 id={}", targetType, id);
            } else {
                repo.updateAggCount(id, total);
                log.info("通知 LIKE_{} 重算人数 id={} count={}", targetType, id, total);
            }
        } catch (RuntimeException e) {
            log.warn("取消点赞重算通知失败 target={}:{} 原因={}", targetType, targetId, e.toString());
        }
    }

    // ==================== 查询 ====================

    /**
     * 通知列表：**只把本页未读标已读**，Redis 计数按本页实际标记条数递减，返回**标记前**的状态。
     */
    public Map<String, Object> list(String userId, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(1, size), PAGE_SIZE_MAX);
        int offset = (p - 1) * s;

        List<Map<String, Object>> rows = repo.listPage(userId, offset, s);
        long total = repo.count(userId);

        // ① 先记下"标记前"的未读 id
        List<Long> unreadIds = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (CommunityService.num(r.get("is_read")) == 0) unreadIds.add(CommunityService.num(r.get("id")));
        }
        // ② 只标本页
        int marked = repo.markRead(userId, unreadIds);
        // ③ 计数按实际标记条数递减（≤0 由 Lua / 内存实现负责删 field）
        if (marked > 0) counter.decrement(userId, marked);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) items.add(toItem(r));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    /** 角标：只读 Redis（没有该 field 就是 0）。 */
    public int unreadCount(String userId) {
        return (int) Math.max(0L, counter.get(userId));
    }

    /** @ 候选：昵称前缀匹配，≤10 条。 */
    public List<Map<String, Object>> suggestUsers(String q) {
        String prefix = q == null ? "" : q.trim();
        if (prefix.isEmpty()) return List.of();
        List<Map<String, Object>> rows = repo.searchUsers(prefix, SUGGEST_MAX);
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> u = new LinkedHashMap<>();
            u.put("id", String.valueOf(r.get("id")));
            u.put("name", String.valueOf(r.get("name")));
            out.add(u);
        }
        return out;
    }

    // ==================== 行 -> 接口形状 ====================

    private Map<String, Object> toItem(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", CommunityService.num(row.get("id")));
        out.put("type", str(row.get("type")));
        out.put("text", text(row));
        out.put("aggCount", CommunityService.num(row.get("agg_count")));
        out.put("read", CommunityService.num(row.get("is_read")) == 1);   // 标记前状态
        out.put("link", link(row));
        out.put("createdAt", CommunityService.millis(row.get("created_at")));
        return out;
    }

    /** 文案全部由后端拼好，前端不判断 type、不自己拼「等 N 人」（决策 6 / 方案 §7）。 */
    private String text(Map<String, Object> row) {
        String type = str(row.get("type"));
        String actor = orDefault(str(row.get("actor_name")), "有人");
        String excerpt = orDefault(str(row.get("excerpt")), "");
        String note = str(row.get("note"));
        long agg = Math.max(1L, CommunityService.num(row.get("agg_count")));

        return switch (type) {
            case "COMMENT_POST" -> actor + " 评论了你的帖子《" + excerpt + "》";
            case "REPLY_COMMENT" -> POST_REPLY_MARK.equals(note)
                    ? actor + " 回复了你的帖子：" + excerpt
                    : actor + " 回复了你的评论：" + excerpt;
            case "LIKE_POST" -> agg > 1
                    ? actor + " 等 " + agg + " 人赞了你的帖子《" + excerpt + "》"
                    : actor + " 赞了你的帖子《" + excerpt + "》";
            case "LIKE_COMMENT" -> agg > 1
                    ? actor + " 等 " + agg + " 人赞了你的评论「" + excerpt + "」"
                    : actor + " 赞了你的评论「" + excerpt + "」";
            case "MENTION" -> CommunityService.num(row.get("target_id")) > 0
                    ? actor + " 在评论里 @ 了你：" + excerpt
                    : actor + " 在帖子里 @ 了你：" + excerpt;
            case "POST_DELETED" -> "你的帖子《" + excerpt + "》被管理员删除" + reason(note);
            case "COMMENT_DELETED" -> "你的评论「" + excerpt + "」被管理员删除" + reason(note);
            case "MUTED" -> "你被社区禁言" + (note == null || note.isBlank() ? "" : "：" + note);
            case "UNMUTED" -> "你的社区禁言已被解除" + (note == null || note.isBlank() ? "" : "（" + note + "）");
            case "BANNED" -> "你的账号被全站封禁" + reason(note);
            case "UNBANNED" -> "你的账号已解封";
            default -> actor + " 与你互动了";
        };
    }

    private Map<String, Object> link(Map<String, Object> row) {
        String type = str(row.get("type"));
        long postId = CommunityService.num(row.get("post_id"));
        long targetId = CommunityService.num(row.get("target_id"));

        Map<String, Object> link = new LinkedHashMap<>();
        if (postId <= 0) {
            // 禁言 / 封禁这类与内容无关的，点进去看「我的」
            link.put("view", "me");
            link.put("postId", null);
            link.put("commentId", null);
            return link;
        }
        link.put("view", "community");
        link.put("postId", postId);
        link.put("commentId", COMMENT_LEVEL.contains(type) && targetId > 0 ? targetId : null);
        return link;
    }

    // ==================== 内部 ====================

    /** 被赞对象：谁是内容作者、跳转用哪个帖子、摘要是什么。 */
    private Target resolveTarget(String targetType, long targetId) {
        if (NotificationRepo.TARGET_POST.equals(targetType)) {
            Map<String, Object> post = repo.postBrief(targetId);
            if (post == null) return null;
            return new Target(str(post.get("author_id")), targetId, cut(str(post.get("title"))));
        }
        if (NotificationRepo.TARGET_COMMENT.equals(targetType)) {
            Map<String, Object> c = repo.commentBrief(targetId);
            if (c == null) return null;
            long postId = CommunityService.num(c.get("post_id"));
            return new Target(str(c.get("user_id")), postId, cut(str(c.get("body"))));
        }
        return null;
    }

    private record Target(String ownerId, long postId, String excerpt) {}

    private static String aggKey(String targetType, long targetId) {
        return "LIKE_" + targetType + ":" + targetId;
    }

    private static String reason(String note) {
        return note == null || note.isBlank() ? "" : "，理由：" + note;
    }

    private String name(String userId) {
        try {
            return userNames.name(userId);
        } catch (RuntimeException e) {
            return userId;                       // 昵称查不到不影响发通知
        }
    }

    private static boolean same(String a, String b) {
        return a != null && a.equals(b);
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static String orDefault(String v, String def) {
        return v == null || v.isBlank() ? def : v;
    }

    /** 按码点截断（不能用 substring，中文/emoji 会被切坏）。 */
    private static String cut(String s) {
        return cut(s, EXCERPT_MAX);
    }

    private static String cut(String s, int maxCodePoints) {
        if (s == null) return null;
        String flat = s.replaceAll("\\s+", " ").trim();
        if (flat.isEmpty()) return null;
        if (flat.codePointCount(0, flat.length()) <= maxCodePoints) return flat;
        int end = flat.offsetByCodePoints(0, maxCodePoints - 1);
        return flat.substring(0, end) + "…";
    }
}
