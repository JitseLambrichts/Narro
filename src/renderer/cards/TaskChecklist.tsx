import type { TaskItem } from '../state/conversation'
import { t } from '../i18n/en'

export function TaskChecklist(p: { tasks: TaskItem[] }): React.JSX.Element | null {
  // A single task is not a plan; the checklist only helps from two tasks on.
  if (p.tasks.length < 2) return null
  return (
    <ul className="checklist" aria-label={t.tasks}>
      {p.tasks.map((task) => (
        <li key={task.taskId} className="checklist-item" data-status={task.status}>
          {task.status === 'completed' ? (
            <svg className="check" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <span
              className={task.status === 'in_progress' ? 'dot working' : 'circle'}
              aria-hidden="true"
            />
          )}
          <span>
            {task.status === 'in_progress' ? (task.activeForm ?? task.subject) : task.subject}
          </span>
        </li>
      ))}
    </ul>
  )
}
