/** 金额一律用「分」在前后端传，展示时才转成元（与旧 wallet.js 的 money() 一致）。 */
export function money(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期（旧 notify.js 同款） */
export function relTime(ms) {
  if (!ms) return '';
  const diff = Date.now() - Number(ms);
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前';
  const d = new Date(Number(ms));
  return (
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  );
}
