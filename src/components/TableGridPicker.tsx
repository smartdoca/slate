import { useEditorI18n } from '../i18n'
import { useState, type PointerEvent } from 'react'

export function TableGridPicker({ onSelect, max = 9 }: { onSelect(rows: number, columns: number): void; max?: number }) {
  const { t } = useEditorI18n()

  const [size, setSize] = useState({ rows: 3, columns: 3 })
  const update = (event: PointerEvent<HTMLButtonElement>, rows: number, columns: number) => {
    event.preventDefault()
    setSize({ rows, columns })
  }
  return <div className="sk-table-grid-picker" onPointerLeave={() => setSize({ rows: 3, columns: 3 })}>
    <div className="sk-table-grid-label">{size.rows} × {size.columns} {t("ui.table")}</div>
    <div className="sk-table-grid" style={{ gridTemplateColumns: `repeat(${max}, 1fr)` }}>
      {Array.from({ length: max * max }, (_, index) => {
        const rows = Math.floor(index / max) + 1; const columns = index % max + 1
        return <button key={index} aria-label={t("table.createSize", { 0: rows, 1: columns })} className={rows <= size.rows && columns <= size.columns ? 'is-active' : ''} onPointerEnter={event => update(event, rows, columns)} onPointerDown={event => { event.preventDefault(); onSelect(rows, columns) }} />
      })}
    </div>
  </div>
}
