import { createContext, useContext, type ReactNode } from 'react'

export type BlockSelectMode = 'single' | 'toggle' | 'range'

export type BlockSelectionValue = {
  selectedIds: readonly string[]
  select: (index: number, id: string, mode: BlockSelectMode) => void
  clear: () => void
}

const BlockSelectionContext = createContext<BlockSelectionValue>({ selectedIds: [], select: () => {}, clear: () => {} })

export function BlockSelectionProvider({ value, children }: { value: BlockSelectionValue; children: ReactNode }) {
  return <BlockSelectionContext.Provider value={value}>{children}</BlockSelectionContext.Provider>
}

export function useBlockSelection() {
  return useContext(BlockSelectionContext)
}
