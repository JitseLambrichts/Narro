// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FileChange, TableChange } from '../../shared/types'
import type { CardModel, TaskItem } from '../state/conversation'
import { LiveCard } from './LiveCard'
import { TaskChecklist } from './TaskChecklist'
import { PermissionCard } from './PermissionCard'

const notes: FileChange = {
  type: 'file',
  path: 'notes.md',
  status: 'created',
  lines: [
    { kind: 'add', text: 'a' },
    { kind: 'add', text: 'b' }
  ],
  added: 2,
  removed: 0,
  tooLarge: false
}
const doneFileCard: CardModel = {
  id: 'c1',
  targetKey: 'file:notes.md',
  status: 'done',
  change: notes,
  files: null,
  lastAt: 0,
  expanded: false,
  working: []
}
const workingCard: CardModel = { ...doneFileCard, status: 'working', working: ['file:notes.md'] }

const command: CardModel = {
  ...doneFileCard,
  targetKey: 'command:u1',
  change: {
    type: 'command',
    command: 'node gen.js',
    description: 'Generate the report',
    status: 'done',
    durationMs: 1200,
    changedFiles: ['out.txt'],
    outputTail: ['ok']
  }
}

const klanten: TableChange = {
  type: 'table',
  database: 'shop.db',
  table: 'klanten',
  status: 'modified',
  columns: ['id', 'naam', 'stad', 'email'],
  newColumns: ['email'],
  rows: [
    { kind: 'added', cells: ['4', 'Noah', 'Gent', 'noah@example.com'], changedCells: [] },
    { kind: 'changed', cells: ['2', 'Lucas', 'Brussel', null], changedCells: [2] },
    { kind: 'removed', cells: ['1', 'Emma', 'Hasselt', null], changedCells: [] }
  ],
  added: 1,
  changed: 1,
  removed: 1,
  moreRows: 0,
  totalRows: 3
}
const tableCard: CardModel = {
  ...doneFileCard,
  targetKey: 'table:shop.db:klanten',
  change: klanten
}

