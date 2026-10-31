import { describe, it, expect } from 'vitest'
import type { AppEvent, Change, FileChange, VisualChange } from '../../shared/types'
import {
  reduce,
  initialState,
  type Action,
  type CardModel,
  type ConversationState,
  type TurnItem
} from './conversation'

let n = 0
const T = 't1'

function fileCh(path: string, status: FileChange['status'] = 'created'): FileChange {
  return { type: 'file', path, status, lines: [], added: 1, removed: 0, tooLarge: false }
}
const cmd: Change = {
  type: 'command',
  command: 'npm test',
  description: 'Run tests',
  status: 'running',
  durationMs: null,
  changedFiles: [],
  outputTail: []
}

function change(
  phase: VisualChange['phase'],
  targetKey: string,
  ch: Change,
  at = 0,
  turnId = T
): AppEvent {
  return {
    kind: 'change',
    turnId,
    at,
    change: { id: `c${++n}`, toolUseId: `u${n}`, targetKey, phase, change: ch }
  }
}
const ev = {
  text: (text: string, turnId = T): AppEvent => ({ kind: 'text', turnId, at: 0, text }),
  turnEnd: (turnId = T, outcome: 'done' | 'failed' | 'stopped' = 'done'): AppEvent => ({
    kind: 'turn-end',
    turnId,
    at: 0,
    outcome,
    error: outcome === 'failed' ? 'Boom' : null
  }),
  task: (
    taskId: string,
    subject: string | null,
    status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  ): AppEvent => ({
    kind: 'task',
    turnId: T,
    at: 0,
    taskId,
    subject,
    activeForm: null,
    status
  })
}

type Step = AppEvent | ['user-sent', string] | Action
function run(...steps: Step[]): ConversationState {
  return steps.reduce<ConversationState>((s, step) => {
    if (Array.isArray(step))
      return reduce(s, { type: 'user-sent', turnId: step[1], text: `msg ${step[1]}`, at: 100 })
    if ('type' in step) return reduce(s, step)
    return reduce(s, { type: 'event', event: step })
  }, initialState)
}
const itemsOf = (s: ConversationState, i = 0): TurnItem[] => s.turns[i].items
const cards = (s: ConversationState, i = 0): CardModel[] =>
  itemsOf(s, i).flatMap((it) => (it.kind === 'card' ? [it.card] : []))

