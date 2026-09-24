import type { FormulaRenderer } from './formula'

/** Optional adapter: resources are only requested when a formula is rendered. */
export const renderKatex: FormulaRenderer = async source => {
  const [{ default: katex }] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')])
  return katex.renderToString(source, { displayMode: true, throwOnError: true, trust: false, strict: 'warn', maxExpand: 500, maxSize: 20, output: 'htmlAndMathml' })
}
