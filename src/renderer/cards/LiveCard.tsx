import { AnimatePresence, motion } from 'motion/react'
import type { CardModel } from '../state/conversation'
import { cardTitle } from '../state/cardTitle'
import { fade, spring } from '../motion/tokens'
import { t } from '../i18n/en'
import { FileCard, hasFileBody } from './FileCard'
import { ChangeStats, FilesGroupCard } from './FilesGroupCard'
import { CommandCard } from './CommandCard'
import { ActivityCard } from './ActivityCard'

function hasBody(card: CardModel): boolean {
  if (card.files !== null) return true
  switch (card.change.type) {
    case 'file':
      return hasFileBody(card.change)
    case 'command':
      return true
    case 'activity':
      return card.change.items.length > 1
  }
}

function Body(p: { card: CardModel }): React.JSX.Element | null {
  const { card } = p
  if (card.files !== null) return <FilesGroupCard files={card.files} working={card.working} />
  switch (card.change.type) {
    case 'file':
      return <FileCard change={card.change} />
    case 'command':
      return <CommandCard change={card.change} />
    case 'activity':
      return <ActivityCard change={card.change} />
  }
}

export function LiveCard(p: {
  card: CardModel
  collapsed: boolean
  onToggle(): void
}): React.JSX.Element {
  const { card } = p
  const body = hasBody(card)
  const pill = p.collapsed && !card.expanded
  const showBody = body && !pill
  const single = card.files === null && card.change.type === 'file' ? card.change : null

  return (
    <motion.div
      layout
      transition={{ layout: spring }}
      className={pill ? 'card pill' : 'card'}
      data-status={card.status}
      data-testid="live-card"
      aria-busy={card.status === 'working'}
    >
      <motion.div layout="position" transition={{ layout: spring }} className="card-head">
        <span className={`dot ${card.status}`} aria-hidden="true" />
        <span className="card-title">{cardTitle(card)}</span>
        {single && !pill && card.status !== 'working' && !single.tooLarge && (
          <ChangeStats added={single.added} removed={single.removed} />
        )}
        {p.collapsed && body && (
          <button type="button" className="link-button" onClick={p.onToggle}>
            {pill ? t.show : t.hide}
          </button>
        )}
      </motion.div>
      <AnimatePresence initial={false}>
        {showBody && (
          <motion.div
            key="body"
            className="card-body"
            data-testid="card-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          >
            <Body card={card} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
