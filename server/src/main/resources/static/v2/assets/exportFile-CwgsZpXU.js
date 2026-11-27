import { I as analyticsApi, Q as getAdminToken, R as API_BASE, X as ApiError } from "./index-BhpyT_Ky.js";
async function downloadExport(params, fallbackName = "export.csv") {
  return downloadPath(analyticsApi.exportPath(params), fallbackName);
}
async function downloadPath(path, fallbackName = "export.txt") {
  const token = getAdminToken();
  const resp = await fetch(API_BASE + path, {
    headers: token ? { Authorization: "Bearer " + token } : {}
  });
  if (!resp.ok) {
    let message = "导出失败（HTTP " + resp.status + "）";
    try {
      const body = await resp.json();
      if (body && (body.message || body.code)) message = body.message || body.code;
    } catch (e) {
    }
    throw new ApiError(message, "EXPORT_FAILED", resp.status);
  }
  const blob = await resp.blob();
  const name = filenameOf(resp.headers.get("Content-Disposition")) || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2e3);
  return name;
}
function filenameOf(contentDisposition) {
  if (!contentDisposition) return "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (m) {
    try {
      return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""));
    } catch (e) {
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plain ? plain[1].trim() : "";
}
export {
  downloadPath as a,
  downloadExport as d
};
