package com.siyige.admin;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 辩题审核接口（管理端）。
 *
 * <pre>
 *   GET  /api/admin/topics?modStatus=&source=&q=&page=&size=   题库列表（**含被驳回的**）
 *   POST /api/admin/topics/{id}/approve                        通过 -> mod_status=PASS
 *   POST /api/admin/topics/{id}/reject   {reason}              驳回 -> REJECT（理由必填）
 *   POST /api/admin/topics/{id}/offline  {reason}              下架 -> REJECT（已上架的题事后撤下）
 * </pre>
 *
 * <p>列表**不过滤 REJECT**（管理端要能看到被驳回/下架的题才能改判）；
 * 前台题库 `Store.topics()` 才过滤。两边各用各的 SQL。
 */
@RestController
@RequestMapping("/api/admin/topics")
public class AdminTopicController {

    private final AdminTopicService service;

    public AdminTopicController(AdminTopicService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String modStatus,
                                    @RequestParam(required = false) String source,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        return service.topics(modStatus, source, q, page, size);
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<Void> approve(@PathVariable String id) {
        service.approve(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Void> reject(@PathVariable String id,
                                       @RequestBody(required = false) AdminDtos.TopicReasonRequest req) {
        service.reject(id, req == null ? null : req.reason());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/offline")
    public ResponseEntity<Void> offline(@PathVariable String id,
                                        @RequestBody(required = false) AdminDtos.TopicReasonRequest req) {
        service.offline(id, req == null ? null : req.reason());
        return ResponseEntity.noContent().build();
    }
}
