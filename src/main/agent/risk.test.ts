import { describe, it, expect } from 'vitest'
import { classifyRisk } from './risk'

const P = '/tmp/proj'

describe('classifyRisk', () => {
  it.each([
    [
      'Bash',
      { command: 'rm -rf build', description: 'Remove the build folder' },
      true,
      'Allow this command?',
      'Remove the build folder'
    ],
    [
      'Bash',
      { command: 'git push origin main' },
      true,
      'Allow this command?',
      'git push origin main'
    ],
    ['Bash', { command: 'git reset --hard HEAD~1' }, true, undefined, undefined],
    ['Bash', { command: 'sqlite3 shop.db "DELETE FROM customers"' }, true, undefined, undefined],
    ['Bash', { command: 'sudo npm i -g x' }, true, undefined, undefined],
    ['Bash', { command: 'git clean -fd' }, true, undefined, undefined],
    ['Bash', { command: 'git branch -D old' }, true, undefined, undefined],
    ['Bash', { command: 'chmod -R 777 .' }, true, undefined, undefined],
    ['Bash', { command: 'npm install' }, false, undefined, undefined],
    ['Bash', { command: 'git status' }, false, undefined, undefined],
    ['Write', { file_path: P + '/src/a.ts' }, false, undefined, undefined],
    ['Write', { file_path: 'src/a.ts' }, false, undefined, undefined],
    [
      'Write',
      { file_path: '/etc/hosts' },
      true,
      'Allow changes outside your project?',
      '/etc/hosts'
    ],
    [
      'Edit',
      { file_path: P + '/../other/x.ts' },
      true,
      'Allow changes outside your project?',
      '/tmp/other/x.ts'
    ],
    [
      'Edit',
      { file_path: '/tmp/project-b/x.ts' },
      true,
      'Allow changes outside your project?',
      '/tmp/project-b/x.ts'
    ],
    [
      'NotebookEdit',
      { notebook_path: '/etc/n.ipynb' },
      true,
      'Allow changes outside your project?',
      '/etc/n.ipynb'
    ],
    ['Read', { file_path: '/etc/hosts' }, false, undefined, undefined]
  ])('%s %o → risky %s', (tool, input, risky, title, detail) => {
    const r = classifyRisk(tool, input, P)
    expect(r.risky).toBe(risky)
    if (title !== undefined) expect(r.title).toBe(title)
    if (detail !== undefined) expect(r.detail).toBe(detail)
  })
})
