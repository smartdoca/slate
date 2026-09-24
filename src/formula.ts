import { createContext } from 'react'

/** A renderer returns trusted, sanitized HTML. Never return user input as HTML. */
export type FormulaRenderer = (source: string) => Promise<string>
export const FormulaContext = createContext<FormulaRenderer | undefined>(undefined)
