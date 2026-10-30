import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Options, Query } from '@anthropic-ai/claude-agent-sdk'
import type { AppEvent } from '../../shared/types'

type PermissionEvent = Extract<AppEvent, { kind: 'permission' }>
import { PLAIN_LANGUAGE_APPEND } from './prompt'
import { AgentSession, AUTH_ERROR, DENY_MESSAGE, type QueryFn } from './session'

type Script = (o: Options) => AsyncGenerator<unknown, void>

let tmp: string
let events: AppEvent[]
let calls: { prompt: string; options: Options }[]
let requestPermission: ReturnType<typeof vi.fn<(e: PermissionEvent) => Promise<boolean>>>

function fakeQuery(script: Script): QueryFn {
  return ((params: { prompt: string; options: Options }) => {
    calls.push({ prompt: params.prompt, options: params.options })
    return script(params.options) as unknown as Query
  }) as unknown as QueryFn
}

function session(script: Script): AgentSession {
  let n = 0
  return new AgentSession({
    queryFn: fakeQuery(script),
    projectDir: tmp,
    apiKey: 'sk-ant-test',
    model: 'claude-opus-5-5',
    emit: (e) => events.push(e),
    requestPermission,
    now: () => 1000,
    newId: () => `id${++n}`
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

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'session-'))
  events = []
  calls = []
  requestPermission = vi.fn<(e: PermissionEvent) => Promise<boolean>>()
})

describe('AgentSession', () => {
  it('streams text, emits file changes in order and ends the turn', async () => {
    const s = session(async function* (o) {
      yield init
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
    expect(events.map((e) => (e.kind === 'change' ? `change:${e.change.phase}` : e.kind))).toEqual([
      'text',
      'change:start',
      'change:done',
      'text',
      'turn-end'
    ])
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
    expect(events.map((e) => e.kind)).toEqual(['turn-end'])
  })

  it('passes model, key, todo flag and the plain-language append; resumes on the next turn', async () => {
    const s = session(async function* () {
      yield init
      yield success
    })
    await s.send('one').done
    await s.send('two').done
    expect(calls[0].prompt).toBe('one')
    expect(calls[0].options).toMatchObject({
      model: 'claude-opus-5-5',
      cwd: tmp,
      includePartialMessages: true,
      permissionMode: 'default',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: PLAIN_LANGUAGE_APPEND }
    })
    expect(calls[0].options.env).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      CLAUDE_CODE_ENABLE_TODO_TOOLS: '1'
    })
    expect(calls[0].options.resume).toBeUndefined()
    expect(calls[1].options.resume).toBe('s1')
  })

  it('never passes inherited Anthropic or Claude Code settings to the agent', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://proxy.example')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'other-token')
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'oauth')
    vi.stubEnv('NARRO_TEST_KEEP', 'yes')
    const s = session(async function* () {
      yield success
    })
    await s.send('x').done
    vi.unstubAllEnvs()
    const env = calls[0].options.env!
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(env.NARRO_TEST_KEEP).toBe('yes')
    expect(env.PATH).toBe(process.env.PATH)
  })

  it('asks permission only for risky tools and denies when the user says no', async () => {
    requestPermission.mockResolvedValue(false)
    const s = session(async function* () {
      yield success
    })
    await s.send('x').done
    const canUseTool = calls[0].options.canUseTool!
    const opts = { signal, toolUseID: 'tu1', requestId: 'sdk-req' }
    expect(await canUseTool('Bash', { command: 'rm -rf build' }, opts)).toEqual({
      behavior: 'deny',
      message: DENY_MESSAGE
    })
    expect(await canUseTool('Bash', { command: 'npm test' }, opts)).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'npm test' }
    })
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
    expect(events.map((e) => e.kind)).toEqual(['permission', 'text', 'turn-end'])
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
    const taskEvents = events.filter((e) => e.kind === 'task')
    expect(taskEvents).toEqual([
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
    const taskEvents = events
      .filter((e) => e.kind === 'task')
      .map((e) => [e.taskId, e.subject, e.status])
    expect(taskEvents).toEqual([
      ['todo:0', 'Plan', 'completed'],
      ['todo:1', 'Build', 'in_progress'],
      ['todo:0', 'Plan', 'completed'],
      ['todo:1', null, 'deleted']
    ])
  })

  it('stop() aborts the turn and ends it as stopped', async () => {
    const s = session(async function* (o) {
      yield init
      await new Promise((_, reject) =>
        o.abortController!.signal.addEventListener('abort', () => reject(new Error('aborted')))
      )
    })
    const { done } = s.send('long job')
    await new Promise((r) => setTimeout(r, 0))
    s.stop()
    await done
    expect(events.at(-1)).toMatchObject({ kind: 'turn-end', outcome: 'stopped', error: null })
  })

  it('stop() while a permission question is open denies it', async () => {
    requestPermission.mockReturnValue(new Promise(() => {}))
    let result: unknown
    const s = session(async function* (o) {
      result = await o.canUseTool!(
        'Bash',
        { command: 'rm -rf build' },
        { signal: o.abortController!.signal, toolUseID: 'tu1', requestId: 'r' }
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

  it('maps an authentication failure to AUTH_ERROR', async () => {
    const s = session(async function* () {
      yield init
      throw new Error('401 invalid x-api-key')
    })
    await s.send('x').done
    expect(events.at(-1)).toMatchObject({ kind: 'turn-end', outcome: 'failed', error: AUTH_ERROR })
  })

  it('maps an authentication_failed result to AUTH_ERROR', async () => {
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
        result: 'Invalid API key · Fix external API key'
      }
    })
    await s.send('x').done
    expect(events.at(-1)).toMatchObject({ outcome: 'failed', error: AUTH_ERROR })
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

  it('configure() changes the key and model for the next turn', async () => {
    const s = session(async function* () {
      yield init
      yield success
    })
    await s.send('one').done
    s.configure({ apiKey: 'sk-ant-new', model: 'claude-sonnet-5-5' })
    await s.send('two').done
    expect(calls[1].options).toMatchObject({ model: 'claude-sonnet-5-5', resume: 's1' })
    expect(calls[1].options.env).toMatchObject({ ANTHROPIC_API_KEY: 'sk-ant-new' })
  })

  it('refuses a second send while running', () => {
    const s = session(async function* () {
      await new Promise(() => {})
    })
    s.send('a')
    expect(s.running).toBe(true)
    expect(() => s.send('b')).toThrow('Claude is still working.')
  })
})
