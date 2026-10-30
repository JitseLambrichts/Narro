export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5'
export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'

export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'gap'
  text: string
}

export interface FileChange {
  type: 'file'
  path: string
  status: 'created' | 'modified' | 'deleted'
  lines: DiffLine[]
  added: number
  removed: number
  tooLarge: boolean
}

export interface CommandChange {
  type: 'command'
  command: string
  description: string | null
  status: 'running' | 'done' | 'failed'
  durationMs: number | null
  changedFiles: string[]
  outputTail: string[]
}

export interface ActivityChange {
  type: 'activity'
  items: string[]
}

export type Change = FileChange | CommandChange | ActivityChange

export interface VisualChange {
  id: string
  toolUseId: string
  targetKey: string
  phase: 'start' | 'done' | 'failed'
  change: Change
}

export type AppEvent =
  | { kind: 'text'; turnId: string; at: number; text: string }
  | { kind: 'change'; turnId: string; at: number; change: VisualChange }
  | {
      kind: 'task'
      turnId: string
      at: number
      taskId: string
      subject: string | null
      activeForm: string | null
      status: TaskStatus
    }
  | { kind: 'permission'; turnId: string; at: number; requestId: string; title: string; detail: string }
  | {
      kind: 'turn-end'
      turnId: string
      at: number
      outcome: 'done' | 'failed' | 'stopped'
      error: string | null
    }
