import type { AppEvent, Change, FileChange, TaskStatus, VisualChange } from '../../shared/types'

export interface CardModel {
  id: string
  targetKey: string
  status: 'working' | 'done' | 'failed'
  change: Change
  // Set for a group card ("Updated N files"): the newest change per file.
  files: FileChange[] | null
  lastAt: number
  expanded: boolean
  // Target keys of the tool calls in this card that are still running.
  working: string[]
}

export type TurnItem =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'card'; id: string; card: CardModel }
  | {
      kind: 'permission'
      id: string
      requestId: string
      title: string
      detail: string
      decision: 'allowed' | 'denied' | null
    }

export interface TaskItem {
  taskId: string
  subject: string
  activeForm: string | null
  status: TaskStatus
}

export interface Turn {
  id: string
  userText: string
  items: TurnItem[]
  tasks: TaskItem[]
  status: 'running' | 'done' | 'failed' | 'stopped'
  error: string | null
  collapsed: boolean
}

export interface ConversationState {
  turns: Turn[]
}

export type Action =
  | { type: 'user-sent'; turnId: string; text: string }
  | { type: 'event'; event: AppEvent }
  | { type: 'toggle-card'; turnId: string; cardId: string }
  | { type: 'permission-decided'; requestId: string; allow: boolean }

export const GROUP_WINDOW_MS = 1000
export const GROUP_TARGET_KEY = 'files'

export const initialState: ConversationState = { turns: [] }

function cardStatus(
  card: CardModel,
  phase: VisualChange['phase'],
  working: string[]
): CardModel['status'] {
  if (card.status === 'failed' || phase === 'failed') return 'failed'
  return working.length > 0 ? 'working' : 'done'
}

function trackWorking(working: string[], key: string, phase: VisualChange['phase']): string[] {
  const rest = working.filter((k) => k !== key)
  return phase === 'start' ? [...rest, key] : rest
}

function upsertFile(files: FileChange[], file: FileChange): FileChange[] {
  return files.some((f) => f.path === file.path)
    ? files.map((f) => (f.path === file.path ? file : f))
    : [...files, file]
}

function isFileCard(card: CardModel): boolean {
  return card.files !== null || card.change.type === 'file'
}

// Applies a change to an existing card, turning a single file card into a group when needed.
function applyChange(card: CardModel, vc: VisualChange, at: number, asGroup: boolean): CardModel {
  const working = trackWorking(card.working, vc.targetKey, vc.phase)
  const status = cardStatus(card, vc.phase, working)
  if (asGroup && vc.change.type === 'file') {
    const files = upsertFile(card.files ?? [card.change as FileChange], vc.change)
    return {
      ...card,
      targetKey: GROUP_TARGET_KEY,
      files,
      change: vc.change,
      status,
      working,
      lastAt: at
    }
  }
  const change =
    card.change.type === 'activity' && vc.change.type === 'activity'
      ? { type: 'activity' as const, items: [...card.change.items, ...vc.change.items] }
      : vc.change
  return { ...card, change, status, working, lastAt: at }
}

function newCard(vc: VisualChange, at: number): CardModel {
  return {
    id: vc.id,
    targetKey: vc.targetKey,
    status: vc.phase === 'start' ? 'working' : vc.phase === 'done' ? 'done' : 'failed',
    change: vc.change,
    files: null,
    lastAt: at,
    expanded: false,
    working: vc.phase === 'start' ? [vc.targetKey] : []
  }
}

function replaceCard(items: TurnItem[], index: number, card: CardModel): TurnItem[] {
  return items.map((it, i) => (i === index ? { kind: 'card', id: card.id, card } : it))
}

function addChange(turn: Turn, vc: VisualChange, at: number): Turn {
  const { items } = turn

  // 1. A running tool call finishes in the card that shows it, wherever that card is.
  if (vc.phase !== 'start') {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (it.kind === 'card' && it.card.working.includes(vc.targetKey)) {
        return {
          ...turn,
          items: replaceCard(items, i, applyChange(it.card, vc, at, it.card.files !== null))
        }
      }
    }
  }

  const lastIndex = items.length - 1
  const last = items[lastIndex]
  if (last?.kind === 'card') {
    // 2. The same target as the last card updates that card.
    if (last.card.targetKey === vc.targetKey) {
      return {
        ...turn,
        items: replaceCard(items, lastIndex, applyChange(last.card, vc, at, false))
      }
    }
    // 3. Files touched in quick succession share one group card.
    if (
      vc.change.type === 'file' &&
      isFileCard(last.card) &&
      at - last.card.lastAt <= GROUP_WINDOW_MS
    ) {
      return { ...turn, items: replaceCard(items, lastIndex, applyChange(last.card, vc, at, true)) }
    }
  }

  // 4. Otherwise the change gets a card of its own.
  const card = newCard(vc, at)
  return { ...turn, items: [...items, { kind: 'card', id: card.id, card }] }
}