describe('LiveCard', () => {
  it('collapsed card renders one summary line with Show', async () => {
    const onToggle = vi.fn()
    render(<LiveCard card={doneFileCard} collapsed onToggle={onToggle} />)
    expect(screen.getByText('Created notes.md')).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show' }))
    expect(onToggle).toHaveBeenCalled()
    expect(screen.queryByTestId('card-body')).toBeNull()
  })

  it('an opened collapsed card shows Hide, with its code still behind Show code', async () => {
    render(<LiveCard card={{ ...doneFileCard, expanded: true }} collapsed onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Hide' })).toBeVisible()
    expect(screen.queryByTestId('card-body')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show code' }))
    expect(screen.getByTestId('card-body')).toBeVisible()
  })

  it('a working card is marked busy for assistive tech', () => {
    render(<LiveCard card={workingCard} collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByTestId('live-card')).toHaveAttribute('aria-busy', 'true')
  })

  it('a file card hides its code until Show code', async () => {
    const { container } = render(
      <LiveCard card={doneFileCard} collapsed={false} onToggle={vi.fn()} />
    )
    expect(screen.getByText('+2')).toBeVisible()
    expect(container.querySelectorAll('[data-kind]')).toHaveLength(0)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show code' }))
    expect(container.querySelectorAll('[data-kind="add"]')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Hide code' })).toBeVisible()
  })

  it('the code marks added and removed lines', async () => {
    const change: FileChange = {
      ...notes,
      status: 'modified',
      lines: [
        { kind: 'ctx', text: 'x' },
        { kind: 'del', text: 'y' },
        { kind: 'add', text: 'Y' },
        { kind: 'add', text: 'Z' },
        { kind: 'gap', text: '4 unchanged lines' }
      ]
    }
    const { container } = render(
      <LiveCard card={{ ...doneFileCard, change }} collapsed={false} onToggle={vi.fn()} />
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show code' }))
    expect(container.querySelectorAll('[data-kind="add"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-kind="del"]')).toHaveLength(1)
    expect(screen.getByText('4 unchanged lines')).toBeVisible()
  })

  it('shows a short note instead of lines for tooLarge files', async () => {
    const change: FileChange = { ...notes, lines: [], tooLarge: true }
    render(<LiveCard card={{ ...doneFileCard, change }} collapsed={false} onToggle={vi.fn()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show code' }))
    expect(
      screen.getByText('This file is too large or not text, so only the change is listed.')
    ).toBeVisible()
  })

  it('caps very long diffs', async () => {
    const lines = Array.from({ length: 450 }, (_, i) => ({ kind: 'add' as const, text: `l${i}` }))
    const { container } = render(
      <LiveCard
        card={{ ...doneFileCard, change: { ...notes, lines } }}
        collapsed={false}
        onToggle={vi.fn()}
      />
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show code' }))
    expect(container.querySelectorAll('[data-kind="add"]')).toHaveLength(400)
    expect(screen.getByText('…and 50 more lines')).toBeVisible()
  })

  it('a group card lists files by size of change and opens one on click', async () => {
    const files: FileChange[] = [
      { ...notes, path: 'small.md', added: 1, lines: [{ kind: 'add', text: 'only line' }] },
      { ...notes, path: 'big.md', added: 9, removed: 2 }
    ]
    render(
      <LiveCard
        card={{ ...doneFileCard, targetKey: 'files', files, change: files[1] }}
        collapsed={false}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('Updated 2 files')).toBeVisible()
    const rows = screen.getAllByRole('button', { name: /\.md/ })
    expect(rows.map((r) => r.textContent)).toEqual(['big.md+9−2', 'small.md+1−0'])
    expect(screen.queryByText('only line')).toBeNull()
    await userEvent.setup().click(rows[1])
    expect(screen.getByText('only line')).toBeVisible()
  })

  it('a command card shows its time and changed files, and the command only on request', async () => {
    render(<LiveCard card={command} collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Generate the report')).toBeVisible()
    expect(screen.getByText('1.2 s')).toBeVisible()
    expect(screen.getByText('out.txt')).toBeVisible()
    expect(screen.queryByText('node gen.js')).toBeNull()
    expect(screen.queryByText('ok')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show code' }))
    expect(screen.getByText('node gen.js')).toBeVisible()
    expect(screen.getByText('ok')).toBeVisible()
  })

  it('ActivityCard lists what the agent looked at', () => {
    render(
      <LiveCard
        card={{
          ...doneFileCard,
          targetKey: 'activity',
          change: { type: 'activity', items: ['Read a.ts', 'Read b.ts'] }
        }}
        collapsed={false}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('Read a.ts and 1 more')).toBeVisible()
    expect(screen.getByText('Read b.ts')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Show code' })).toBeNull()
  })
})

describe('TableCard', () => {
  it('shows the changed rows as a table, without any code', () => {
    const { container } = render(<LiveCard card={tableCard} collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Updated table klanten')).toBeVisible()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'id',
      'naam',
      'stad',
      'email'
    ])
    expect(screen.getByRole('cell', { name: 'Noah' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Show code' })).toBeNull()
    expect(container.querySelector('tr[data-kind="added"]')?.textContent).toContain('Noah')
    expect(container.querySelector('tr[data-kind="removed"]')?.textContent).toContain('Emma')
  })

  it('marks changed cells and new columns', () => {
    const { container } = render(<LiveCard card={tableCard} collapsed={false} onToggle={vi.fn()} />)
    const changed = container.querySelectorAll('td[data-changed]')
    expect([...changed].map((td) => td.textContent)).toEqual(['Brussel'])
    expect(screen.getByRole('columnheader', { name: 'email' })).toHaveAttribute('data-new', 'true')
  })

  it('shows the database, the row count and the counts of what changed', () => {
    render(
      <LiveCard
        card={{ ...tableCard, change: { ...klanten, moreRows: 7 } }}
        collapsed={false}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('shop.db · 3 rows · …and 7 more changed rows')).toBeVisible()
    expect(screen.getByText('+1')).toBeVisible()
    expect(screen.getByText('~1')).toBeVisible()
    expect(screen.getByText('−1')).toBeVisible()
  })

  it('rows come in one after another', () => {
    const { container } = render(<LiveCard card={tableCard} collapsed={false} onToggle={vi.fn()} />)
    const delays = [...container.querySelectorAll<HTMLElement>('tbody tr')].map((tr) =>
      tr.style.getPropertyValue('--i')
    )
    expect(delays).toEqual(['0', '1', '2'])
  })
})

describe('TaskChecklist', () => {
  const tasks: TaskItem[] = [
    { taskId: '1', subject: 'Create table', activeForm: 'Creating table', status: 'completed' },
    { taskId: '2', subject: 'Add rows', activeForm: 'Adding rows', status: 'in_progress' },
    { taskId: '3', subject: 'Check', activeForm: null, status: 'pending' }
  ]

  it('TaskChecklist only renders with two or more tasks', () => {
    const { container } = render(<TaskChecklist tasks={tasks.slice(0, 1)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the active form of the task in progress', () => {
    render(<TaskChecklist tasks={tasks} />)
    expect(screen.getByText('Create table')).toBeVisible()
    expect(screen.getByText('Adding rows')).toBeVisible()
    expect(screen.getByText('Check')).toBeVisible()
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('data-status'))).toEqual([
      'completed',
      'in_progress',
      'pending'
    ])
  })
})

describe('PermissionCard', () => {
  it('PermissionCard calls onDecide and then shows the decision', async () => {
    const onDecide = vi.fn()
    const props = { title: 'Allow this command?', detail: 'rm -rf build', onDecide }
    const { rerender } = render(<PermissionCard {...props} decision={null} />)
    expect(screen.getByTestId('permission-card')).toBeVisible()
    expect(screen.getByText('rm -rf build')).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Allow' }))
    expect(onDecide).toHaveBeenCalledWith(true)
    rerender(<PermissionCard {...props} decision="denied" />)
    expect(screen.getByText('Stopped')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
    rerender(<PermissionCard {...props} decision="allowed" />)
    expect(screen.getByText('Allowed')).toBeVisible()
  })

  it('Stop denies', async () => {
    const onDecide = vi.fn()
    render(<PermissionCard title="t" detail="d" decision={null} onDecide={onDecide} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Stop' }))
    expect(onDecide).toHaveBeenCalledWith(false)
  })
})
