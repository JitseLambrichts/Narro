import { promises as fs } from 'fs'
import { join } from 'path'
import ignore, { type Ignore } from 'ignore'

export const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.cache',
  'coverage'
]
export const MAX_INDEX_FILES = 20000

// Key: path relative to the project root, with '/' as separator.
export type ProjectIndex = Map<string, { mtimeMs: number; size: number }>

async function loadIgnore(root: string): Promise<Ignore> {
  const ig = ignore().add(DEFAULT_IGNORES)
  try {
    ig.add(await fs.readFile(join(root, '.gitignore'), 'utf8'))
  } catch {
    // no .gitignore
  }
  return ig
}

export async function indexProject(
  root: string,
  opts: { maxFiles?: number } = {}
): Promise<ProjectIndex> {
  const maxFiles = opts.maxFiles ?? MAX_INDEX_FILES
  const index: ProjectIndex = new Map()
  const ig = await loadIgnore(root)

  async function walk(relDir: string): Promise<void> {
    if (index.size >= maxFiles) return
    let entries
    try {
      entries = await fs.readdir(join(root, relDir), { withFileTypes: true })
    } catch {
      return
    }
    const dirs: string[] = []
    const files: string[] = []
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!ig.ignores(rel + '/')) dirs.push(rel)
      } else if (entry.isFile() && !ig.ignores(rel)) {
        files.push(rel)
      }
    }
    // Stat one folder's files in parallel; the cap keeps huge projects cheap.
    const stats = await Promise.all(
      files.slice(0, maxFiles - index.size).map((rel) => fs.stat(join(root, rel)).catch(() => null))
    )
    stats.forEach((st, i) => {
      if (st) index.set(files[i], { mtimeMs: st.mtimeMs, size: st.size })
    })
    for (const dir of dirs) await walk(dir)
  }

  await walk('')
  return index
}

export function changedPaths(before: ProjectIndex, after: ProjectIndex): string[] {
  const changed = new Set<string>()
  for (const [path, a] of before) {
    const b = after.get(path)
    if (!b || b.mtimeMs !== a.mtimeMs || b.size !== a.size) changed.add(path)
  }
  for (const path of after.keys()) if (!before.has(path)) changed.add(path)
  return [...changed].sort()
}
