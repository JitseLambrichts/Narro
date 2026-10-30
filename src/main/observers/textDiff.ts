import { diffLines } from 'diff'
import type { DiffLine } from '../../shared/types'

function splitLines(value: string): string[] {
  const parts = value.split('\n')
  if (parts.at(-1) === '') parts.pop()
  return parts
}

function gap(n: number): DiffLine {
  return { kind: 'gap', text: `${n} unchanged lines` }
}

// Shortens a run of unchanged lines: only `context` lines next to a change stay visible.
function foldRun(run: DiffLine[], atStart: boolean, atEnd: boolean, context: number): DiffLine[] {
  const keepHead = atStart ? 0 : context
  const keepTail = atEnd ? 0 : context
  const hidden = run.length - keepHead - keepTail
  if (hidden < 2) return run
  return [...run.slice(0, keepHead), gap(hidden), ...run.slice(run.length - keepTail)]
}

export function diffText(
  before: string,
  after: string,
  context = 3
): { lines: DiffLine[]; added: number; removed: number } {
  const raw: DiffLine[] = []
  let added = 0
  let removed = 0
  for (const part of diffLines(before, after)) {
    const kind = part.added ? 'add' : part.removed ? 'del' : 'ctx'
    for (const text of splitLines(part.value)) raw.push({ kind, text })
    if (part.added) added += part.count ?? 0
    if (part.removed) removed += part.count ?? 0
  }

  const lines: DiffLine[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i].kind !== 'ctx') {
      lines.push(raw[i++])
      continue
    }
    let j = i
    while (j < raw.length && raw[j].kind === 'ctx') j++
    lines.push(...foldRun(raw.slice(i, j), i === 0, j === raw.length, context))
    i = j
  }
  return { lines, added, removed }
}
