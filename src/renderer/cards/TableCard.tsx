import type { TableChange } from '../../shared/types'
import { t } from '../i18n/en'

// Rows appear one after another, but the whole table never takes longer than this many steps.
const MAX_STAGGER_STEPS = 20

// A changed database table: new rows slide in green, changed cells light up amber,
// removed rows stay visible in red so you can see what went.
export function TableCard(p: { change: TableChange }): React.JSX.Element {
  const { change } = p
  return (
    <div className="db">
      <div className="db-scroll">
        <table className="db-table">
          <thead>
            <tr>
              {change.columns.map((c) => (
                <th key={c} data-new={change.newColumns.includes(c) || undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {change.rows.map((row, i) => (
              <tr
                key={i}
                data-kind={row.kind}
                style={{ '--i': Math.min(i, MAX_STAGGER_STEPS) } as React.CSSProperties}
              >
                {row.cells.map((cell, j) => (
                  <td key={j} data-changed={row.changedCells.includes(j) || undefined}>
                    {cell ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="db-meta">
        {t.tableMeta(change.database, change.totalRows)}
        {change.moreRows > 0 && ` · ${t.moreRows(change.moreRows)}`}
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
