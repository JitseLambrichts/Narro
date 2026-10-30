import { t } from '../i18n/en'

export function PermissionCard(p: {
  title: string
  detail: string
  decision: 'allowed' | 'denied' | null
  onDecide(allow: boolean): void
}): React.JSX.Element {
  return (
    <div className="permission" data-testid="permission-card" data-decision={p.decision ?? 'open'}>
      <div className="permission-title">{p.title}</div>
      <code className="permission-detail">{p.detail}</code>
      {p.decision === null ? (
        <div className="permission-actions">
          <button type="button" className="button primary" onClick={() => p.onDecide(true)}>
            {t.allow}
          </button>
          <button type="button" className="button" onClick={() => p.onDecide(false)}>
            {t.stop}
          </button>
        </div>
      ) : (
        <div className="permission-decision">
          {p.decision === 'allowed' ? t.allowed : t.stopped}
        </div>
      )}
    </div>
  )
}
