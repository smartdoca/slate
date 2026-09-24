import type { DiagramNodeType } from './types'

// Shared normalized geometry for the palette, editor and exported diagram.
export const diagramPaths: Partial<Record<DiagramNodeType, string>> = {
  subprocess: 'M0 0H100V60H0Z M12 0V60 M88 0V60',
  database: 'M0 10C0 -3 100 -3 100 10V50C100 63 0 63 0 50Z M0 10C0 23 100 23 100 10',
  document: 'M0 0H100V48C65 30 35 66 0 48Z',
  'multiple-documents': 'M12 0H100V44H94 M6 6H94V50H88 M0 12H88V52C60 38 28 66 0 52Z',
  delay: 'M0 0H65C110 0 110 60 65 60H0Z',
  display: 'M18 0H75C108 0 108 60 75 60H18L0 30Z',
  storage: 'M0 0H100V60H0Z M12 0V60 M0 12H100',
  'paper-tape': 'M0 8C35 -12 65 28 100 8V52C65 72 35 32 0 52Z',
  note: 'M0 0H80L100 20V60H0Z M80 0V20H100',
  package: 'M0 0H38V12H100V60H0Z M0 12H38',
  component: 'M15 0H100V60H15Z M0 12H30V24H0Z M0 36H30V48H0Z',
  class: 'M0 0H100V60H0Z M0 20H100 M0 40H100',
  object: 'M0 0H100V60H0Z M15 22H85',
  actor: 'M40 10A10 10 0 1 0 60 10A10 10 0 1 0 40 10 M50 20V42 M20 30H80 M50 42L25 60 M50 42L75 60',
  lifeline: 'M20 0H80V18H20Z M50 18V25 M50 29V36 M50 40V47 M50 51V60',
  boundary: 'M0 0V60 M0 30H25 M25 30A25 25 0 1 0 75 30A25 25 0 1 0 25 30',
  control: 'M50 5L40 0 M50 5L40 12 M50 5A25 25 0 1 1 25 30',
  entity: 'M25 26A25 25 0 1 0 75 26A25 25 0 1 0 25 26 M18 60H82',
}