function addText(turn: Turn, text: string): Turn {
  const last = turn.items.at(-1)
  if (last?.kind === 'text') {
    return { ...turn, items: [...turn.items.slice(0, -1), { ...last, text: last.text + text }] }
  }
  return {
    ...turn,
    items: [...turn.items, { kind: 'text', id: `${turn.id}:${turn.items.length}`, text }]
  }
}

function upsertTask(turn: Turn, e: Extract<AppEvent, { kind: 'task' }>): Turn {
  const existing = turn.tasks.find((t) => t.taskId === e.taskId)
  if (e.status === 'deleted')
    return { ...turn, tasks: turn.tasks.filter((t) => t.taskId !== e.taskId) }
  if (existing) {
    const tasks = turn.tasks.map((t) =>
      t.taskId === e.taskId
        ? {
            ...t,
            subject: e.subject ?? t.subject,
            activeForm: e.activeForm ?? t.activeForm,
            status: e.status
          }
        : t
    )
    return { ...turn, tasks }
  }
  // An update for a task this turn never saw created carries no subject to show.
  if (e.subject === null) return turn
  return {
    ...turn,
    tasks: [
      ...turn.tasks,
      { taskId: e.taskId, subject: e.subject, activeForm: e.activeForm, status: e.status }
    ]
  }
}

function endTurn(turn: Turn, e: Extract<AppEvent, { kind: 'turn-end' }>): Turn {
  const finished: CardModel['status'] = e.outcome === 'done' ? 'done' : 'failed'
  const items = turn.items.map((it): TurnItem =>
    it.kind === 'card' && it.card.status === 'working'
      ? { ...it, card: { ...it.card, status: finished, working: [] } }
      : it
  )
  return { ...turn, items, status: e.outcome, error: e.error }
}

function applyEvent(turn: Turn, e: AppEvent): Turn {
  switch (e.kind) {
    case 'text':
      return addText(turn, e.text)
    case 'change':
      return addChange(turn, e.change, e.at)
    case 'task':
      return upsertTask(turn, e)
    case 'permission':
      return {
        ...turn,
        items: [
          ...turn.items,
          {
            kind: 'permission',
            id: e.requestId,
            requestId: e.requestId,
            title: e.title,
            detail: e.detail,
            decision: null
          }
        ]
      }
    case 'turn-end':
      return endTurn(turn, e)
  }
}

function collapse(turn: Turn): Turn {
  const items = turn.items.map((it) =>
    it.kind === 'card' && it.card.expanded ? { ...it, card: { ...it.card, expanded: false } } : it
  )
  return { ...turn, items, collapsed: true }
}

export function reduce(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case 'user-sent': {
      const turn: Turn = {
        id: action.turnId,
        userText: action.text,
        items: [],
        tasks: [],
        status: 'running',
        error: null,
        collapsed: false
      }
      return { turns: [...state.turns.map(collapse), turn] }
    }
    case 'event': {
      const e = action.event
      if (!state.turns.some((t) => t.id === e.turnId)) return state
      return { turns: state.turns.map((t) => (t.id === e.turnId ? applyEvent(t, e) : t)) }
    }
    case 'toggle-card':
      return {
        turns: state.turns.map((t) =>
          t.id !== action.turnId
            ? t
            : {
                ...t,
                items: t.items.map((it) =>
                  it.kind === 'card' && it.card.id === action.cardId
                    ? { ...it, card: { ...it.card, expanded: !it.card.expanded } }
                    : it
                )
              }
        )
      }
    case 'permission-decided': {
      const decision: 'allowed' | 'denied' = action.allow ? 'allowed' : 'denied'
      return {
        turns: state.turns.map((t) =>
          t.items.some((it) => it.kind === 'permission' && it.requestId === action.requestId)
            ? {
                ...t,
                items: t.items.map((it) =>
                  it.kind === 'permission' && it.requestId === action.requestId
                    ? { ...it, decision }
                    : it
                )
              }
            : t
        )
      }
    }
  }
}
