import { useEditorI18n } from '../i18n'
import { blockArrowGeometry } from '../diagramArrows'
import type { DiagramArrowDirection, DiagramArrowRoute, DiagramNode } from '../types'

export type ArrowSettings = Pick<DiagramNode, 'arrowDirection' | 'arrowRoute' | 'arrowThickness' | 'arrowHeadSize' | 'arrowBend'>

export function DiagramArrowSettings({ value, size, change }: { value: ArrowSettings; size: { width: number; height: number }; change(patch: ArrowSettings): void }) {
  const { t } = useEditorI18n(), geometry = blockArrowGeometry(size, value)
  return <div className="sk-arrow-settings">
    <label>{t('diagram.arrowRoute')}<select aria-label={t('diagram.arrowRoute')} value={value.arrowRoute || 'straight'} onChange={event => change({ arrowRoute: event.target.value as DiagramArrowRoute })}>
      {(['straight', 'elbow', 'step'] as const).map(route => <option key={route} value={route}>{t(`diagram.arrowRoute.${route}`)}</option>)}
    </select></label>
    <label>{t('diagram.arrowDirection')}<select aria-label={t('diagram.arrowDirection')} value={value.arrowDirection || 'right'} onChange={event => change({ arrowDirection: event.target.value as DiagramArrowDirection })}>
      {(['right', 'down', 'left', 'up'] as const).map(direction => <option key={direction} value={direction}>{t(`diagram.direction.${direction}`)}</option>)}
    </select></label>
    <label>{t('diagram.arrowThickness')}<output>{Math.round(geometry.thickness)} px</output><input aria-label={t('diagram.arrowThickness')} type="range" min="4" max={Math.floor(geometry.maxThickness)} value={geometry.thickness} onChange={event => change({ arrowThickness: Number(event.target.value) })} /></label>
    <label>{t('diagram.arrowHeadSize')}<output>{Math.round(geometry.headSize)} px</output><input aria-label={t('diagram.arrowHeadSize')} type="range" min={Math.ceil(geometry.thickness + 4)} max={Math.floor(geometry.maxHeadSize)} value={geometry.headSize} onChange={event => change({ arrowHeadSize: Number(event.target.value) })} /></label>
    {value.arrowRoute && value.arrowRoute !== 'straight' && <><label>{t('diagram.arrowBend')}<output>{value.arrowBend ?? 50}%</output><input aria-label={t('diagram.arrowBend')} type="range" min="10" max="90" value={value.arrowBend ?? 50} onChange={event => change({ arrowBend: Number(event.target.value) })} /></label><small>{t('diagram.arrowBendHint')}</small></>}
  </div>
}
