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
  // What the command did to the data in the project's databases, updated while it runs.
  tables: TableChange[]
}

export interface ActivityChange {
  type: 'activity'
  items: string[]
}

// One row of a database table. Cells follow TableChange.columns.
export interface TableRow {
  key: string
  // 'same' rows are shown for context, for example while a new column fills in.
  kind: 'added' | 'changed' | 'removed' | 'same'
  cells: (string | null)[]
  // Cells of existing columns whose value changed.
  changedCells: number[]
  // Cells of new columns that received a value.
  filledCells: number[]
}

export interface TableChange {
  type: 'table'
  database: string
  table: string
  status: 'created' | 'modified' | 'deleted'
  columns: string[]
  // Declared column types, lowercase ('' when a column has none).
  types: string[]
  newColumns: string[]
  // The SQL that created the table or added its new columns.
  schema: string | null
  rows: TableRow[]
  added: number
  changed: number
  removed: number
  filled: number
  // Changed rows that are not in `rows`, to keep big changes light.
  moreRows: number
  totalRows: number
}

export type Change = FileChange | CommandChange | ActivityChange

// 'progress' updates a card that is still working, for example while a command runs.
export interface VisualChange {
  id: string
  toolUseId: string
  targetKey: string
  phase: 'start' | 'progress' | 'done' | 'failed'
  change: Change
}

export type AppEvent =
  | { kind: 'text'; turnId: string; at: number; text: string }
  | { kind: 'thinking'; turnId: string; at: number; text: string }
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
  | {
      kind: 'permission'
      turnId: string
      at: number
      requestId: string
      title: string
      detail: string
    }
  | {
      kind: 'turn-end'
      turnId: string
      at: number
      outcome: 'done' | 'failed' | 'stopped'
      error: string | null
    }
