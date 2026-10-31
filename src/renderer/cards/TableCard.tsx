import type { TableChange } from '../../shared/types'
import { tableSummary } from '../state/cardTitle'
import { t } from '../i18n/en'

// Rows appear one after another, but the whole table never takes longer than this many steps.
const MAX_STAGGER_STEPS = 20

function Check(): React.JSX.Element {
  return (
    <svg className="db-check" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// One changed table: new rows slide in green, changed cells light up amber, a new column
// fills in green, and removed rows stay visible in red so you can see what went.
export function TableCard(p: { change: TableChange; working: boolean }): React.JSX.Element {
  const { change } = p
  const isNew = change.columns.map((c) => change.newColumns.includes(c))
  return (
    <div className="db-view">
      <div className="db-scroll">
        <table className="db-table">
          <thead>
            <tr>
              <th className="db-rownum" aria-label="#" />
              {change.columns.map((c, i) => (
                <th key={c} data-new={isNew[i] || undefined}>
                  <span className="col-name">{c}</span>
                  {change.types[i] && <span className="col-type">{change.types[i]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {change.rows.map((row, i) => (
              <tr
                key={row.key}
                data-kind={row.kind}
                style={{ '--i': Math.min(i, MAX_STAGGER_STEPS) } as React.CSSProperties}
              >
                <td className="db-rownum">{i + 1}</td>
                {row.cells.map((cell, j) => (
                  <td
                    key={j}
                    data-new={isNew[j] || undefined}
                    data-changed={row.changedCells.includes(j) || undefined}
                    data-filled={row.filledCells.includes(j) || undefined}
                  >
                    {cell === null ? <span className="db-null">{t.nullValue}</span> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {change.moreRows > 0 && <div className="db-more">{t.moreRows(change.moreRows)}</div>}
      <div className="db-foot">
        {change.schema && (
          <div className="db-schema">
            <span className="db-label">{t.schema}</span>
            <code title={change.schema}>{change.schema}</code>
          </div>
        )}
        <div className="db-summary">
          {!p.working && <Check />}
          <span>{tableSummary(change)}</span>
          <span className="db-meta">{t.tableMeta(change.database, change.totalRows)}</span>
        </div>
      </div>
    </div>
  )
}

export function TableStats(p: { change: TableChange }): React.JSX.Element {
  const { added, changed, removed } = p.change
  return (
    <span className="stats">
      {added > 0 && <span className="stat-add">+{added}</span>}
      {changed > 0 && <span className="stat-change">~{changed}</span>}
      {removed > 0 && <span className="stat-del">−{removed}</span>}
    </span>
  )
}

export { Check }
