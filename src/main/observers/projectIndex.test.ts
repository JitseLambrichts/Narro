import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { changedPaths, indexProject } from './projectIndex'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'index-'))
})

function put(rel: string, content = 'x'): void {
  const abs = join(tmp, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content)
}

describe('indexProject', () => {
  it('skips default ignores and .gitignore entries', async () => {
    put('src/a.ts')
    put('node_modules/x/index.js')
    put('.git/HEAD')
    put('secret.txt')
    put('.gitignore', 'secret.txt\n')
    expect([...(await indexProject(tmp)).keys()].sort()).toEqual(['.gitignore', 'src/a.ts'])
  })

  it('stops at maxFiles', async () => {
    for (let i = 0; i < 5; i++) put(`f${i}.txt`)
    expect((await indexProject(tmp, { maxFiles: 3 })).size).toBe(3)
  })

  it('records size and modification time', async () => {
    put('a.txt', 'hello')
    expect((await indexProject(tmp)).get('a.txt')).toMatchObject({ size: 5, mtimeMs: expect.any(Number) })
  })

  it('returns an empty index for a missing folder', async () => {
    expect((await indexProject(join(tmp, 'nope'))).size).toBe(0)
  })
})

describe('changedPaths', () => {
  it('reports added, removed and modified paths', () => {
    const a = new Map([
      ['x', { mtimeMs: 1, size: 1 }],
      ['y', { mtimeMs: 1, size: 1 }]
    ])
    const b = new Map([
      ['y', { mtimeMs: 2, size: 1 }],
      ['z', { mtimeMs: 1, size: 1 }]
    ])
    expect(changedPaths(a, b)).toEqual(['x', 'y', 'z'])
  })

  it('ignores untouched files', () => {
    const a = new Map([['x', { mtimeMs: 1, size: 1 }]])
    expect(changedPaths(a, new Map(a))).toEqual([])
  })
})
