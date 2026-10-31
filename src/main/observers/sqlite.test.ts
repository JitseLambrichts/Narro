import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { databaseFor, MAX_SHOWN_ROWS, readDatabase, tableChanges, type DbSnapshot } from './sqlite'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sqlite-'))
})

function db(name: string, sql: string): string {
  const path = join(tmp, name)
  const d = new DatabaseSync(path)
  d.exec(sql)
  d.close()
  return path
}

const KLANTEN = `
  CREATE TABLE klanten (id INTEGER PRIMARY KEY, voornaam TEXT, stad TEXT);
  INSERT INTO klanten (voornaam, stad) VALUES ('Emma', 'Hasselt'), ('Lucas', 'Antwerpen');`

describe('databaseFor', () => {
  it.each([
    ['shop.db', 'shop.db'],
    ['data/app.sqlite', 'data/app.sqlite'],
    ['x.sqlite3', 'x.sqlite3'],
    ['shop.db-wal', 'shop.db'],
    ['shop.db-journal', 'shop.db'],
    ['notes.md', null],
    ['debug.log', null]
  ])('%s → %s', (path, expected) => expect(databaseFor(path)).toBe(expected))
})

describe('readDatabase', () => {
  it('reads tables, columns and rows', async () => {
    const snap = (await readDatabase(db('shop.db', KLANTEN)))!
    const klanten = snap.get('klanten')!
    expect(klanten.columns).toEqual(['id', 'voornaam', 'stad'])
    expect(klanten.types).toEqual(['integer', 'text', 'text'])
    expect(klanten.sql).toMatch(/^CREATE TABLE klanten/)
    expect([...klanten.rows.values()]).toEqual([
      ['1', 'Emma', 'Hasselt'],
      ['2', 'Lucas', 'Antwerpen']
    ])
  })

  it('shows binary values as their size', async () => {
    const snap = (await readDatabase(
      db('b.db', "CREATE TABLE f (data BLOB); INSERT INTO f VALUES (x'010203');")
    ))!
    expect([...snap.get('f')!.rows.values()]).toEqual([['3 bytes']])
  })

  it('reads tables without a rowid', async () => {
    const snap = (await readDatabase(
      db(
        'w.db',
        "CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID; INSERT INTO kv VALUES ('a', '1');"
      )
    ))!
    expect([...snap.get('kv')!.rows.values()]).toEqual([['a', '1']])
  })

  it('returns null for a missing file or a file that is not a database', async () => {
    expect(await readDatabase(join(tmp, 'nope.db'))).toBeNull()
    writeFileSync(join(tmp, 'fake.db'), 'just text')
    expect(await readDatabase(join(tmp, 'fake.db'))).toBeNull()
  })

  it('never writes to the database', async () => {
    const path = db('shop.db', KLANTEN)
    await readDatabase(path)
    const d = new DatabaseSync(path)
    expect(d.prepare('SELECT count(*) AS n FROM klanten').get()).toEqual({ n: 2 })
    d.close()
  })
})

describe('tableChanges', () => {
  async function snap(sql: string): Promise<DbSnapshot> {
    return (await readDatabase(db(`s${Math.random()}.db`, sql)))!
  }

  it('a new table shows all its rows as added', async () => {
    const [c] = tableChanges('shop.db', null, await snap(KLANTEN))
    expect(c).toMatchObject({
      type: 'table',
      database: 'shop.db',
      table: 'klanten',
      status: 'created',
      columns: ['id', 'voornaam', 'stad'],
      added: 2,
      changed: 0,
      removed: 0,
      totalRows: 2,
      moreRows: 0
    })
    expect(c.rows).toEqual([
      {
        key: '1',
        kind: 'added',
        cells: ['1', 'Emma', 'Hasselt'],
        changedCells: [],
        filledCells: []
      },
      {
        key: '2',
        kind: 'added',
        cells: ['2', 'Lucas', 'Antwerpen'],
        changedCells: [],
        filledCells: []
      }
    ])
    expect(c.schema).toMatch(/^CREATE TABLE klanten \(id INTEGER PRIMARY KEY/)
    expect(c.types).toEqual(['integer', 'text', 'text'])
  })

  it('finds added, changed and removed rows and new columns', async () => {
    const before = await snap(
      KLANTEN + "INSERT INTO klanten (voornaam, stad) VALUES ('Sofie', 'Gent');"
    )
    const after = await snap(
      KLANTEN +
        `INSERT INTO klanten (voornaam, stad) VALUES ('Sofie', 'Gent');
         ALTER TABLE klanten ADD COLUMN email TEXT;
         UPDATE klanten SET stad = 'Brussel' WHERE voornaam = 'Lucas';
         DELETE FROM klanten WHERE voornaam = 'Emma';
         INSERT INTO klanten (voornaam, stad, email) VALUES ('Noah', 'Gent', 'noah@example.com');`
    )
    const [c] = tableChanges('shop.db', before, after)
    expect(c).toMatchObject({
      status: 'modified',
      newColumns: ['email'],
      schema: 'ALTER TABLE klanten ADD COLUMN email TEXT',
      added: 1,
      changed: 1,
      removed: 1
    })
    expect(c.rows.map((r) => [r.kind, r.cells, r.changedCells, r.filledCells])).toEqual([
      ['changed', ['2', 'Lucas', 'Brussel', null], [2], []],
      ['same', ['3', 'Sofie', 'Gent', null], [], []],
      ['added', ['4', 'Noah', 'Gent', 'noah@example.com'], [], []],
      ['removed', ['1', 'Emma', 'Hasselt', null], [], []]
    ])
  })

  it('a new column shows every row, with the cells that got a value marked as filled', async () => {
    const before = await snap(KLANTEN)
    const after = await snap(
      KLANTEN +
        `ALTER TABLE klanten ADD COLUMN email TEXT;
         UPDATE klanten SET email = 'emma@example.com' WHERE voornaam = 'Emma';`
    )
    const [c] = tableChanges('shop.db', before, after)
    expect(c).toMatchObject({ newColumns: ['email'], filled: 1, added: 0, changed: 0 })
    expect(c.rows.map((r) => [r.kind, r.cells[3], r.filledCells])).toEqual([
      ['same', 'emma@example.com', [3]],
      ['same', null, []]
    ])
  })

  it('a dropped table shows its rows as removed', async () => {
    const [c] = tableChanges(
      'shop.db',
      await snap(KLANTEN),
      await snap('CREATE TABLE other (x);')
    ).filter((t) => t.table === 'klanten')
    expect(c).toMatchObject({ status: 'deleted', removed: 2, schema: 'DROP TABLE klanten' })
  })

  it('reports nothing when the data is the same', async () => {
    expect(tableChanges('shop.db', await snap(KLANTEN), await snap(KLANTEN))).toEqual([])
  })

  it('shows at most MAX_SHOWN_ROWS rows and counts the rest', async () => {
    const values = Array.from({ length: MAX_SHOWN_ROWS + 5 }, (_, i) => `('n${i}', 'x')`).join(',')
    const [c] = tableChanges(
      'shop.db',
      null,
      await snap(`CREATE TABLE t (name TEXT, city TEXT); INSERT INTO t VALUES ${values};`)
    )
    expect(c.rows).toHaveLength(MAX_SHOWN_ROWS)
    expect(c.moreRows).toBe(5)
    expect(c.added).toBe(MAX_SHOWN_ROWS + 5)
  })
})
