package com.siyige.admin.words;

import com.siyige.admin.AdminContext;
import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
import com.siyige.auth.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 屏蔽词管理（W2）：列表 / 批量新增 / 粘贴导入 / 启停 / 删除 / 导出 / 汇总。
 *
 * <pre>
 *   GET    /api/admin/words?scope=&q=&page=&size=
 *   GET    /api/admin/words/summary
 *   GET    /api/admin/words/export?scope=
 *   POST   /api/admin/words              {scope, words: []}
 *   POST   /api/admin/words/import       {scope, text}
 *   POST   /api/admin/words/{id}/enable | /disable
 *   DELETE /api/admin/words/{id}
 * </pre>
 *
 * <p><b>权限 {@link Perm#CONTENT_MODERATE}</b>：审核员本来就管内容，改个屏蔽词不该去找超管；
 * VIEWER 一个写操作都进不来（列表也不行，整个类挂了注解）。
 *
 * <p><b>审计</b>：三个写操作都记 {@code sy_audit_log}（{@code target_type=WORD}、{@code source=MANUAL}、
 * {@code report_id=0}），且**不可「恢复」**（见 {@code RestoreService} 的 WORD 分支）——
 * 词表直接决定什么内容会被遮/被拒，必须留痕。
 */
@RestController
@RequestMapping("/api/admin/words")
@Require(Perm.CONTENT_MODERATE)
public class WordController {

    private final WordService words;

    public WordController(WordService words) {
        this.words = words;
    }

    /** 列表：默认全部 scope；{@code scope} 传了就只那一份。含停用词（后台要能重新启用）。 */
    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String scope,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        return words.list(scope, q, page, size);
    }

    /** 各 scope 词数 + 最近一次变更 + 社区词表是否为空（页面红条）。 */
    @GetMapping("/summary")
    public Map<String, Object> summary() {
        return words.summary();
    }

    /** 导出 txt：{@code #} 注释头 + 一行一个（只导启用的）。 */
    @GetMapping("/export")
    public ResponseEntity<String> export(@RequestParam(required = false) String scope) {
        WordScope s = WordScope.of(scope);
        String body = words.export(s);
        String filename = "words-" + s.name().toLowerCase(java.util.Locale.ROOT) + "-" + LocalDate.now() + ".txt";
        return ResponseEntity.ok()
                .contentType(new MediaType(MediaType.TEXT_PLAIN, StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(body);
    }

    /** 批量新增（最多 500 条）：{@code {scope, words: ["赌博", "色情"]}}。 */
    @PostMapping
    public Map<String, Object> add(@RequestBody(required = false) AddRequest body, HttpServletRequest http) {
        if (body == null) throw new IllegalArgumentException("INVALID_PARAM: 缺少请求体");
        return words.add(WordScope.of(body.scope()), body.words(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    /** 粘贴导入：{@code {scope, text}}，换行 / 英文逗号 / 中文逗号 / 顿号都当分隔符。 */
    @PostMapping("/import")
    public Map<String, Object> importText(@RequestBody(required = false) ImportRequest body,
                                          HttpServletRequest http) {
        if (body == null) throw new IllegalArgumentException("INVALID_PARAM: 缺少请求体");
        return words.importText(WordScope.of(body.scope()), body.text(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    @PostMapping("/{id}/enable")
    public Map<String, Object> enable(@PathVariable long id, HttpServletRequest http) {
        return words.setEnabled(id, true, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    @PostMapping("/{id}/disable")
    public Map<String, Object> disable(@PathVariable long id, HttpServletRequest http) {
        return words.setEnabled(id, false, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable long id, HttpServletRequest http) {
        return words.delete(id, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    /** 批量新增入参。 */
    public record AddRequest(String scope, List<String> words) { }

    /** 粘贴导入入参。 */
    public record ImportRequest(String scope, String text) { }
}
