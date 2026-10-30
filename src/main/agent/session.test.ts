import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AppEvent } from '../../shared/types'
import { PLAIN_LANGUAGE_APPEND } from './prompt'
import {
  AgentSession,
  CRASH_ERROR,
  DENY_MESSAGE,
  SIGN_IN_ERROR,
  type AgentSessionDeps,
  type QueryFn
} from './session'

type PermissionEvent = Extract<AppEvent, { kind: 'permission' }>
// One turn of the fake Claude Code: `interrupted` rejects when the turn is interrupted.
type TurnScript = (
  o: Options,
  text: string,
  turn: { index: number; interrupted: Promise<never> }
) => AsyncGenerator<unknown, void>

class Interrupted extends Error {}

let tmp: string
let events: AppEvent[]
let calls: { options: Options }[]
let prompts: string[]
let fakes: {
  interrupt: ReturnType<typeof vi.fn>
  setModel: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}[]
let requestPermission: ReturnType<typeof vi.fn<(e: PermissionEvent) => Promise<boolean>>>

// A stand-in for a Claude Code process: it reads user messages from the prompt stream
// and answers each with the turn script, until the stream ends.
function fakeQuery(
  script: TurnScript,
  opts: { endAfterTurns?: number; ignoreInterrupt?: boolean } = {}
): QueryFn {
  return ((params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
    calls.push({ options: params.options })
    let interruptTurn: (() => void) | null = null
    const gen = (async function* () {
      yield init
      let index = 0
      for await (const message of params.prompt) {
        prompts.push(message.message.content as string)
        const interrupted = new Promise<never>((_, reject) => {
          interruptTurn = () => reject(new Interrupted('interrupted'))
        })
        interrupted.catch(() => {})
        try {
          yield* script(params.options, message.message.content as string, {
            index: index++,
            interrupted
          })
        } catch (err) {
          if (!(err instanceof Interrupted)) throw err
          yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [] }
        }
        if (opts.endAfterTurns && index >= opts.endAfterTurns) return
      }
    })()
    const fake = {
      interrupt: vi.fn(async () => {
        if (!opts.ignoreInterrupt) interruptTurn?.()
      }),
      setModel: vi.fn(async () => {}),
      close: vi.fn(() => {})
    }
    fakes.push(fake)
    return Object.assign(gen, fake)
  }) as unknown as QueryFn
}

function session(
  script: TurnScript,
  over: Partial<AgentSessionDeps> = {},
  opts = {}
): AgentSession {
  let n = 0
  return new AgentSession({
    queryFn: fakeQuery(script, opts),
    projectDir: tmp,
    model: 'claude-opus-5-5',
    claudePath: '/opt/claude',
    env: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant-should-not-pass' },
    emit: (e) => events.push(e),
    requestPermission,
    now: () => 1000,
    newId: () => `id${++n}`,
    ...over
  })
}

const signal = new AbortController().signal
const base = { session_id: 's1', transcript_path: '/t', cwd: '/c' }

function pre(o: Options, tool: string, input: unknown, id: string): Promise<unknown> {
  return o.hooks!.PreToolUse![0].hooks[0](
    { ...base, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: id },
    id,
    { signal }
  )
}
function post(
  o: Options,
  tool: string,
  input: unknown,
  response: unknown,
  id: string
): Promise<unknown> {
  return o.hooks!.PostToolUse![0].hooks[0](
    {
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: tool,
      tool_input: input,
      tool_response: response,
      tool_use_id: id,
      duration_ms: 12
    },
    id,
    { signal }
  )
}
const init = { type: 'system', subtype: 'init', session_id: 's1' }
const text = (t: string): unknown => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  parent_tool_use_id: null
})
const success = { type: 'result', subtype: 'success', is_error: false, result: '' }
const kinds = (): string[] =>
  events.map((e) => (e.kind === 'change' ? `change:${e.change.phase}` : e.kind))

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'session-'))
  events = []
  calls = []
  prompts = []
  fakes = []
  requestPermission = vi.fn<(e: PermissionEvent) => Promise<boolean>>()
})

