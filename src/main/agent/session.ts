import type {
  CanUseTool,
  HookCallback,
  HookInput,
  Options,
  PermissionResult,
  Query,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import type { AppEvent, ModelId, TaskStatus } from '../../shared/types'
import { claudeEnv } from '../claude/env'
import { ToolObserver } from '../observers/registry'
import { PLAIN_LANGUAGE_APPEND } from './prompt'
import { classifyRisk } from './risk'

export type QueryFn = typeof import('@anthropic-ai/claude-agent-sdk').query

export interface AgentSessionDeps {
  queryFn: QueryFn
  projectDir: string
  model: ModelId
  // The Claude Code binary to run; null lets the SDK find its own.
  claudePath: string | null
  // Environment Claude Code starts from; see claudeEnv for what is left out.
  env?: NodeJS.ProcessEnv
  emit(e: AppEvent): void
  requestPermission(e: Extract<AppEvent, { kind: 'permission' }>): Promise<boolean>
  now(): number
  newId(): string
  stopGraceMs?: number
}

export const SIGN_IN_ERROR = "Claude Code isn't signed in. Sign in from Settings."
export const CRASH_ERROR = 'Claude Code stopped unexpectedly. Send your message again to continue.'
export const DENY_MESSAGE = 'The user stopped this action.'
// How long Claude Code gets to confirm a stop before its process is ended.
export const STOP_GRACE_MS = 5000

type Rec = Record<string, unknown>
// Every AppEvent kind without the fields the session stamps on (turnId, at).
type EventBody = AppEvent extends infer E
  ? E extends AppEvent
    ? Omit<E, 'turnId' | 'at'>
    : never
  : never

const TASK_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed', 'deleted']
const SIGN_IN_PROBLEM =
  /not logged in|\/login|401|authentication|invalid api key|invalid x-api-key/i

function rec(v: unknown): Rec {
  return v !== null && typeof v === 'object' ? (v as Rec) : {}
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

function taskStatus(v: unknown): TaskStatus | null {
  return TASK_STATUSES.includes(v as TaskStatus) ? (v as TaskStatus) : null
}

// The messages the user types, as one stream that stays open for the whole conversation.
class InputStream implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = []
  private waiting: ((r: IteratorResult<SDKUserMessage>) => void) | null = null
  private closed = false

  push(text: string): void {
    const message: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null
    }
    if (this.waiting) {
      this.waiting({ value: message, done: false })
      this.waiting = null
    } else {
      this.queue.push(message)
    }
  }

  close(): void {
    this.closed = true
    this.waiting?.({ value: undefined, done: true })
    this.waiting = null
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const next = this.queue.shift()
        if (next) return Promise.resolve({ value: next, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.waiting = resolve))
      }
    }
  }
}

// One running Claude Code process.
interface Proc {
  query: Query
  input: InputStream
  abort: AbortController
}

interface Turn {
  id: string
  proc: Proc
  // Aborted when the turn ends or is stopped, so open permission questions answer no.
  abort: AbortController
  stopping: boolean
  authFailed: boolean
  ended: boolean
  stopTimer: ReturnType<typeof setTimeout> | null
  finish(): void
}

// Runs Claude Code in the background, signed in the way the user set Claude Code up.
// One process serves the whole conversation: messages stream in, answers and tool
// activity stream out. If the process ends, the next message starts it again and
// resumes the same conversation.
export class AgentSession {
  private proc: Proc | null = null
  private turn: Turn | null = null
  private sessionId: string | undefined
  private observer: ToolObserver
  private taskStatuses = new Map<string, TaskStatus>()
  private todoCount = 0

  constructor(private deps: AgentSessionDeps) {
    this.observer = new ToolObserver({ projectDir: deps.projectDir, newId: deps.newId })
  }

  get running(): boolean {
    return this.turn !== null
  }

  send(text: string): { turnId: string; done: Promise<void> } {
    if (this.turn) throw new Error('Claude is still working.')
    const proc = this.proc ?? this.start()
    let finish!: () => void
    const done = new Promise<void>((resolve) => (finish = resolve))
    const turn: Turn = {
      id: this.deps.newId(),
      proc,
      abort: new AbortController(),
      stopping: false,
      authFailed: false,
      ended: false,
      stopTimer: null,
      finish
    }
    this.turn = turn
    proc.input.push(text)
    return { turnId: turn.id, done }
  }

  stop(): void {
    const turn = this.turn
    if (!turn || turn.stopping) return
    turn.stopping = true
    turn.abort.abort()
    Promise.resolve()
      .then(() => turn.proc.query.interrupt())
      .catch(() => {})
    turn.stopTimer = setTimeout(() => {
      // Claude Code did not confirm the stop; end its process and start fresh next time.
      this.shutdown(turn.proc)
      this.endTurn(turn, 'stopped', null)
    }, this.deps.stopGraceMs ?? STOP_GRACE_MS)
  }

