/**
 * 报表下载（CSV / XLSX）。
 *
 * 为什么不能直接 `window.open(exportPath)`：
 * 导出接口和别的管理接口一样要管理员令牌（`Authorization: Bearer …`），
 * 而窗口跳转带不了请求头 —— 直开只会拿到 401。
 * 所以走 fetch 拿二进制 → 生成 Blob → 造一个临时 <a download> 点一下。
 *
 * 文件名从 `Content-Disposition` 里读（后端给的是英文+日期，避免中文编码问题）；
 * 读不到就用调用方给的兜底名。
 */
import { API_BASE, getAdminToken, analyticsApi, ApiError } from '../../api.js';

export async function downloadExport(params, fallbackName = 'export.csv') {
  const token = getAdminToken();
  const resp = await fetch(API_BASE + analyticsApi.exportPath(params), {
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });

  if (!resp.ok) {
    // 错误体是 JSON（{code,message}），读出来给用户看
    let message = '导出失败（HTTP ' + resp.status + '）';
    try {
      const body = await resp.json();
      if (body && (body.message || body.code)) message = body.message || body.code;
    } catch (e) {
      /* 非 JSON：保持默认文案 */
    }
    throw new ApiError(message, 'EXPORT_FAILED', resp.status);
  }

  const blob = await resp.blob();
  const name = filenameOf(resp.headers.get('Content-Disposition')) || fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 在部分浏览器会让下载失败，放到下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

/** 从 `attachment; filename="modules_2026-11-11.xlsx"` 里取文件名。 */
export function filenameOf(contentDisposition) {
  if (!contentDisposition) return '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (m) {
    try {
      return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ''));
    } catch (e) {
      /* 落到下面 */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plain ? plain[1].trim() : '';
}
