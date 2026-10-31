import { useState } from 'react'
import type { TableChange } from '../../shared/types'
import { t } from '../i18n/en'
import { Check, TableCard } from './TableCard'

const keyOf = (table: TableChange): string => `${table.database}:${table.table}`

function TableIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M6 6.5V13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

// What a command did to the project's data: one tab per table, in the order the command
// reached them. While it runs, the newest table is shown and its tab spins.
export function DatabaseCard(p: { tables: TableChange[]; working: boolean }): React.JSX.Element {
  const [chosen, setChosen] = useState<string | null>(null)
  const latest = p.tables.at(-1)
  const active = p.tables.find((table) => keyOf(table) === chosen) ?? latest

  return (
    <div className="db">
      <div className="db-tabs" role="tablist" aria-label={t.tables}>
        {p.tables.map((table) => {
          const busy = p.working && table === latest
          return (
            <button
              key={keyOf(table)}
              type="button"
              role="tab"
              className="db-tab"
              aria-selected={table === active}
              onClick={() => setChosen(keyOf(table))}
            >
              <TableIcon />
              <span>{table.table}</span>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Check />}
            </button>
          )
        })}
      </div>
      {active && (
        <TableCard key={keyOf(active)} change={active} working={p.working && active === latest} />
      )}
    </div>
  )
}
