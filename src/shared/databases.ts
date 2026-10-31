const DB_EXTENSIONS = /\.(db|sqlite|sqlite3|db3)$/i
// SQLite keeps recent writes in these files next to the database until it folds them in.
const SIDE_FILES = /-(wal|shm|journal)$/

// The SQLite database a project path belongs to, if any.
export function databaseFor(path: string): string | null {
  const base = path.replace(SIDE_FILES, '')
  return DB_EXTENSIONS.test(base) ? base : null
}
