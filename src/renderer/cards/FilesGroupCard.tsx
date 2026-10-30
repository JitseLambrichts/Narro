import { useState } from 'react'
import type { FileChange } from '../../shared/types'
import { FileCard, hasFileBody } from './FileCard'

export function ChangeStats(p: { added: number; removed: number }): React.JSX.Element {
  return (
    <span className="stats">
      <span className="stat-add">+{p.added}</span>
      <span className="stat-del">−{p.removed}</span>
    </span>
  )
}

export function FilesGroupCard(p: { files: FileChange[]; working: string[] }): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const files = [...p.files].sort((a, b) => b.added + b.removed - (a.added + a.removed))
  return (
    <ul className="file-list">
      {files.map((f) => {
        const isOpen = open === f.path
        const busy = p.working.includes(`file:${f.path}`)
        return (
          <li key={f.path} className="file-row" data-status={f.status}>
            <button
              type="button"
              className="file-row-button"
              aria-expanded={isOpen}
              disabled={!hasFileBody(f)}
              onClick={() => setOpen(isOpen ? null : f.path)}
            >
              <span className={busy ? 'dot working' : `dot file-${f.status}`} aria-hidden="true" />
              <span className="file-row-path">{f.path}</span>
              <ChangeStats added={f.added} removed={f.removed} />
            </button>
            {isOpen && <FileCard change={f} />}
          </li>
        )
      })}
    </ul>
  )
}
