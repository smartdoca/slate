import type { ReactNode } from 'react'
import type { CustomElement, EditorPlugin } from './types'
import { createAtomicInlineCodec, type YjsInlineCodec } from './codec'

export interface AtomicInlineExtensionOptions {
  type: `custom:${string}`
  schemaVersion: number
  encode(element: CustomElement): Record<string, unknown>
  decode(data: Record<string, unknown>, identity: { id: string }): CustomElement
  render(element: CustomElement): ReactNode
  onActivate?(element: CustomElement): void
}

/** Builds matching editor and Yjs registrations for an indivisible business inline. */
export function createAtomicInlineExtension(options: AtomicInlineExtensionOptions): { plugin: EditorPlugin; codec: YjsInlineCodec } {
  const codec: YjsInlineCodec = createAtomicInlineCodec({ type: options.type, schemaVersion: options.schemaVersion, encode: element => options.encode(element as CustomElement), decode: options.decode })
  const plugin: EditorPlugin = {
    key: `atomic-inline:${options.type}`,
    isInline: element => element.type === options.type ? true : undefined,
    isVoid: element => element.type === options.type ? true : undefined,
    renderElement: props => props.element.type === options.type
      ? <span {...props.attributes} data-atomic-inline={options.type}>
          <span contentEditable={false} role={options.onActivate ? 'button' : undefined} tabIndex={options.onActivate ? 0 : undefined}
            onClick={() => options.onActivate?.(props.element as CustomElement)}
            onKeyDown={event => { if (options.onActivate && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); options.onActivate(props.element as CustomElement) } }}>
            {options.render(props.element as CustomElement)}
          </span>
          {props.children}
        </span>
      : undefined,
  }
  return { plugin, codec }
}
