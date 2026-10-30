import { promises as fs } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import type { TableChange, TableRow } from '../../shared/types'

// Limits that keep reading a database quick and a card light.
export const MAX_DB_BYTES = 20_000_000
export const MAX_DATABASES = 5
export const MAX_TABLES = 30
export const MAX_ROWS_READ = 2000
export const MAX_SHOWN_ROWS = 50

const DB_EXTENSIONS = /\.(db|sqlite|sqlite3|db3)$/i
// SQLite keeps recent writes in these files next to the database until it folds them in.
const SIDE_FILES = /-(wal|shm|journal)$/
const SQLITE_HEADER = 'SQLite format 3\0'

export interface TableSnapshot {
  columns: string[]
  // Row key (rowid, or the whole row for tables without one) → cells.
  rows: Map<string, (string | null)[]>
}
export type DbSnapshot = Map<string, TableSnapshot>

// The database a changed path belongs to, if any.
export function databaseFor(path: string): string | null {
  const base = path.replace(SIDE_FILES, '')
  return DB_EXTENSIONS.test(base) ? base : null
}

function cell(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Uint8Array) return `${v.byteLength} bytes`
  return String(v)
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

async function isSqliteFile(path: string): Promise<boolean> {
  try {
    const st = await fs.stat(path)
    if (!st.isFile() || st.size > MAX_DB_BYTES) return false
    const handle = await fs.open(path, 'r')
    try {
      const head = Buffer.alloc(SQLITE_HEADER.length)
      await handle.read(head, 0, head.length, 0)
      return head.toString('latin1') === SQLITE_HEADER
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }
}

function readTable(db: DatabaseSync, table: string): TableSnapshot {
  const columns = (
    db.prepare(`PRAGMA table_info(${quote(table)})`).all() as { name: string }[]
  ).map((c) => c.name)
  const rows = new Map<string, (string | null)[]>()
  const toCells = (r: Record<string, unknown>): (string | null)[] => columns.map((c) => cell(r[c]))
  try {
    const result = db
      .prepare(`SELECT rowid AS "__narro_rowid", * FROM ${quote(table)} LIMIT ${MAX_ROWS_READ}`)
      .all() as Record<string, unknown>[]
    for (const r of result) rows.set(String(r.__narro_rowid), toCells(r))
  } catch {
    // A table without a rowid: the row itself is its key.
    const result = db
      .prepare(`SELECT * FROM ${quote(table)} LIMIT ${MAX_ROWS_READ}`)
      .all() as Record<string, unknown>[]
    for (const r of result) rows.set(JSON.stringify(toCells(r)), toCells(r))
  }
  return { columns, rows }
}

// Reads a database without ever writing to it; null when it is missing, too big or not SQLite.
export async function readDatabase(absPath: string): Promise<DbSnapshot | null> {
  if (!(await isSqliteFile(absPath))) return null
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(absPath, { readOnly: true })
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
        )
        .all() as { name: string }[]
    ).slice(0, MAX_TABLES)
    const snapshot: DbSnapshot = new Map()
    for (const { name } of tables) snapshot.set(name, readTable(db, name))
    return snapshot
  } catch {
    return null
  } finally {
    db?.close()
  }
}

function sameColumns(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function diffTable(
  database: string,
  table: string,
  before: TableSnapshot | undefined,
  after: TableSnapshot | undefined
): TableChange | null {
  const columns = after?.columns ?? before?.columns ?? []
  const status = !before ? 'created' : !after ? 'deleted' : 'modified'
  const oldColumns = before?.columns ?? []
  const newColumns = before && after ? columns.filter((c) => !oldColumns.includes(c)) : []
  // A row from before, laid out in the columns of now.
  const realign = (cells: (string | null)[]): (string | null)[] =>
    columns.map((c) => {
      const i = oldColumns.indexOf(c)
      return i >= 0 ? cells[i] : null
    })

  const rows: TableRow[] = []
  for (const [key, cells] of after?.rows ?? []) {
    const old = before?.rows.get(key)
    if (!old) {
      rows.push({ kind: 'added', cells, changedCells: [] })
      continue
    }
    const changedCells = columns.flatMap((c, i) => {
      const j = oldColumns.indexOf(c)
      return j >= 0 && old[j] !== cells[i] ? [i] : []
    })
    if (changedCells.length > 0) rows.push({ kind: 'changed', cells, changedCells })
  }
  for (const [key, cells] of before?.rows ?? []) {
    if (!after?.rows.has(key))
      rows.push({ kind: 'removed', cells: realign(cells), changedCells: [] })
  }

  if (status === 'modified' && rows.length === 0 && sameColumns(oldColumns, columns)) return null
  const count = (kind: TableRow['kind']): number => rows.filter((r) => r.kind === kind).length
  return {
    type: 'table',
    database,
    table,
    status,
    columns,
    newColumns,
    rows: rows.slice(0, MAX_SHOWN_ROWS),
    added: count('added'),
    changed: count('changed'),
    removed: count('removed'),
    moreRows: Math.max(0, rows.length - MAX_SHOWN_ROWS),
    totalRows: after?.rows.size ?? 0
  }
}

export function tableChanges(
  database: string,
  before: DbSnapshot | null,
  after: DbSnapshot | null
): TableChange[] {
  const names = [...new Set([...(after?.keys() ?? []), ...(before?.keys() ?? [])])]
  return names.flatMap((table) => {
    const change = diffTable(database, table, before?.get(table), after?.get(table))
    return change ? [change] : []
  })
}
