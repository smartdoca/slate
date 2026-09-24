import { useEditorI18n } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import { Element, Node } from 'slate'
import { ListTree } from 'lucide-react'
import { useSlate } from 'slate-react'
import type { RichElement, TitleLevel } from '../types'

const LEGACY_LEVELS: Partial<Record<RichElement['type'], TitleLevel>> = {
  'heading-one': 'h1', 'heading-two': 'h2', 'heading-three': 'h3', 'heading-four': 'h4', 'heading-five': 'h5',
}

const findBlockElement = (index: number) => document.querySelector<HTMLElement>(`[data-block-index="${index}"]`)

export function DocumentOutline() {
  const { t } = useEditorI18n()

  const editor = useSlate()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const headings = useMemo(() => editor.children.flatMap((node, index) => {
    if (!Element.isElement(node)) return []
    const element = node as RichElement
    const level = element.type === 'paragraph' ? element.title : LEGACY_LEVELS[element.type]
    if (!level) return []
    const text = Node.string(element).trim()
    if (!text) return []
    return [{ key: `${element.id || 'heading'}-${index}`, index, level: Number(level.slice(1)), text }]
  }), [editor.children])
  const headingSignature = headings.map(item => `${item.index}:${item.level}:${item.text}`).join('\u0001')

  useEffect(() => {
    if (!headings.length) return
    let frame = 0
    const update = () => {
      frame = 0
      const anchor = 126
      const candidates = headings.flatMap(item => {
        const element = findBlockElement(item.index)
        return element ? [{ index: item.index, distance: Math.abs(element.getBoundingClientRect().top - anchor) }] : []
      })
      const closest = candidates.sort((a, b) => a.distance - b.distance)[0]
      if (closest) setActiveIndex(closest.index)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => { window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); if (frame) cancelAnimationFrame(frame) }
  // Do not tear down the scroll observer and synchronously measure every heading when
  // an unrelated paragraph changes. The heading topology is all this effect needs.
  }, [headingSignature])

  if (!headings.length) return null
  return <nav className="sk-document-outline" aria-label={t("ui.documentOutline")}>
    <header><ListTree size={16} /><b>{t("ui.outline")}</b></header>
    <div>{headings.map(item => <button key={item.key} className={activeIndex === item.index ? 'is-active' : ''} style={{ paddingLeft: 10 + (item.level - 1) * 12 }} title={item.text} onClick={() => {
      const target = findBlockElement(item.index)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveIndex(item.index)
    }}><span>{item.text}</span></button>)}</div>
  </nav>
}
