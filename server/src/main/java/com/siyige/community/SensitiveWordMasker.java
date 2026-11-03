package com.siyige.community;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 敏感词打码器（SPEC-v4.2 R-COM-39 改版：命中后用全角＊逐码点替换后落库，不保存原文）。
 *
 * <p>实现要点：
 * <ul>
 *   <li>前缀树（Trie）匹配，索引粒度是 <b>Unicode 码点</b>，不是 char；</li>
 *   <li>从每个码点位置起沿 Trie 扫描，遇到 end 节点记录 [start, end) 区间，并继续扫描以支持长词；</li>
 *   <li>所有区间按 start 排序后合并（重叠或相邻都合并），每个区间内的每个原始码点替换成一个
 *       全角＊（U+FF0A），避免破坏 Markdown 的 * / ** 语法；</li>
 *   <li>不改动原文长度以外的东西：不删空白、不做大小写/全半角归一化，否则区间会错位。</li>
 * </ul>
 *
 * <p><b>已知限制（第一版明确不做）</b>：只做原文精确匹配。用空格、标点、同音字、繁体、拼音、
 * 零宽字符等绕过手段不在本版处理范围内；需要时再在匹配前做归一化，并同步调整区间映射。
 *
 * <p>词表来源（按优先级）：
 * <ol>
 *   <li>{@code server/config/community-sensitive-words.txt}（外部文件，可改后重启生效）</li>
 *   <li>{@code config/community-sensitive-words.txt}（工作目录是 server/ 时）</li>
 *   <li>classpath 下的 {@code community-sensitive-words.txt}（兜底）</li>
 * </ol>
 * 三者都不存在时构造失败 -> 应用启动失败，不允许静默关闭审核。
 */
@Component
public class SensitiveWordMasker {

    private static final Logger log = LoggerFactory.getLogger(SensitiveWordMasker.class);

    /** 全角星号 U+FF0A；不用半角 *，否则会把 Markdown 的斜体/粗体语法弄坏。 */
    public static final char MASK_CHAR = '\uFF0A';

    private static final String[] EXTERNAL_PATHS = {
            "server/config/community-sensitive-words.txt",
            "config/community-sensitive-words.txt"
    };
    private static final String CLASSPATH_FILE = "community-sensitive-words.txt";

    private static final class Node {
        private final Map<Integer, Node> next = new ConcurrentHashMap<>();
        private boolean end;
    }

    /** 打码结果。 */
    public record MaskResult(String text, int hits, boolean changed) {
    }

    private final Node root = new Node();
    private final int wordCount;
    private final String source;

    /** Spring 用：从外部文件（优先）或 classpath 加载词表。 */
    public SensitiveWordMasker() {
        Loaded loaded = loadDefault();
        this.source = loaded.source();
        this.wordCount = build(loaded.words());
    }

    /** 单测用：直接传入词表。 */
    public SensitiveWordMasker(Collection<String> words) {
        this.source = "explicit";
        this.wordCount = build(words);
    }

    public int wordCount() {
        return wordCount;
    }

    public String source() {
        return source;
    }

    /**
     * 把 text 中命中的敏感词逐码点替换为全角＊。
     *
     * @return 替换后的文本、合并后的命中区间数、是否发生变化
     */
    public MaskResult mask(String text) {
        if (text == null || text.isEmpty() || wordCount == 0) {
            return new MaskResult(text == null ? "" : text, 0, false);
        }

        int[] cps = text.codePoints().toArray();
        List<int[]> spans = new ArrayList<>();

        for (int i = 0; i < cps.length; i++) {
            Node node = root;
            for (int j = i; j < cps.length; j++) {
                node = node.next.get(cps[j]);
                if (node == null) break;
                if (node.end) {
                    spans.add(new int[]{i, j + 1});
                    // 不 break：继续走，支持「加微信」里再包含更长词的情况
                }
            }
        }
        if (spans.isEmpty()) return new MaskResult(text, 0, false);

        spans.sort(Comparator.comparingInt((int[] s) -> s[0]).thenComparingInt(s -> s[1]));
        List<int[]> merged = new ArrayList<>();
        for (int[] span : spans) {
            if (!merged.isEmpty() && span[0] <= merged.get(merged.size() - 1)[1]) {
                int[] last = merged.get(merged.size() - 1);
                last[1] = Math.max(last[1], span[1]);
            } else {
                merged.add(new int[]{span[0], span[1]});
            }
        }

        StringBuilder sb = new StringBuilder(cps.length);
        int idx = 0;
        for (int[] span : merged) {
            while (idx < span[0]) sb.appendCodePoint(cps[idx++]);
            while (idx < span[1]) {
                sb.append(MASK_CHAR);
                idx++;
            }
        }
        while (idx < cps.length) sb.appendCodePoint(cps[idx++]);

        String masked = sb.toString();
        return new MaskResult(masked, merged.size(), !masked.equals(text));
    }

    // ---------------- 词表加载 ----------------

    private record Loaded(List<String> words, String source) {
    }

    private int build(Collection<String> words) {
        if (words == null) return 0;
        int count = 0;
        for (String w : words) {
            if (w == null) continue;
            String word = w.strip();
            if (word.isEmpty()) continue;
            int[] cps = word.codePoints().toArray();
            Node node = root;
            for (int cp : cps) node = node.next.computeIfAbsent(cp, k -> new Node());
            if (!node.end) {
                node.end = true;
                count++;
            }
        }
        return count;
    }

    private static Loaded loadDefault() {
        for (String candidate : EXTERNAL_PATHS) {
            Path path = Paths.get(candidate);
            if (Files.isRegularFile(path)) {
                try {
                    List<String> words = parse(Files.readString(path, StandardCharsets.UTF_8));
                    log.info("敏感词表来源: 外部文件 {}，词条数={}", path.toAbsolutePath(), words.size());
                    return new Loaded(words, path.toAbsolutePath().toString());
                } catch (IOException e) {
                    throw new IllegalStateException("敏感词表读取失败: " + path.toAbsolutePath(), e);
                }
            }
        }

        InputStream in = SensitiveWordMasker.class.getClassLoader().getResourceAsStream(CLASSPATH_FILE);
        if (in == null) {
            throw new IllegalStateException("敏感词表缺失：外部 " + String.join(" / ", EXTERNAL_PATHS)
                    + " 与 classpath:" + CLASSPATH_FILE + " 都不存在，拒绝启动（内容审核不允许静默关闭）");
        }
        try (InputStream stream = in) {
            List<String> words = parse(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
            log.info("敏感词表来源: classpath:{}，词条数={}", CLASSPATH_FILE, words.size());
            return new Loaded(words, "classpath:" + CLASSPATH_FILE);
        } catch (IOException e) {
            throw new IllegalStateException("敏感词表读取失败: classpath:" + CLASSPATH_FILE, e);
        }
    }

    /** 逐行解析：strip、去空行、# 注释、去重（保持顺序）。 */
    static List<String> parse(String content) {
        Set<String> words = new LinkedHashSet<>();
        if (content == null) return new ArrayList<>(words);
        String text = content.startsWith("\uFEFF") ? content.substring(1) : content;
        for (String line : text.split("\\R")) {
            String w = line.strip();
            if (w.isEmpty() || w.startsWith("#")) continue;
            words.add(w);
        }
        return new ArrayList<>(words);
    }
}