  // A new model applies right away to the running process and to any later one.
  configure(patch: { model: ModelId }): void {
    this.deps = { ...this.deps, ...patch }
    const proc = this.proc
    if (proc) {
      Promise.resolve()
        .then(() => proc.query.setModel(patch.model))
        .catch(() => {})
    }
  }

  // Ends the background process, for example when another project is opened.
  close(): void {
    const turn = this.turn
    if (this.proc) this.shutdown(this.proc)
    if (turn) this.endTurn(turn, 'stopped', null)
  }

  private start(): Proc {
    const proc = { input: new InputStream(), abort: new AbortController() } as Proc
    proc.query = this.deps.queryFn({ prompt: proc.input, options: this.options(proc) })
    this.proc = proc
    void this.pump(proc)
    return proc
  }

  private shutdown(proc: Proc): void {
    if (this.proc === proc) this.proc = null
    proc.input.close()
    proc.abort.abort()
    try {
      proc.query.close()
    } catch {
      // already closed
    }
  }

  private async pump(proc: Proc): Promise<void> {
    let failure: string | null = null
    try {
      for await (const message of proc.query) this.handle(proc, message as Rec)
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
    }
    if (this.proc === proc) this.proc = null
    // The process is gone: a turn still waiting for its answer ends here.
    const turn = this.current(proc)
    if (!turn) return
    if (turn.stopping) this.endTurn(turn, 'stopped', null)
    else this.endTurn(turn, 'failed', failure ? this.failureMessage(turn, failure) : CRASH_ERROR)
  }

