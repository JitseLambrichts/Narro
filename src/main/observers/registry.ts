import { promises as fs } from 'fs'
import { basename, isAbsolute, relative, resolve, sep } from 'path'
import type { CommandChange, FileChange, TableChange, VisualChange } from '../../shared/types'
import { fileChange, readSnapshot, type FileSnapshot } from './files'
import { changedPaths, indexProject, type ProjectIndex } from './projectIndex'
import { databaseFor, MAX_DATABASES, readDatabase, tableChanges, type DbSnapshot } from './sqlite'

export const FILE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']
export const TASK_TOOLS = ['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TodoWrite']

const OUTPUT_TAIL_LINES = 5

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

export function activityLabel(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read': {
      const file = str(input.file_path)
      return file ? `Read ${basename(file)}` : 'Read a file'
    }
    case 'Grep':
      return `Searched for “${str(input.pattern) ?? ''}”`
    case 'Glob':
      return `Looked for ${str(input.pattern) ?? 'files'}`
    case 'WebSearch':
      return `Searched the web for “${str(input.query) ?? ''}”`
    case 'WebFetch':
      try {
        return `Opened ${new URL(str(input.url) ?? '').hostname}`
      } catch {
        return 'Opened a web page'
      }
    default:
      return `Used ${toolName}`
  }
}

function outputTail(response: unknown): string[] {
  const stdout = (response as { stdout?: unknown } | null | undefined)?.stdout
  if (typeof stdout !== 'string') return []
  return stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .slice(-OUTPUT_TAIL_LINES)
}

type Pending =
  | { kind: 'file'; abs: string; rel: string; snapshot: FileSnapshot }
  | {
      kind: 'command'
      index: ProjectIndex
      startedAt: number
      databases: Map<string, DbSnapshot | null>
      // How each database file looked before the command (see stamp()).
      stamps: Map<string, string>
      // Tables in the order the command first touched them.
      tableOrder: string[]
      stopWatching(): void
    }

const MISSING: FileSnapshot = { exists: false, text: null, binary: false, tooLarge: false }

// Turns tool calls into visual changes by reading the real state of the project folder
// before and after each call.
// How often a running command's databases are checked for new rows.
export const PROGRESS_POLL_MS = 300
// A command that never reports back stops being watched after this long.
const MAX_WATCH_MS = 15 * 60_000

export interface ObserverContext {
  projectDir: string
  newId(): string
  // Receives updates of a command while it runs, such as rows appearing in a table.
  onProgress?(change: VisualChange): void
}

function commandChange(input: Record<string, unknown>): CommandChange {
  return {
    type: 'command',
    command: str(input.command) ?? '',
    description: str(input.description),
    status: 'running',
    durationMs: null,
    changedFiles: [],
    outputTail: [],
    tables: []
  }
}

export class ToolObserver {
  private pending = new Map<string, Pending>()

  constructor(private ctx: ObserverContext) {}

  // Stops watching every running command, for example when the session closes.
  dispose(): void {
    for (const state of this.pending.values()) if (state.kind === 'command') state.stopWatching()
    this.pending.clear()
  }

  private target(input: Record<string, unknown>): { abs: string; rel: string } | null {
    const file = str(input.file_path) ?? str(input.notebook_path)
    if (!file) return null
    const abs = resolve(this.ctx.projectDir, file)
    const rel = relative(this.ctx.projectDir, abs)
    // Files outside the project keep their absolute path, so the card says where they are.
    return { abs, rel: rel.startsWith('..') || isAbsolute(rel) ? abs : rel.split(sep).join('/') }
  }

  private visual(
    toolUseId: string,
    targetKey: string,
    phase: VisualChange['phase'],
    change: VisualChange['change']
  ): VisualChange {
    return { id: this.ctx.newId(), toolUseId, targetKey, phase, change }
  }

