import { createContext, useContext } from 'react'
import type { BlockType } from './types'
export const InsertMenuContext = createContext<readonly BlockType[] | undefined>(undefined)
/** Menu configuration only; hosts still validate persisted content and resources. */
export function useInsertMenu() {
  const types = useContext(InsertMenuContext)
  return (type: BlockType) => types === undefined || types.includes(type)
}
