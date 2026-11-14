/**
 * 社区正文渲染（等价旧 community.js 的 esc/cmMentionify/cmInline/cmMD/cmHl）。
 *
 * 安全约定：**先转义再套有限语法**，只允许外链图片与链接；不引入任何 HTML 透传。
 * 与旧版逐条一致：
 * · `@昵称` 只变浅蓝、不加链接（决策 2），身份判断完全由后端 userId 决定；
 * · Markdown 支持：`#`/`##`/`###` 标题、`-`/`*` 无序列表、`1.` 有序列表、`**粗**`、`*斜*`、`` `代码` ``、
 *   `[文字](https://…)`、`![](https://…)`；
 * · 搜索高亮只高亮第一处（旧版同款）。
 */

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把已经转义过的 HTML 里的 `@昵称` 包成浅蓝（不加链接、不跳转） */
export function mentionify(html) {
  return String(html == null ? '' : html).replace(
    /@([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g,
    '<span class="mention">@$1</span>'
  );
}

function inline(s) {
  let t = mentionify(esc(s));
  t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2">');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  return t;
}

export function markdown(text) {
  const src = String(text == null ? '' : text).replace(/\r/g, '');
  return src
    .split(/\n{2,}/)
    .map((b) => {
      const lines = b.split('\n').filter((l) => l.trim() !== '');
      if (!lines.length) return '';
      const h = lines[0].match(/^(#{1,3})\s+(.*)$/);
      if (h && lines.length === 1) {
        const lv = Math.min(h[1].length + 1, 3);
        return '<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>';
      }
      if (lines.every((l) => /^[-*]\s+/.test(l))) {
        return '<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^[-*]\s+/, '')) + '</li>').join('') + '</ul>';
      }
      if (lines.every((l) => /^\d+\.\s+/.test(l))) {
        return '<ol>' + lines.map((l) => '<li>' + inline(l.replace(/^\d+\.\s+/, '')) + '</li>').join('') + '</ol>';
      }
      return '<p>' + lines.map((l) => inline(l)).join('<br>') + '</p>';
    })
    .join('');
}

/** 搜索高亮：只高亮第一处（旧版同款），返回已转义的 HTML */
export function highlight(text, q) {
  const s = esc(text);
  const qq = String(q || '').trim();
  if (!qq) return s;
  const qe = esc(qq);
  const i = s.toLowerCase().indexOf(qe.toLowerCase());
  if (i < 0) return s;
  return s.slice(0, i) + '<mark>' + s.slice(i, i + qe.length) + '</mark>' + s.slice(i + qe.length);
}

/** 纯文本摘要（列表用）：去掉 Markdown 记号、压缩空白、截 200 字 */
export function excerpt(body) {
  const plain = String(body == null ? '' : body)
    .replace(/[#*_>-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 200 ? plain.slice(0, 200) + '…' : plain;
}
