import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileChange, MAX_DIFF_BYTES, readSnapshot } from './files'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'files-'))
})

describe('readSnapshot', () => {
  it('reads a missing file as not existing', async () => {
    expect(await readSnapshot(join(tmp, 'nope.txt'))).toEqual({ exists: false, text: null, binary: false, tooLarge: false })
  })

  it('reads a text file', async () => {
    writeFileSync(join(tmp, 'a.txt'), 'hi\n')
    expect(await readSnapshot(join(tmp, 'a.txt'))).toEqual({ exists: true, text: 'hi\n', binary: false, tooLarge: false })
  })

  it('flags binary files', async () => {
    writeFileSync(join(tmp, 'img.png'), Buffer.from([137, 80, 0, 1]))
    expect((await readSnapshot(join(tmp, 'img.png'))).binary).toBe(true)
  })

  it('flags files above MAX_DIFF_BYTES', async () => {
    writeFileSync(join(tmp, 'big.txt'), 'a'.repeat(MAX_DIFF_BYTES + 1))
    expect(await readSnapshot(join(tmp, 'big.txt'))).toEqual({ exists: true, text: null, binary: false, tooLarge: true })
  })
})

describe('fileChange', () => {
  const none = { exists: false, text: null, binary: false, tooLarge: false }
  const two = { exists: true, text: 'a\nb\n', binary: false, tooLarge: false }

  it('builds created / deleted / tooLarge changes', () => {
    expect(fileChange('n.md', none, two)).toMatchObject({ status: 'created', added: 2, removed: 0, tooLarge: false })
    expect(fileChange('n.md', two, none)).toMatchObject({ status: 'deleted', added: 0, removed: 2 })
    expect(fileChange('i.png', none, { ...two, text: null, binary: true })).toMatchObject({ tooLarge: true, lines: [] })
  })

  it('builds a modified change with the diff', () => {
    expect(fileChange('n.md', two, { ...two, text: 'a\nc\n' })).toEqual({
      type: 'file',
      path: 'n.md',
      status: 'modified',
      lines: [
        { kind: 'ctx', text: 'a' },
        { kind: 'del', text: 'b' },
        { kind: 'add', text: 'c' }
      ],
      added: 1,
      removed: 1,
      tooLarge: false
    })
  })
})