  private handle(proc: Proc, m: Rec): void {
    if (m.type === 'system' && m.subtype === 'init') {
      this.sessionId = str(m.session_id) ?? this.sessionId
      return
    }
    const turn = this.current(proc)
    if (!turn) return
    if (m.type === 'stream_event' && m.parent_tool_use_id == null) {
      const event = rec(m.event)
      const delta = rec(event.delta)
      if (event.type !== 'content_block_delta') return
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        this.emit(turn, { kind: 'text', text: delta.text })
      } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        this.emit(turn, { kind: 'thinking', text: delta.thinking })
      }
    } else if (m.type === 'assistant' && m.error === 'authentication_failed') {
      turn.authFailed = true
    } else if (m.type === 'result') {
      if (turn.stopping) {
        this.endTurn(turn, 'stopped', null)
      } else if (m.subtype !== 'success' || m.is_error === true) {
        const detail =
          str(m.result) ?? (Array.isArray(m.errors) ? str(m.errors[0]) : null) ?? String(m.subtype)
        this.endTurn(turn, 'failed', this.failureMessage(turn, detail))
      } else {
        this.endTurn(turn, 'done', null)
      }
    }
  }

  // The turn in progress, if it belongs to this process.
  private current(proc: Proc): Turn | null {
    const turn = this.turn
    return turn && turn.proc === proc && !turn.ended ? turn : null
  }

  private failureMessage(turn: Turn, text: string): string {
    if (turn.authFailed || SIGN_IN_PROBLEM.test(text)) return SIGN_IN_ERROR
    const firstLine = text.split('\n')[0].trim()
    return `Something went wrong: ${firstLine || 'unknown error'}`
  }

  private endTurn(turn: Turn, outcome: 'done' | 'failed' | 'stopped', error: string | null): void {
    if (turn.ended) return
    turn.ended = true
    if (turn.stopTimer) clearTimeout(turn.stopTimer)
    turn.abort.abort()
    if (this.turn === turn) this.turn = null
    this.emit(turn, { kind: 'turn-end', outcome, error })
    turn.finish()
  }

  private emit(turn: Turn, body: EventBody): void {
    this.deps.emit({ ...body, turnId: turn.id, at: this.deps.now() } as AppEvent)
  }

  private emitFor(proc: Proc, body: EventBody): void {
    const turn = this.current(proc)
    if (turn) this.emit(turn, body)
  }

  private options(proc: Proc): Options {
    const hook =
      (handle: (input: HookInput, toolUseId: string) => Promise<void>): HookCallback =>
      async (input, toolUseId) => {
        // A broken observer must never block the agent.
        try {
          await handle(input, toolUseId ?? (rec(input).tool_use_id as string))
        } catch (err) {
          console.error('[narro] hook failed', err)
        }
        return { continue: true }
      }

    return {
      cwd: this.deps.projectDir,
      model: this.deps.model,
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: PLAIN_LANGUAGE_APPEND },
      env: { ...claudeEnv(this.deps.env), CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' },
      ...(this.deps.claudePath ? { pathToClaudeCodeExecutable: this.deps.claudePath } : {}),
      abortController: proc.abort,
      permissionMode: 'default',
      ...(this.sessionId ? { resume: this.sessionId } : {}),
      hooks: {
        PreToolUse: [
          {
            hooks: [
              hook(async (input, id) => {
                if (input.hook_event_name !== 'PreToolUse') return
                const changes = await this.observer.before(
                  id,
                  input.tool_name,
                  rec(input.tool_input)
                )
                for (const change of changes) this.emitFor(proc, { kind: 'change', change })
              })
            ]
          }
        ],
        PostToolUse: [
          {
            hooks: [
              hook(async (input, id) => {
                if (input.hook_event_name !== 'PostToolUse') return
                const toolInput = rec(input.tool_input)
                const changes = await this.observer.after(
                  id,
                  input.tool_name,
                  toolInput,
                  input.tool_response,
                  input.duration_ms ?? null,
                  false
                )
                for (const change of changes) this.emitFor(proc, { kind: 'change', change })
                this.emitTasks(proc, input.tool_name, toolInput, input.tool_response)
              })
            ]
          }
        ],
        PostToolUseFailure: [
          {
            hooks: [
              hook(async (input, id) => {
                if (input.hook_event_name !== 'PostToolUseFailure') return
                const changes = await this.observer.after(
                  id,
                  input.tool_name,
                  rec(input.tool_input),
                  undefined,
                  input.duration_ms ?? null,
                  true
                )
                for (const change of changes) this.emitFor(proc, { kind: 'change', change })
              })
            ]
          }
        ]
      },
      canUseTool: this.canUseTool(proc)
    }
  }

  private canUseTool(proc: Proc): CanUseTool {
    return async (toolName, input, opts): Promise<PermissionResult> => {
      const risk = classifyRisk(toolName, input, this.deps.projectDir)
      if (!risk.risky) return { behavior: 'allow', updatedInput: input }

      const turn = this.current(proc)
      let allowed = false
      if (turn && !turn.stopping) {
        const request = {
          kind: 'permission' as const,
          turnId: turn.id,
          at: this.deps.now(),
          requestId: this.deps.newId(),
          title: risk.title,
          detail: risk.detail
        }
        this.deps.emit(request)
        allowed = await this.decision(request, [opts.signal, turn.abort.signal])
      }
      if (allowed) return { behavior: 'allow', updatedInput: input }

      // The tool never runs, so close the card PreToolUse may already have opened.
      if (opts.toolUseID) {
        const changes = await this.observer.after(
          opts.toolUseID,
          toolName,
          input,
          undefined,
          null,
          true
        )
        for (const change of changes) this.emitFor(proc, { kind: 'change', change })
      }
      return { behavior: 'deny', message: DENY_MESSAGE }
    }
  }

  // Resolves with the user's answer, or false as soon as the turn is stopped.
  private decision(
    request: Extract<AppEvent, { kind: 'permission' }>,
    signals: AbortSignal[]
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (signals.some((s) => s.aborted)) return resolve(false)
      for (const s of signals) s.addEventListener('abort', () => resolve(false), { once: true })
      this.deps.requestPermission(request).then(resolve, () => resolve(false))
    })
  }

  private emitTasks(proc: Proc, toolName: string, input: Rec, response: unknown): void {
    const task = (
      taskId: string,
      subject: string | null,
      activeForm: string | null,
      status: TaskStatus
    ): void => {
      if (status === 'deleted') this.taskStatuses.delete(taskId)
      else this.taskStatuses.set(taskId, status)
      this.emitFor(proc, { kind: 'task', taskId, subject, activeForm, status })
    }

    if (toolName === 'TaskCreate') {
      const created = rec(rec(response).task)
      const id = str(created.id) ?? (typeof created.id === 'number' ? String(created.id) : null)
      if (!id) return
      task(
        id,
        str(input.subject) ?? str(created.subject),
        str(input.activeForm) ?? str(input.active_form),
        'pending'
      )
    } else if (toolName === 'TaskUpdate') {
      const raw = input.taskId ?? input.id ?? input.task_id
      const id = typeof raw === 'number' ? String(raw) : str(raw)
      if (!id) return
      const status = taskStatus(input.status) ?? this.taskStatuses.get(id) ?? 'pending'
      task(id, str(input.subject), str(input.activeForm) ?? str(input.active_form), status)
    } else if (toolName === 'TodoWrite') {
      // TodoWrite always sends the whole list; its items have no ids, so their position is the id.
      const todos = Array.isArray(input.todos) ? input.todos.map(rec) : []
      todos.forEach((todo, i) =>
        task(
          `todo:${i}`,
          str(todo.content),
          str(todo.activeForm),
          taskStatus(todo.status) ?? 'pending'
        )
      )
      for (let i = todos.length; i < this.todoCount; i++) task(`todo:${i}`, null, null, 'deleted')
      this.todoCount = todos.length
    }
  }
}
