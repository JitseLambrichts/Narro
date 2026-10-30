import { promises as fs } from 'fs'
import type { FileChange } from '../../shared/types'
import { diffText } from './textDiff'

export const MAX_DIFF_BYTES = 1_000_000
const BINARY_SNIFF_BYTES = 8000

export interface FileSnapshot {
  exists: boolean
  text: string | null
  binary: boolean
  tooLarge: boolean
}

const MISSING: FileSnapshot = { exists: false, text: null, binary: false, tooLarge: false }

export async function readSnapshot(absPath: string): Promise<FileSnapshot> {
  try {
    const st = await fs.stat(absPath)
    if (!st.isFile()) return MISSING
    if (st.size > MAX_DIFF_BYTES) return { exists: true, text: null, binary: false, tooLarge: true }
    const buf = await fs.readFile(absPath)
    if (buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { exists: true, text: null, binary: true, tooLarge: false }
    return { exists: true, text: buf.toString('utf8'), binary: false, tooLarge: false }
  } catch {
    return MISSING
  }
}

export function fileChange(relPath: string, before: FileSnapshot, after: FileSnapshot): FileChange {
  const status = before.exists && !after.exists ? 'deleted' : before.exists ? 'modified' : 'created'
  // Huge or binary files only get a one-line summary, so the UI never has to render them.
  if (before.binary || before.tooLarge || after.binary || after.tooLarge) {
    return { type: 'file', path: relPath, status, lines: [], added: 0, removed: 0, tooLarge: true }
  }
  const d = diffText(before.text ?? '', after.text ?? '')
  return { type: 'file', path: relPath, status, lines: d.lines, added: d.added, removed: d.removed, tooLarge: false }
}
