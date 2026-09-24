import Prism from 'prismjs'

/** Render tokens with editor-owned classes, without changing global Prism hooks. */
export function highlightCode(source: string, grammar: Prism.Grammar): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const render = (value: string | Prism.Token | Array<string | Prism.Token>): string => {
    if (typeof value === 'string') return escape(value)
    if (Array.isArray(value)) return value.map(render).join('')
    const aliases = typeof value.alias === 'string' ? [value.alias] : value.alias || []
    const classes = ['sk-token', ...[value.type, ...aliases].map(name => `sk-token-${name.replace(/[^a-zA-Z0-9_-]/g, '')}`)]
    return `<span class="${classes.join(' ')}">${render(value.content)}</span>`
  }
  return render(Prism.tokenize(source, grammar))
}
