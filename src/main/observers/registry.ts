import { basename, isAbsolute, relative, resolve, sep } from 'path'
import type { CommandChange, FileChange, VisualChange } from '../../shared/types'
import { fileChange, readSnapshot, type FileSnapshot } from './files'
import { changedPaths, indexProject, type ProjectIndex } from './projectIndex'

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
  | { kind: 'command'; index: ProjectIndex; startedAt: number }

const MISSING: FileSnapshot = { exists: false, text: null, binary: false, tooLarge: false }

// Turns tool calls into visual changes by reading the real state of the project folder
// before and after each call.
export class ToolObserver {
  private pending = new Map<string, Pending>()

  constructor(private ctx: { projectDir: string; newId(): string }) {}

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
      this.pending.set(toolUseId, { kind: 'command', index, startedAt: Date.now() })
      const change: CommandChange = {
        type: 'command',
        command: str(input.command) ?? '',
        description: str(input.description),
        status: 'running',
        durationMs: null,
        changedFiles: [],
        outputTail: []
      }
      return [this.visual(toolUseId, `command:${toolUseId}`, 'start', change)]
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
      const changedFiles =
        state?.kind === 'command'
          ? changedPaths(state.index, await indexProject(this.ctx.projectDir))
          : []
      const change: CommandChange = {
        type: 'command',
        command: str(input.command) ?? '',
        description: str(input.description),
        status: failed ? 'failed' : 'done',
        durationMs: durationMs ?? (state?.kind === 'command' ? Date.now() - state.startedAt : null),
        changedFiles,
        outputTail: outputTail(response)
      }
      return [this.visual(toolUseId, `command:${toolUseId}`, phase, change)]
    }

    return []
  }
}