  async before(
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<VisualChange[]> {
    if (TASK_TOOLS.includes(toolName)) return []

    if (FILE_TOOLS.includes(toolName)) {
      const target = this.target(input)
      if (!target) return []
      const snapshot = await readSnapshot(target.abs)
      this.pending.set(toolUseId, { kind: 'file', ...target, snapshot })
      const change: FileChange = {
        type: 'file',
        path: target.rel,
        status: snapshot.exists ? 'modified' : 'created',
        lines: [],
        added: 0,
        removed: 0,
        tooLarge: false
      }
      return [this.visual(toolUseId, `file:${target.rel}`, 'start', change)]
    }

    if (toolName === 'Bash') {
      const index = await indexProject(this.ctx.projectDir)
      const databases = await this.readDatabases([...index.keys()])
      const stamps = new Map<string, string>()
      for (const db of databases.keys()) {
        const s = await this.stamp(db)
        if (s) stamps.set(db, s)
      }
      const state: Extract<Pending, { kind: 'command' }> = {
        kind: 'command',
        index,
        startedAt: Date.now(),
        databases,
        stamps,
        tableOrder: [],
        stopWatching: () => {}
      }
      this.pending.set(toolUseId, state)
      if (this.ctx.onProgress) state.stopWatching = this.watch(toolUseId, input, state)
      return [this.visual(toolUseId, `command:${toolUseId}`, 'start', commandChange(input))]
    }

    return [
      this.visual(toolUseId, 'activity', 'done', {
        type: 'activity',
        items: [activityLabel(toolName, input)]
      })
    ]
  }

  async after(
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>,
    response: unknown,
    durationMs: number | null,
    failed: boolean
  ): Promise<VisualChange[]> {
    const state = this.pending.get(toolUseId)
    this.pending.delete(toolUseId)
    const phase = failed ? 'failed' : 'done'

    if (FILE_TOOLS.includes(toolName)) {
      const target = state?.kind === 'file' ? state : this.target(input)
      if (!target) return []
      const before = state?.kind === 'file' ? state.snapshot : MISSING
      const change = fileChange(target.rel, before, await readSnapshot(target.abs))
      return [this.visual(toolUseId, `file:${target.rel}`, phase, change)]
    }

    if (toolName === 'Bash') {
      if (state?.kind === 'command') state.stopWatching()
      const changedFiles =
        state?.kind === 'command'
          ? changedPaths(state.index, await indexProject(this.ctx.projectDir))
          : []
      const databases = [
        ...new Set(changedFiles.map(databaseFor).filter((p): p is string => p !== null))
      ]
      const change: CommandChange = {
        ...commandChange(input),
        status: failed ? 'failed' : 'done',
        durationMs: durationMs ?? (state?.kind === 'command' ? Date.now() - state.startedAt : null),
        changedFiles,
        outputTail: outputTail(response),
        tables: state?.kind === 'command' ? await this.tableChanges(state, databases) : []
      }
      return [this.visual(toolUseId, `command:${toolUseId}`, phase, change)]
    }

    return []
  }

  // Snapshots of the SQLite databases among these project paths, keyed by relative path.
  private async readDatabases(paths: string[]): Promise<Map<string, DbSnapshot | null>> {
    const databases = [...new Set(paths.map(databaseFor).filter((p): p is string => p !== null))]
    const snapshots = new Map<string, DbSnapshot | null>()
    for (const db of databases.slice(0, MAX_DATABASES)) {
      snapshots.set(db, await readDatabase(resolve(this.ctx.projectDir, db)))
    }
    return snapshots
  }

  // What a command did to the data in these databases so far.
  private async tableChanges(
    state: Extract<Pending, { kind: 'command' }>,
    databases: string[]
  ): Promise<TableChange[]> {
    const after = await this.readDatabases(databases)
    const tables = [...after].flatMap(([db, snapshot]) => {
      const before = state.databases.get(db) ?? null
      // A database that was there but could not be read before has no baseline to compare with.
      if (before === null && state.index.has(db)) return []
      return tableChanges(db, before, snapshot)
    })
    const key = (t: TableChange): string => `${t.database}:${t.table}`
    for (const t of tables) if (!state.tableOrder.includes(key(t))) state.tableOrder.push(key(t))
    return tables.sort(
      (a, b) => state.tableOrder.indexOf(key(a)) - state.tableOrder.indexOf(key(b))
    )
  }

  // A cheap fingerprint of a database file and its write-ahead log; null when it is missing.
  private async stamp(db: string): Promise<string | null> {
    const abs = resolve(this.ctx.projectDir, db)
    try {
      const main = await fs.stat(abs)
      const wal = await fs.stat(`${abs}-wal`).catch(() => null)
      return `${main.mtimeMs}:${main.size}:${wal?.mtimeMs ?? 0}:${wal?.size ?? 0}`
    } catch {
      return null
    }
  }

  // Databases a running command may be writing: the known ones and any in the project folder.
  private async candidates(state: Extract<Pending, { kind: 'command' }>): Promise<string[]> {
    const names = await fs.readdir(this.ctx.projectDir).catch(() => [] as string[])
    const top = names.map(databaseFor).filter((p): p is string => p !== null)
    return [...new Set([...state.databases.keys(), ...top])].slice(0, MAX_DATABASES)
  }

  // While a command runs, reports what it has done to the data so far.
  private watch(
    toolUseId: string,
    input: Record<string, unknown>,
    state: Extract<Pending, { kind: 'command' }>
  ): () => void {
    const touched = new Set<string>()
    const seen = new Map(state.stamps)
    let busy = false
    let stopped = false

    const tick = async (): Promise<void> => {
      if (busy || stopped) return
      busy = true
      try {
        let changed = false
        for (const db of await this.candidates(state)) {
          const s = await this.stamp(db)
          if (s && s !== seen.get(db)) {
            seen.set(db, s)
            touched.add(db)
            changed = true
          }
        }
        if (!changed) return
        const tables = await this.tableChanges(state, [...touched])
        if (stopped || tables.length === 0) return
        this.ctx.onProgress?.(
          this.visual(toolUseId, `command:${toolUseId}`, 'progress', {
            ...commandChange(input),
            changedFiles: [...touched],
            tables
          })
        )
      } finally {
        busy = false
      }
    }

    const timer = setInterval(() => void tick(), PROGRESS_POLL_MS)
    const limit = setTimeout(() => stop(), MAX_WATCH_MS)
    const stop = (): void => {
      stopped = true
      clearInterval(timer)
      clearTimeout(limit)
    }
    return stop
  }
}
