import type {
  CanUseTool,
  HookCallback,
  HookInput,
  Options,
  PermissionResult
} from '@anthropic-ai/claude-agent-sdk'
import type { AppEvent, ModelId, TaskStatus } from '../../shared/types'
import { ToolObserver } from '../observers/registry'
import { PLAIN_LANGUAGE_APPEND } from './prompt'
import { classifyRisk } from './risk'

export type QueryFn = typeof import('@anthropic-ai/claude-agent-sdk').query

export interface AgentSessionDeps {
  queryFn: QueryFn
  projectDir: string
  apiKey: string
  model: ModelId
  emit(e: AppEvent): void
  requestPermission(e: Extract<AppEvent, { kind: 'permission' }>): Promise<boolean>
  now(): number
  newId(): string
}

export const AUTH_ERROR = "Claude couldn't verify your API key. Check it in Settings."
export const DENY_MESSAGE = 'The user stopped this action.'

type Rec = Record<string, unknown>
// Every AppEvent kind without the fields the session stamps on (turnId, at).
type EventBody = AppEvent extends infer E
  ? E extends AppEvent
    ? Omit<E, 'turnId' | 'at'>
    : never
  : never

const TASK_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed', 'deleted']

function rec(v: unknown): Rec {
  return v !== null && typeof v === 'object' ? (v as Rec) : {}
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

function taskStatus(v: unknown): TaskStatus | null {
  return TASK_STATUSES.includes(v as TaskStatus) ? (v as TaskStatus) : null
}

// The agent runs on the user's own key only: inherited Anthropic or Claude Code settings
// (another login, a proxy URL, a token) would silently take its place.
function agentEnv(apiKey: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(ANTHROPIC_|CLAUDE)/.test(key)) env[key] = value
  }
  return { ...env, ANTHROPIC_API_KEY: apiKey, CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' }
}

function failureMessage(text: string): string {
  if (/401|authentication|invalid x-api-key|invalid api key/i.test(text)) return AUTH_ERROR
  const firstLine = text.split('\n')[0].trim()
  return `Something went wrong: ${firstLine || 'unknown error'}`
}

interface Turn {
  id: string
  abort: AbortController
}

export class AgentSession {
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

  // A new key or model applies from the next turn on; the conversation itself continues.
  configure(patch: { apiKey?: string; model?: ModelId }): void {
    this.deps = { ...this.deps, ...patch }
  }

  send(text: string): { turnId: string; done: Promise<void> } {
    if (this.turn) throw new Error('Claude is still working.')
    const turn: Turn = { id: this.deps.newId(), abort: new AbortController() }
    this.turn = turn
    const done = this.run(text, turn).finally(() => {
      this.turn = null
    })
    return { turnId: turn.id, done }
  }

  stop(): void {
    this.turn?.abort.abort()
  }

  private emit(turn: Turn, body: EventBody): void {
    this.deps.emit({ ...body, turnId: turn.id, at: this.deps.now() } as AppEvent)
  }

  private async run(prompt: string, turn: Turn): Promise<void> {
    let outcome: 'done' | 'failed' | 'stopped' = 'done'
    let error: string | null = null
    let authFailed = false

    try {
      const q = this.deps.queryFn({ prompt, options: this.options(turn) })
      for await (const message of q) {
        const m = message as Rec
        if (m.type === 'system' && m.subtype === 'init') {
          this.sessionId ??= str(m.session_id) ?? undefined
        } else if (m.type === 'stream_event' && m.parent_tool_use_id == null) {
          const event = rec(m.event)
          const delta = rec(event.delta)
          if (
            event.type === 'content_block_delta' &&
            delta.type === 'text_delta' &&
            typeof delta.text === 'string'
          ) {
            this.emit(turn, { kind: 'text', text: delta.text })
          }
        } else if (m.type === 'assistant' && m.error === 'authentication_failed') {
          authFailed = true
        } else if (m.type === 'result' && (m.subtype !== 'success' || m.is_error === true)) {
          outcome = 'failed'
          const detail =
            str(m.result) ??
            (Array.isArray(m.errors) ? str(m.errors[0]) : null) ??
            String(m.subtype)
          error = authFailed ? AUTH_ERROR : failureMessage(detail)
        }
      }
    } catch (err) {
      outcome = 'failed'
      error = authFailed
        ? AUTH_ERROR
        : failureMessage(err instanceof Error ? err.message : String(err))
    }

    if (turn.abort.signal.aborted) {
      outcome = 'stopped'
      error = null
    }
    this.emit(turn, { kind: 'turn-end', outcome, error })
  }

  private options(turn: Turn): Options {
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
      env: agentEnv(this.deps.apiKey),
      abortController: turn.abort,
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
                for (const change of changes) this.emit(turn, { kind: 'change', change })
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
                for (const change of changes) this.emit(turn, { kind: 'change', change })
                this.emitTasks(turn, input.tool_name, toolInput, input.tool_response)
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
                for (const change of changes) this.emit(turn, { kind: 'change', change })
              })
            ]
          }
        ]
      },
      canUseTool: this.canUseTool(turn)
    }
  }

  private canUseTool(turn: Turn): CanUseTool {
    return async (toolName, input, opts): Promise<PermissionResult> => {
      const risk = classifyRisk(toolName, input, this.deps.projectDir)
      if (!risk.risky) return { behavior: 'allow', updatedInput: input }

      const request = {
        kind: 'permission' as const,
        turnId: turn.id,
        at: this.deps.now(),
        requestId: this.deps.newId(),
        title: risk.title,
        detail: risk.detail
      }
      this.deps.emit(request)
      const allowed = await this.decision(request, [opts.signal, turn.abort.signal])
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
        for (const change of changes) this.emit(turn, { kind: 'change', change })
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

  private emitTasks(turn: Turn, toolName: string, input: Rec, response: unknown): void {
    const task = (
      taskId: string,
      subject: string | null,
      activeForm: string | null,
      status: TaskStatus
    ): void => {
      if (status === 'deleted') this.taskStatuses.delete(taskId)
      else this.taskStatuses.set(taskId, status)
      this.emit(turn, { kind: 'task', taskId, subject, activeForm, status })
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
