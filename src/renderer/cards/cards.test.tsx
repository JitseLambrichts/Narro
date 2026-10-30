// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FileChange } from '../../shared/types'
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

describe('LiveCard', () => {
  it('collapsed card renders one summary line with Show', async () => {
    const onToggle = vi.fn()
    render(<LiveCard card={doneFileCard} collapsed onToggle={onToggle} />)
    expect(screen.getByText('Created notes.md')).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show' }))
    expect(onToggle).toHaveBeenCalled()
    expect(screen.queryByTestId('card-body')).toBeNull()
  })

  it('an opened collapsed card shows its body and a Hide button', () => {
    render(<LiveCard card={{ ...doneFileCard, expanded: true }} collapsed onToggle={vi.fn()} />)
    expect(screen.getByTestId('card-body')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hide' })).toBeVisible()
  })

  it('a card in the running turn shows its body without a toggle', () => {
    render(<LiveCard card={doneFileCard} collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByTestId('card-body')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
  })

  it('a working card is marked busy for assistive tech', () => {
    render(<LiveCard card={workingCard} collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByTestId('live-card')).toHaveAttribute('aria-busy', 'true')
  })

  it('FileCard marks added and removed lines', () => {
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
    expect(container.querySelectorAll('[data-kind="add"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-kind="del"]')).toHaveLength(1)
    expect(screen.getByText('4 unchanged lines')).toBeVisible()
  })

  it('FileCard shows a short note instead of lines for tooLarge files', () => {
    const change: FileChange = { ...notes, lines: [], tooLarge: true }
    render(<LiveCard card={{ ...doneFileCard, change }} collapsed={false} onToggle={vi.fn()} />)
    expect(
      screen.getByText('This file is too large or not text, so only the change is listed.')
    ).toBeVisible()
  })

  it('FileCard caps very long diffs', () => {
    const lines = Array.from({ length: 450 }, (_, i) => ({ kind: 'add' as const, text: `l${i}` }))
    const { container } = render(
      <LiveCard
        card={{ ...doneFileCard, change: { ...notes, lines } }}
        collapsed={false}
        onToggle={vi.fn()}
      />
    )
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

  it('CommandCard shows the time, the changed files and the output', () => {
    render(
      <LiveCard
        card={{
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
        }}
        collapsed={false}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('Generate the report')).toBeVisible()
    expect(screen.getByText('1.2 s')).toBeVisible()
    expect(screen.getByText('out.txt')).toBeVisible()
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
