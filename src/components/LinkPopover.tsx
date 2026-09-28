import { useEditorI18n } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'

export function LinkPopover({ onSubmit, onClose, onInputFocus }: { onSubmit: (url: string) => void; onClose: () => void; onInputFocus?: () => void }) {
  const { t } = useEditorI18n()

  const [url, setUrl] = useState('https://')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  return <form className="sk-link-popover" onSubmit={event => { event.preventDefault(); onSubmit(url) }} onMouseDown={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onCopy={event => event.stopPropagation()} onCut={event => event.stopPropagation()}>
    <label>{t("ui.linkUrl")}</label>
    <div><input ref={inputRef} aria-label={t("ui.linkUrl")} value={url} placeholder="https://example.com" onFocus={() => onInputFocus?.()} onChange={event => setUrl(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }} /><button type="submit" title={t("ui.confirmLink")} aria-label={t("ui.confirmLink")}><Check size={15} /></button><button type="button" title={t("cancel")} aria-label={t("ui.cancelLink")} onClick={onClose}><X size={15} /></button></div>
  </form>
}
