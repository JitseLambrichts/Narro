import { t } from '../i18n/en'

export function EmptyState(p: { onOpen(): void }): React.JSX.Element {
  return (
    <div className="empty-state">
      <h1 className="empty-title">{t.emptyTitle}</h1>
      <button className="button primary" onClick={p.onOpen}>
        {t.openProject}
      </button>
    </div>
  )
}
