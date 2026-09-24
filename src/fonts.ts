/** Uses locally installed fonts; no font download or bundled font files. */
export const FONT_FAMILIES = [
  { key: 'font.default', value: '' },
  { key: 'font.sans', value: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif' },
  { key: 'font.serif', value: '"Songti SC", SimSun, "Times New Roman", serif' },
  { key: 'font.kai', value: '"Kaiti SC", KaiTi, STKaiti, serif' },
  { key: 'font.mono', value: 'ui-monospace, "SFMono-Regular", Consolas, monospace' },
] as const
