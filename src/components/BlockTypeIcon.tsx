import { Braces, CheckSquare, Columns3, CreditCard, GitBranch, Heading1, Heading2, Heading3, Heading4, Heading5, Image, List, ListOrdered, Minus, Network, Paperclip, Quote, Sigma, Table2, Text } from 'lucide-react'
import type { BlockType } from '../types'

const icons = {
  paragraph: Text,
  'heading-one': Heading1, 'heading-two': Heading2, 'heading-three': Heading3,
  'heading-four': Heading4, 'heading-five': Heading5,
  todo: CheckSquare, 'bulleted-list': List, 'numbered-list': ListOrdered,
  'block-quote': Quote, 'code-block': Braces, divider: Minus,
  table: Table2, columns: Columns3, image: Image, video: Image,
  flowchart: GitBranch, mindmap: Network, card: CreditCard,
  attachment: Paperclip, formula: Sigma,
}

/** Semantic colors stay consistent across all block creation menus. */
export function BlockTypeIcon({ type, size = 17 }: { type: BlockType; size?: number }) {
  const Icon = icons[type as keyof typeof icons] ?? Text
  return <Icon size={size} className="sk-block-type-icon" data-block-kind={type} aria-hidden="true" />
}