describe('AgentSession', () => {
  it('streams text, emits file changes in order and ends the turn', async () => {
    const s = session(async function* (o) {
      yield text("I'll write")
      const input = { file_path: join(tmp, 'notes.md'), content: 'a\nb\n' }
      await pre(o, 'Write', input, 'tu1')
      writeFileSync(input.file_path, input.content)
      await post(o, 'Write', input, {}, 'tu1')
      yield text('Done.')
      yield success
    })
    const { turnId, done } = s.send('Write notes')
    await done
    expect(kinds()).toEqual(['text', 'change:start', 'change:done', 'text', 'turn-end'])
    expect(events.every((e) => e.turnId === turnId && e.at === 1000)).toBe(true)
    expect(events[0]).toMatchObject({ kind: 'text', text: "I'll write" })
    expect(events.at(-1)).toMatchObject({ outcome: 'done', error: null })
    expect(s.running).toBe(false)
  })

  it('ignores text streamed by sub-agents', async () => {
    const s = session(async function* () {
      yield { ...(text('inner') as object), parent_tool_use_id: 'tu9' }
      yield success
    })
    await s.send('x').done
    expect(kinds()).toEqual(['turn-end'])
  })

  it('keeps one background Claude Code process for the whole conversation', async () => {
    const s = session(async function* (_o, t) {
      yield text(`re: ${t}`)
      yield success
    })
    await s.send('one').done
    await s.send('two').done
    expect(calls).toHaveLength(1)
    expect(prompts).toEqual(['one', 'two'])
    expect(events.filter((e) => e.kind === 'text').map((e) => e.text)).toEqual([
      're: one',
      're: two'
    ])
    expect(calls[0].options).toMatchObject({
      model: 'claude-opus-5-5',
      cwd: tmp,
      includePartialMessages: true,
      permissionMode: 'default',
      pathToClaudeCodeExecutable: '/opt/claude',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: PLAIN_LANGUAGE_APPEND }
    })
    expect(calls[0].options.resume).toBeUndefined()
  })

  it('runs on the Claude Code sign-in, never on an API key', async () => {
    const s = session(async function* () {
      yield success
    })
    await s.send('x').done
    const env = calls[0].options.env!
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env).toMatchObject({ PATH: '/usr/bin', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' })
  })

  it('starts again and resumes the conversation when the process has ended', async () => {
    const s = session(
      async function* () {
        yield success
      },
      {},
      { endAfterTurns: 1 }
    )
    await s.send('one').done
    await new Promise((r) => setTimeout(r, 0))
    await s.send('two').done
    expect(calls).toHaveLength(2)
    expect(calls[1].options.resume).toBe('s1')
    expect(events.filter((e) => e.kind === 'turn-end').map((e) => e.outcome)).toEqual([
      'done',
      'done'
    ])
  })

  it('a process that dies mid-turn fails the turn; the next message starts it again', async () => {
    const s = session(
      async function* (_o, _t, turn) {
        if (turn.index === 0) yield text('Working')
        else yield success
      },
      {},
      { endAfterTurns: 1 }
    )
    await s.send('one').done
    expect(events.at(-1)).toMatchObject({ kind: 'turn-end', outcome: 'failed', error: CRASH_ERROR })
    await s.send('two').done
    expect(calls).toHaveLength(2)
  })

  it('asks permission only for risky tools and denies when the user says no', async () => {
    requestPermission.mockResolvedValue(false)
    let results: unknown[] = []
    const s = session(async function* (o) {
      const opts = { signal, toolUseID: 'tu1', requestId: 'sdk-req' }
      results = [
        await o.canUseTool!('Bash', { command: 'rm -rf build' }, opts),
        await o.canUseTool!('Bash', { command: 'npm test' }, opts)
      ]
      yield success
    })
    await s.send('x').done
    expect(results).toEqual([
      { behavior: 'deny', message: DENY_MESSAGE },
      { behavior: 'allow', updatedInput: { command: 'npm test' } }
    ])
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(requestPermission.mock.calls[0][0]).toMatchObject({
      kind: 'permission',
      title: 'Allow this command?'
    })
  })

  it('shows the permission question in the conversation and allows when the user agrees', async () => {
    requestPermission.mockResolvedValue(true)
    const s = session(async function* (o) {
      const r = await o.canUseTool!(
        'Bash',
        { command: 'rm -rf build' },
        { signal, toolUseID: 'tu1', requestId: 'r' }
      )
      yield text(r!.behavior)
      yield success
    })
    await s.send('Clean up').done
    expect(kinds()).toEqual(['permission', 'text', 'turn-end'])
    expect(events[0]).toMatchObject({ title: 'Allow this command?', detail: 'rm -rf build' })
    expect(events[1]).toMatchObject({ text: 'allow' })
  })

  it('a denied command closes its card as failed', async () => {
    requestPermission.mockResolvedValue(false)
    const s = session(async function* (o) {
      const input = { command: 'rm -rf build' }
      await pre(o, 'Bash', input, 'tu1')
      await o.canUseTool!('Bash', input, { signal, toolUseID: 'tu1', requestId: 'r' })
      yield success
    })
    await s.send('Clean up').done
    const changes = events.filter((e) => e.kind === 'change')
    expect(changes.map((e) => e.change.phase)).toEqual(['start', 'failed'])
  })

  it('turns TaskCreate / TaskUpdate into task events', async () => {
    const s = session(async function* (o) {
      await post(
        o,
        'TaskCreate',
        { subject: 'Create table', activeForm: 'Creating table' },
        { task: { id: '1', subject: 'Create table' } },
        'a'
      )
      await post(o, 'TaskUpdate', { taskId: '1', status: 'in_progress' }, { success: true }, 'b')
      await post(
        o,
        'TaskUpdate',
        { taskId: '1', subject: 'Create the table' },
        { success: true },
        'c'
      )
      yield success
    })
    await s.send('x').done
    expect(events.filter((e) => e.kind === 'task')).toEqual([
      expect.objectContaining({
        taskId: '1',
        subject: 'Create table',
        activeForm: 'Creating table',
        status: 'pending'
      }),
      expect.objectContaining({
        taskId: '1',
        subject: null,
        activeForm: null,
        status: 'in_progress'
      }),
      expect.objectContaining({ taskId: '1', subject: 'Create the table', status: 'in_progress' })
    ])
  })

  it('turns a TodoWrite list into task events', async () => {
    const s = session(async function* (o) {
      const todos = [
        { content: 'Plan', status: 'completed', activeForm: 'Planning' },
        { content: 'Build', status: 'in_progress', activeForm: 'Building' }
      ]
      await post(o, 'TodoWrite', { todos }, {}, 'a')
      await post(o, 'TodoWrite', { todos: todos.slice(0, 1) }, {}, 'b')
      yield success
    })
    await s.send('x').done
    const taskEvents = events.flatMap((e) =>
      e.kind === 'task' ? [[e.taskId, e.subject, e.status]] : []
    )
    expect(taskEvents).toEqual([
      ['todo:0', 'Plan', 'completed'],
      ['todo:1', 'Build', 'in_progress'],
      ['todo:0', 'Plan', 'completed'],
      ['todo:1', null, 'deleted']
    ])
  })

  it('stop() interrupts the turn, ends it as stopped and keeps the process for the next one', async () => {
    const s = session(async function* (_o, _t, turn) {
      if (turn.index === 0) {
        yield text('Working')
        await turn.interrupted
      }
      yield success
    })
    const { done } = s.send('long job')
    await new Promise((r) => setTimeout(r, 0))
    s.stop()
    await done
    expect(fakes[0].interrupt).toHaveBeenCalled()
    expect(events.at(-1)).toMatchObject({ kind: 'turn-end', outcome: 'stopped', error: null })
    await s.send('next').done
    expect(calls).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ outcome: 'done' })
  })

  it('when Claude Code does not confirm a stop, the turn ends anyway and the process restarts', async () => {
    const s = session(
      async function* (_o, t) {
        if (t === 'stuck') await new Promise(() => {})
        yield success
      },
      { stopGraceMs: 20 },
      { ignoreInterrupt: true }
    )
    const { done } = s.send('stuck')
    await new Promise((r) => setTimeout(r, 0))
    s.stop()
    await done
    expect(events.at(-1)).toMatchObject({ outcome: 'stopped' })
    expect(fakes[0].close).toHaveBeenCalled()
    await s.send('again').done
    expect(calls).toHaveLength(2)
    expect(calls[1].options.resume).toBe('s1')
  })

  it('stop() while a permission question is open denies it', async () => {
    requestPermission.mockReturnValue(new Promise(() => {}))
    let result: unknown
    const s = session(async function* (o) {
      result = await o.canUseTool!(
        'Bash',
        { command: 'rm -rf build' },
        { signal, toolUseID: 'tu1', requestId: 'r' }
      )
      yield success
    })
    const { done } = s.send('Clean up')
    await new Promise((r) => setTimeout(r, 0))
    s.stop()
    await done
    expect(result).toEqual({ behavior: 'deny', message: DENY_MESSAGE })
    expect(events.at(-1)).toMatchObject({ outcome: 'stopped' })
  })

  it('tells the user to sign in when Claude Code is not signed in', async () => {
    const s = session(async function* () {
      yield {
        type: 'assistant',
        error: 'authentication_failed',
        message: { content: [] },
        parent_tool_use_id: null
      }
      yield {
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Not logged in · Please run /login'
      }
    })
    await s.send('x').done
    expect(events.at(-1)).toMatchObject({ outcome: 'failed', error: SIGN_IN_ERROR })
  })

  it('a sign-in problem that crashes the process also asks to sign in', async () => {
    const s = session(async function* () {
      yield text('')
      throw new Error('401 Invalid authentication credentials')
    })
    await s.send('x').done
    expect(events.at(-1)).toMatchObject({
      kind: 'turn-end',
      outcome: 'failed',
      error: SIGN_IN_ERROR
    })
  })

  it('other failures keep the first line of the message', async () => {
    const s = session(async function* () {
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['Disk is full\nat foo']
      }
    })
    await s.send('x').done
    expect(events.at(-1)).toMatchObject({
      outcome: 'failed',
      error: 'Something went wrong: Disk is full'
    })
  })

  it('configure() switches the model of the running process and of later ones', async () => {
    const s = session(
      async function* () {
        yield success
      },
      {},
      { endAfterTurns: 1 }
    )
    const first = s.send('one')
    s.configure({ model: 'claude-sonnet-5-5' })
    await first.done
    expect(fakes[0].setModel).toHaveBeenCalledWith('claude-sonnet-5-5')
    await new Promise((r) => setTimeout(r, 0))
    await s.send('two').done
    expect(calls[1].options.model).toBe('claude-sonnet-5-5')
  })

  it('close() ends the running turn and the process', async () => {
    const s = session(async function* () {
      await new Promise(() => {})
      yield success
    })
    const { done } = s.send('a')
    s.close()
    await done
    expect(events.at(-1)).toMatchObject({ outcome: 'stopped' })
    expect(fakes[0].close).toHaveBeenCalled()
    expect(s.running).toBe(false)
  })

  it('refuses a second send while running', () => {
    const s = session(async function* () {
      await new Promise(() => {})
      yield success
    })
    s.send('a')
    expect(s.running).toBe(true)
    expect(() => s.send('b')).toThrow('Claude is still working.')
  })
})