describe('conversation reducer', () => {
  it('user-sent adds a running turn and collapses every earlier turn', () => {
    const s = run(['user-sent', 'a'], ev.turnEnd('a'), ['user-sent', 'b'])
    expect(s.turns.map((t) => [t.id, t.status, t.collapsed])).toEqual([
      ['a', 'done', true],
      ['b', 'running', false]
    ])
    expect(s.turns[1]).toMatchObject({ userText: 'msg b', items: [], tasks: [], error: null })
  })

  it('collapsing resets cards that were opened with Show', () => {
    let s = run(['user-sent', T], change('done', 'file:a', fileCh('a')), ev.turnEnd())
    const id = cards(s)[0].id
    s = reduce(s, { type: 'toggle-card', turnId: T, cardId: id })
    expect(cards(s)[0].expanded).toBe(true)
    s = reduce(s, { type: 'user-sent', turnId: 't2', text: 'next', at: 0 })
    expect(cards(s)[0].expanded).toBe(false)
  })

  it('appends text deltas to the last text item, and starts a new one after a card', () => {
    const s = run(
      ['user-sent', T],
      ev.text('Hello'),
      ev.text(' there'),
      change('start', 'file:a', fileCh('a')),
      ev.text('Done')
    )
    expect(itemsOf(s).map((i) => (i.kind === 'text' ? i.text : 'card'))).toEqual([
      'Hello there',
      'card',
      'Done'
    ])
    expect(new Set(itemsOf(s).map((i) => i.id)).size).toBe(3)
  })

  it('a done change with the same targetKey updates the card instead of adding one', () => {
    const s = run(
      ['user-sent', T],
      change('start', 'file:a', fileCh('a'), 0),
      change('done', 'file:a', fileCh('a'), 40)
    )
    expect(cards(s)).toHaveLength(1)
    expect(cards(s)[0]).toMatchObject({ status: 'done', lastAt: 40, files: null })
  })

  it('a failed change marks the card failed', () => {
    const s = run(
      ['user-sent', T],
      change('start', 'command:u1', cmd),
      change('failed', 'command:u1', { ...cmd, status: 'failed' })
    )
    expect(cards(s)[0].status).toBe('failed')
  })

  it('finishes the right card when parallel commands end out of order', () => {
    const s = run(
      ['user-sent', T],
      change('start', 'command:x', cmd),
      change('start', 'command:y', cmd),
      change('done', 'command:x', { ...cmd, status: 'done' })
    )
    expect(cards(s).map((c) => [c.targetKey, c.status])).toEqual([
      ['command:x', 'done'],
      ['command:y', 'working']
    ])
  })

  it('consecutive activity changes merge their items', () => {
    const s = run(
      ['user-sent', T],
      change('done', 'activity', { type: 'activity', items: ['Read a.ts'] }),
      change('done', 'activity', { type: 'activity', items: ['Read b.ts'] })
    )
    expect(cards(s)).toHaveLength(1)
    expect(cards(s)[0].change).toEqual({ type: 'activity', items: ['Read a.ts', 'Read b.ts'] })
  })

  it('file changes to different files within GROUP_WINDOW_MS become one group card', () => {
    const s = run(
      ['user-sent', T],
      change('done', 'file:a', fileCh('a'), 0),
      change('done', 'file:b', fileCh('b'), 900)
    )
    expect(cards(s)).toHaveLength(1)
    expect(cards(s)[0].files!.map((f) => f.path)).toEqual(['a', 'b'])
  })

  it('a group keeps the newest version per path and stays working until every file is done', () => {
    const s1 = run(
      ['user-sent', T],
      change('start', 'file:a', fileCh('a'), 0),
      change('start', 'file:b', fileCh('b'), 100),
      change('done', 'file:a', { ...fileCh('a'), added: 7 }, 200)
    )
    expect(cards(s1)).toHaveLength(1)
    expect(cards(s1)[0].status).toBe('working')
    expect(cards(s1)[0].files!.map((f) => [f.path, f.added])).toEqual([
      ['a', 7],
      ['b', 1]
    ])
    const s2 = reduce(s1, { type: 'event', event: change('done', 'file:b', fileCh('b'), 3000) })
    expect(cards(s2)).toHaveLength(1)
    expect(cards(s2)[0].status).toBe('done')
  })

  it('a file change after GROUP_WINDOW_MS starts a new card', () => {
    const s = run(
      ['user-sent', T],
      change('done', 'file:a', fileCh('a'), 0),
      change('done', 'file:b', fileCh('b'), 1500)
    )
    expect(cards(s)).toHaveLength(2)
  })

  it('toggle-card flips expanded', () => {
    let s = run(['user-sent', T], change('done', 'file:a', fileCh('a')))
    s = reduce(s, { type: 'toggle-card', turnId: T, cardId: cards(s)[0].id })
    expect(cards(s)[0].expanded).toBe(true)
    s = reduce(s, { type: 'toggle-card', turnId: T, cardId: cards(s)[0].id })
    expect(cards(s)[0].expanded).toBe(false)
  })

  it('permission events add an item and permission-decided records the decision', () => {
    const s = run(
      ['user-sent', T],
      {
        kind: 'permission',
        turnId: T,
        at: 0,
        requestId: 'r1',
        title: 'Allow this command?',
        detail: 'rm -rf build'
      },
      { type: 'permission-decided', requestId: 'r1', allow: false }
    )
    const permission = itemsOf(s).find((i) => i.kind === 'permission')
    expect(permission).toMatchObject({
      requestId: 'r1',
      title: 'Allow this command?',
      decision: 'denied'
    })
  })

  it('task events upsert tasks and deleted removes them', () => {
    const s = run(
      ['user-sent', T],
      ev.task('1', 'Create table', 'pending'),
      ev.task('2', 'Add rows', 'pending'),
      ev.task('1', null, 'deleted'),
      ev.task('2', null, 'in_progress'),
      ev.task('9', null, 'completed')
    )
    expect(s.turns[0].tasks).toEqual([
      { taskId: '2', subject: 'Add rows', activeForm: null, status: 'in_progress' }
    ])
  })

  it('turn-end finishes working cards: done → done, failed/stopped → failed', () => {
    const start = [['user-sent', T] as Step, change('start', 'file:a', fileCh('a'))]
    const sDone = run(...start, ev.turnEnd(T, 'done'))
    const sStopped = run(...start, ev.turnEnd(T, 'stopped'))
    const sFailed = run(...start, ev.turnEnd(T, 'failed'))
    expect(cards(sDone)[0].status).toBe('done')
    expect(cards(sStopped)[0].status).toBe('failed')
    expect(sStopped.turns[0]).toMatchObject({ status: 'stopped' })
    expect(sFailed.turns[0]).toMatchObject({ status: 'failed', error: 'Boom' })
  })

  it('keeps when a turn started and ended, and what Claude thought', () => {
    const s = run(
      ['user-sent', T],
      { kind: 'thinking', turnId: T, at: 120, text: 'Let me ' },
      { kind: 'thinking', turnId: T, at: 130, text: 'check the table.' },
      { kind: 'turn-end', turnId: T, at: 5100, outcome: 'done', error: null }
    )
    expect(s.turns[0]).toMatchObject({
      startedAt: 100,
      endedAt: 5100,
      thinking: 'Let me check the table.'
    })
  })

  it('progress updates a working card and keeps it working until it is done', () => {
    const running: Change = { ...cmd, description: 'Migrate' } as Change
    const s1 = run(
      ['user-sent', T],
      change('start', 'command:m', running, 0),
      change('progress', 'command:m', { ...running, changedFiles: ['shop.db'] } as Change, 700)
    )
    expect(cards(s1)).toHaveLength(1)
    expect(cards(s1)[0]).toMatchObject({
      status: 'working',
      startedAt: 0,
      lastAt: 700,
      change: { changedFiles: ['shop.db'] }
    })
    const s2 = reduce(s1, {
      type: 'event',
      event: change('done', 'command:m', { ...running, status: 'done' } as Change, 900)
    })
    expect(cards(s2)[0].status).toBe('done')
  })

  it('ignores events for unknown turns', () => {
    const s = run(['user-sent', T], ev.turnEnd('nope'), ev.text('x', 'nope'))
    expect(s.turns).toHaveLength(1)
    expect(s.turns[0]).toMatchObject({ status: 'running', items: [] })
  })

  it('never mutates the previous state', () => {
    const s1 = run(['user-sent', T], change('start', 'file:a', fileCh('a')))
    const frozen = JSON.stringify(s1)
    reduce(s1, { type: 'event', event: change('done', 'file:a', fileCh('a')) })
    reduce(s1, { type: 'user-sent', turnId: 't2', text: 'x', at: 0 })
    expect(JSON.stringify(s1)).toBe(frozen)
  })
})
