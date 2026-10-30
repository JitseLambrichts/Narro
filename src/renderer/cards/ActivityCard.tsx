import type { ActivityChange } from '../../shared/types'

export function ActivityCard(p: { change: ActivityChange }): React.JSX.Element {
  return (
    <ul className="activity">
      {p.change.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
