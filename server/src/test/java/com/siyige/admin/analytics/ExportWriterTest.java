package com.siyige.admin.analytics;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 导出生成器：CSV 的 BOM/转义、XLSX 的 zip 结构与单元格类型。
 *
 * <p>这两处都是「看起来对、用 Excel 打开才发现错」的典型，所以逐字节验。
 */
class ExportWriterTest {

    // ==================== CSV ====================

    @Test
    void CSV带UTF8_BOM且用CRLF换行() {
        byte[] bytes = ExportWriter.csv(List.of("模块", "PV"), List.of(List.of("社区", 12)));
        assertEquals((byte) 0xEF, bytes[0]);
        assertEquals((byte) 0xBB, bytes[1]);
        assertEquals((byte) 0xBF, bytes[2]);

        String text = new String(bytes, StandardCharsets.UTF_8);
        assertTrue(text.startsWith("\uFEFF模块,PV"));
        assertTrue(text.contains("\r\n"));
        assertTrue(text.endsWith("社区,12\r\n"));
    }

    @Test
    void CSV转义逗号引号与换行() {
        assertEquals("\"a,b\"", ExportWriter.csvCell("a,b"));
        assertEquals("\"say \"\"hi\"\"\"", ExportWriter.csvCell("say \"hi\""));
        assertEquals("\"l1\nl2\"", ExportWriter.csvCell("l1\nl2"));
        assertEquals("plain", ExportWriter.csvCell("plain"));
        assertEquals("", ExportWriter.csvCell(null));
        assertEquals("12", ExportWriter.csvCell(12));
    }

    // ==================== XLSX ====================

    private static Map<String, String> unzip(byte[] xlsx) throws Exception {
        Map<String, String> out = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(xlsx))) {
            ZipEntry e;
            while ((e = zip.getNextEntry()) != null) {
                out.put(e.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return out;
    }

    @Test
    void XLSX是可解压的zip且部件齐全() throws Exception {
        byte[] bytes = ExportWriter.xlsx("模块浏览", List.of("模块", "PV"), List.of(List.of("社区", 12)), List.of(14, 10));
        assertEquals('P', bytes[0]);
        assertEquals('K', bytes[1]);

        Map<String, String> parts = unzip(bytes);
        for (String name : new String[]{"[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
                "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"}) {
            assertTrue(parts.containsKey(name), "缺少部件 " + name);
        }
        assertTrue(parts.get("xl/workbook.xml").contains("模块浏览"));
        assertTrue(parts.get("[Content_Types].xml").contains("spreadsheetml.sheet.main+xml"));
    }

    @Test
    void XLSX数字写num_文本写inlineStr_表头带样式与冻结() throws Exception {
        byte[] bytes = ExportWriter.xlsx("概览", List.of("指标", "值"),
                List.of(List.of("社区", 12), List.of("聊天", 3.5)), List.of(16, 10));
        String sheet = unzip(bytes).get("xl/worksheets/sheet1.xml");
        assertNotNull(sheet);

        // 表头：样式 1 + inlineStr
        assertTrue(sheet.contains("<c r=\"A1\" s=\"1\" t=\"inlineStr\"><is><t xml:space=\"preserve\">指标</t></is></c>"));
        // 文本单元格
        assertTrue(sheet.contains(">社区<"));
        // 数字：走 <v>，Excel 里能求和
        assertTrue(sheet.contains("<c r=\"B2\"><v>12</v></c>"));
        assertTrue(sheet.contains("<c r=\"B3\"><v>3.5</v></c>"));
        // 冻结首行
        assertTrue(sheet.contains("state=\"frozen\""));
        // 列宽
        assertTrue(sheet.contains("<col min=\"1\" max=\"1\" width=\"16\" customWidth=\"1\"/>"));
    }

    @Test
    void XLSX会清洗非法sheet名并转义XML() throws Exception {
        byte[] bytes = ExportWriter.xlsx("a/b:c*d", List.of("x"), List.of(List.of("<tag> & 'q'")), null);
        Map<String, String> parts = unzip(bytes);
        String wb = parts.get("xl/workbook.xml");
        assertTrue(wb.contains("name=\"a b c d\""), wb);

        String sheet = parts.get("xl/worksheets/sheet1.xml");
        assertTrue(sheet.contains("&lt;tag&gt; &amp; &apos;q&apos;"), sheet);
    }

    @Test
    void 列名进位正确() {
        assertEquals("A", ExportWriter.colName(0));
        assertEquals("Z", ExportWriter.colName(25));
        assertEquals("AA", ExportWriter.colName(26));
        assertEquals("AB", ExportWriter.colName(27));
        assertEquals("AZ", ExportWriter.colName(51));
        assertEquals("BA", ExportWriter.colName(52));
    }

    @Test
    void 空行与空单元格不炸() throws Exception {
        byte[] bytes = ExportWriter.xlsx("空", List.of("a", "b"), List.of(java.util.Arrays.asList("x", null)), null);
        String sheet = unzip(bytes).get("xl/worksheets/sheet1.xml");
        assertTrue(sheet.contains("<c r=\"B2\"/>"), sheet);
    }
}
