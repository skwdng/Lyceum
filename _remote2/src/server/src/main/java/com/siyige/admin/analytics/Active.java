package com.siyige.admin.analytics;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记「这算一次活跃」的业务方法（设计文档 §3.1）。
 *
 * <p>口径：登录成功 / 开局 / 提交发言 / 发帖 / 评论 / 发私信 / 点赞 / 举报 ——
 * <b>浏览（PV）不算活跃</b>，轮询、心跳、未读数、SSE 连接也不算。
 *
 * <p>怎么用：只给 Service 的**对外入口方法**加注解，方法体一个字不改。
 * 切面在返回后读 {@code UserContext}，落进 Redis 的 {@code act:dau:{yyyyMMdd}}（HyperLogLog）。
 * HLL 天然去重，所以同一个人一天触发多次、甚至一个入口链路上被织入两次都不会虚高。
 *
 * <p>不加在 Controller 上：Controller 里没有事务/领域语义，且同一个动作可能有 HTTP 与 WS 两个入口，
 * 打在 Service 上才能两个入口都覆盖到。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Active {
}
