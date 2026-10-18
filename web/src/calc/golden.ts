// Test helper: cached cell values from the original workbook (data/golden, built by tools/extract_workbook.py).
import { readFileSync } from 'node:fs'

type Cell = { v: unknown; f?: string; in?: true }
const book: { sheets: Record<string, { cells: Record<string, Cell> }> } = JSON.parse(
  readFileSync(new URL('../../../data/golden/workbook.json', import.meta.url), 'utf8'),
)

export const cell = (sheet: string, addr: string) => book.sheets[sheet].cells[addr]?.v

export function num(sheet: string, addr: string): number {
  const v = cell(sheet, addr)
  if (typeof v !== 'number') throw new Error(`${sheet}!${addr} is not a number: ${String(v)}`)
  return v
}
