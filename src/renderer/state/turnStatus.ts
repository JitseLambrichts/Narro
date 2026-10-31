import type { Turn } from './conversation'
import { cardTitle } from './cardTitle'
import { t } from '../i18n/en'

// All lines added and removed in a turn, over every file card.
export function turnDiffstat(turn: Turn): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const item of turn.items) {
    if (item.kind !== 'card') continue
    const { card } = item
    const files = card.files ?? (card.change.type === 'file' ? [card.change] : [])
    for (const f of files) {
      added += f.added
      removed += f.removed
    }
  }
  return { added, removed }
}

// What Claude is busy with right now: the newest card that is still working.
export function currentStep(turn: Turn): string {
  for (let i = turn.items.length - 1; i >= 0; i--) {
    const item = turn.items[i]
    if (item.kind === 'card' && item.card.status === 'working') return cardTitle(item.card)
  }
  return t.thinking
}
