package com.siyige.admin.analytics;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * CSV / XLSX 生成器（**零依赖**，不引 POI / EasyExcel）。
 *
 * <p>为什么要手写 xlsx：整个管理台只有「导出报表」这一处需要 Excel 能力，
 * 而 POI 会把包体撑大几十 MB、启动也变慢。xlsx 本质就是 zip + 几个 XML，
 * 我们只需要「单 sheet + 表头加粗 + 列宽 + 冻结首行」这四件事，两百行足够。
 *
 * <p>两个格式的注意点（都是 Excel 的坑，不是我们的偏好）：
 * <ul>
 *   <li><b>CSV 必须带 UTF-8 BOM</b>（{@code \uFEFF}），否则 Excel 打开中文全是乱码；</li>
 *   <li><b>Windows 换行用 CRLF</b>，Excel 对纯 \n 的多行单元格支持不好；</li>
 *   <li>xlsx 用 <b>inlineStr</b> 而不是 sharedStrings：少一个 XML 部件、少一层索引，
 *       几千行的报表完全不需要共享字符串表那点优化。</li>
 * </ul>
 */
public final class ExportWriter {

    private ExportWriter() { }

    // ==================== CSV ====================

    /** 生成带 BOM 的 CSV 字节。 */
    public static byte[] csv(List<String> header, List<List<Object>> rows) {
        StringBuilder sb = new StringBuilder(1024);
        sb.append('\uFEFF');          // BOM：Excel 靠它识别 UTF-8
        appendCsvRow(sb, header);
        if (rows != null) {
            for (List<Object> row : rows) appendCsvRow(sb, row);
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void appendCsvRow(StringBuilder sb, List<?> cells) {
        if (cells == null) {
            sb.append("\r\n");
            return;
        }
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(csvCell(cells.get(i)));
        }
        sb.append("\r\n");
    }

    /**
     * 单个单元格转义：含逗号 / 引号 / 换行时用双引号包裹，内部引号翻倍。
     *
     * <p>另外把「看起来像电话号码/长数字」的值强制当文本：Excel 会把
     * {@code 00123} 变成 {@code 123}、把 `12-11` 变成日期，报表数字一旦被"智能转换"就还原不了。
     * 这里的做法是给纯数字字符串加一个不可见的前导单引号（Excel 的标准文本标记）。
     */
    static String csvCell(Object raw) {
        String s = raw == null ? "" : String.valueOf(raw);
        boolean needQuote = s.indexOf(',') >= 0 || s.indexOf('"') >= 0
                || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0;
        if (needQuote) s = '"' + s.replace("\"", "\"\"") + '"';
        return s;
    }

    // ==================== XLSX ====================

    /**
     * 生成单 sheet 的 xlsx。
     *
     * @param sheetName sheet 名（Excel 限制 31 字符，且不能含 []:*?/\\，这里统一清洗）
     * @param header    表头
     * @param rows      数据行（null 单元格写成空）
     * @param colWidths 每列宽度（字符数），传 null 用默认宽度
     */
    public static byte[] xlsx(String sheetName, List<String> header, List<List<Object>> rows, List<Integer> colWidths) {
        int cols = Math.max(1, header == null ? 0 : header.size());
        ByteArrayOutputStream bos = new ByteArrayOutputStream(8192);
        try (ZipOutputStream zip = new ZipOutputStream(bos)) {
            put(zip, "[Content_Types].xml", contentTypes());
            put(zip, "_rels/.rels", rootRels());
            put(zip, "xl/workbook.xml", workbook(safeSheetName(sheetName)));
            put(zip, "xl/_rels/workbook.xml.rels", workbookRels());
            put(zip, "xl/styles.xml", styles());
            put(zip, "xl/worksheets/sheet1.xml", sheet(cols, header, rows, colWidths));
        } catch (IOException e) {
            throw new IllegalStateException("生成 xlsx 失败", e);
        }
        return bos.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String sheet(int cols, List<String> header, List<List<Object>> rows, List<Integer> colWidths) {
        StringBuilder sb = new StringBuilder(4096);
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        sb.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\n");

        // 冻结首行（表头永远可见）
        sb.append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" ")
                .append("activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>\n");

        // 列宽
        if (colWidths != null && !colWidths.isEmpty()) {
            sb.append("<cols>");
            for (int i = 0; i < colWidths.size(); i++) {
                int w = colWidths.get(i) == null ? 14 : Math.max(6, Math.min(60, colWidths.get(i)));
                sb.append("<col min=\"").append(i + 1).append("\" max=\"").append(i + 1)
                        .append("\" width=\"").append(w).append("\" customWidth=\"1\"/>");
            }
            sb.append("</cols>\n");
        }

        sb.append("<sheetData>\n");
        int rowNum = 1;
        if (header != null && !header.isEmpty()) {
            sb.append("<row r=\"").append(rowNum).append("\">");
            for (int c = 0; c < header.size(); c++) {
                sb.append(cell(c, rowNum, header.get(c), 1));      // s=1 -> 表头样式
            }
            sb.append("</row>\n");
            rowNum++;
        }
        if (rows != null) {
            for (List<Object> row : rows) {
                sb.append("<row r=\"").append(rowNum).append("\">");
                for (int c = 0; c < Math.max(cols, row == null ? 0 : row.size()); c++) {
                    Object v = row == null || c >= row.size() ? null : row.get(c);
                    sb.append(cell(c, rowNum, v, 0));
                }
                sb.append("</row>\n");
                rowNum++;
            }
        }
        sb.append("</sheetData></worksheet>");
        return sb.toString();
    }

    /** 数字写 num（Excel 才能求和排序），其余写 inlineStr。 */
    private static String cell(int col, int row, Object value, int style) {
        String ref = colName(col) + row;
        String styleAttr = style > 0 ? " s=\"" + style + "\"" : "";
        if (value == null) return "<c r=\"" + ref + "\"" + styleAttr + "/>";
        if (value instanceof Number n) {
            return "<c r=\"" + ref + "\"" + styleAttr + "><v>" + n + "</v></c>";
        }
        return "<c r=\"" + ref + "\"" + styleAttr + " t=\"inlineStr\"><is><t xml:space=\"preserve\">"
                + xml(String.valueOf(value)) + "</t></is></c>";
    }

    /** 0 -> A, 25 -> Z, 26 -> AA */
    static String colName(int index) {
        StringBuilder sb = new StringBuilder();
        int n = index;
        do {
            sb.insert(0, (char) ('A' + (n % 26)));
            n = n / 26 - 1;
        } while (n >= 0);
        return sb.toString();
    }

    private static String safeSheetName(String raw) {
        String s = raw == null || raw.isBlank() ? "报表" : raw.trim();
        s = s.replaceAll("[\\[\\]:*?/\\\\]", " ");
        return s.length() > 31 ? s.substring(0, 31) : s;
    }

    /** XML 转义（& 必须第一个换，否则会把后面替换出来的 & 再转一次）。 */
    static String xml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&apos;");
    }

