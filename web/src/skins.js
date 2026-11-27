/**
 * 皮肤：视觉方向稿落地成的 5 套主题 + 1 套默认。
 *
 * · 默认 = 现在的皮肤（米白纸感 + 蓝色主色），不写 data-skin，行为与之前完全一致；
 * · 其余 5 套只在 <html data-skin="..."> 上生效，样式全部在 themes.css 里；
 * · 选择存 localStorage（sy_skin），启动时在挂载前应用，避免首屏闪一下默认色。
 */
export const SKINS = [
  {
    id: 'default',
    name: '默认 · 纸白',
    desc: '现在的皮肤：米白纸感 + 蓝色主色',
    hint: '不改任何东西，恢复到这里最稳',
    sw: ['#f6f4ef', '#ffffff', '#2f5bea', '#1a1d24']
  },
  {
    id: 'chamber',
    name: '庭辩现场',
    desc: '胡桃木 + 黄铜 + 宋体，像一场开庭',
    hint: '正式、有仪式感；深色长文要盯对比度',
    sw: ['#1b1714', '#241e19', '#c9a227', '#ece2d4']
  },
  {
    id: 'instrument',
    name: '思辨仪器',
    desc: '石墨底 + 荧光绿 + 等宽字，把对局做成仪表',
    hint: '最像 AI 训练工具；荧光色别大面积用',
    sw: ['#0b0f12', '#111a20', '#b6ff3b', '#dbe9ee']
  },
  {
    id: 'paper',
    name: '纸上推演',
    desc: '米纸 + 印章红 + 楷体，便签与批注',
    hint: '和社区/教程最统一；移动端少用倾斜',
    sw: ['#f4eee2', '#fffdf6', '#b93b2e', '#221d17']
  },
  {
    id: 'radio',
    name: '深夜电台',
    desc: '午夜蓝 + 琥珀 + 玻璃，像一场直播',
    hint: '陪伴感和语音输入最搭；低端机少用模糊',
    sw: ['#0d0f1e', '#1c203a', '#ffb347', '#eef0fb']
  },
  {
    id: 'arena',
    name: '竞技场',
    desc: '纯黑 + 红蓝队色 + 窄体大标题',
    hint: '对抗感、适合赛事与排行榜',
    sw: ['#080808', '#141414', '#ff3b30', '#f4f4f5']
  }
];

const KEY = 'sy_skin';

export function normalizeSkin(id) {
  return SKINS.some((s) => s.id === id) ? id : 'default';
}

/** 应用皮肤（default 会移除属性，等于完全回到原样）。 */
export function applySkin(id) {
  const skin = normalizeSkin(id);
  try {
    if (skin === 'default') document.documentElement.removeAttribute('data-skin');
    else document.documentElement.setAttribute('data-skin', skin);
    localStorage.setItem(KEY, skin);
  } catch (e) { /* 隐私模式等忽略 */ }
  return skin;
}

export function currentSkin() {
  try {
    return normalizeSkin(localStorage.getItem(KEY) || 'default');
  } catch (e) {
    return 'default';
  }
}

/** 启动时调用：只读存储并上屏，不再回写。 */
export function applySavedSkin() {
  const skin = currentSkin();
  try {
    if (skin === 'default') document.documentElement.removeAttribute('data-skin');
    else document.documentElement.setAttribute('data-skin', skin);
  } catch (e) { /* 忽略 */ }
}
