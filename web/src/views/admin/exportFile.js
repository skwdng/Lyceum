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

/** 报表导出（历史调用方保留这个签名）。 */
export async function downloadExport(params, fallbackName = 'export.csv') {
  return downloadPath(analyticsApi.exportPath(params), fallbackName);
}

/**
 * 通用下载：给一个已经是 /api/ 前缀的路径（报表导出、屏蔽词导出都用它）。
 *
 * 为什么要单独抽出来：下载必须带 Authorization 请求头，window.open 带不了；
 * 两个页面各写一份 fetch+Blob 迟早漂移，所以只留这一份。
 */
export async function downloadPath(path, fallbackName = 'export.txt') {
  const token = getAdminToken();
  const resp = await fetch(API_BASE + path, {
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