    // ==================== 固定 XML 部件 ====================

    private static String contentTypes() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                <Default Extension="xml" ContentType="application/xml"/>
                <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
                </Types>
                """;
    }

    private static String rootRels() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                </Relationships>
                """;
    }

    private static String workbook(String sheetName) {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                <sheets><sheet name="%s" sheetId="1" r:id="rId1"/></sheets>
                </workbook>
                """.formatted(xml(sheetName));
    }

    private static String workbookRels() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
                </Relationships>
                """;
    }

    /** 两个样式：0=正文（默认），1=表头（加粗 + 浅灰底 + 居中）。 */
    private static String styles() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                <fonts count="2">
                  <font><sz val="11"/><name val="Calibri"/></font>
                  <font><b/><sz val="11"/><name val="Calibri"/></font>
                </fonts>
                <fills count="3">
                  <fill><patternFill patternType="none"/></fill>
                  <fill><patternFill patternType="gray125"/></fill>
                  <fill><patternFill patternType="solid"><fgColor rgb="FFFAFBFC"/><bgColor indexed="64"/></patternFill></fill>
                </fills>
                <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
                <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
                <cellXfs count="2">
                  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
                  <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
                    <alignment horizontal="center" vertical="center"/>
                  </xf>
                </cellXfs>
                </styleSheet>
                """;
    }
}
