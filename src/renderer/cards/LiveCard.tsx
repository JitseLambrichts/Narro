import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { CardModel } from '../state/conversation'
import { cardTitle } from '../state/cardTitle'
import { motionFor } from '../motion/tokens'
import { t } from '../i18n/en'
import { FileCard } from './FileCard'
import { hasFileBody } from './fileBody'
import { ChangeStats, FilesGroupCard } from './FilesGroupCard'
import { CommandCode, CommandSummary } from './CommandCard'
import { ActivityCard } from './ActivityCard'
import { TableCard, TableStats } from './TableCard'

// What a card shows without any code: the visual part.
function hasSummary(card: CardModel): boolean {
  if (card.files !== null) return true
  switch (card.change.type) {
    case 'file':
      return false
    case 'command':
      return card.change.changedFiles.length > 0
    case 'activity':
      return card.change.items.length > 1
    case 'table':
      return true
  }
}

// Code stays out of sight until someone asks for it.
function hasCode(card: CardModel): boolean {
  if (card.files !== null) return false
  switch (card.change.type) {
    case 'file':
      return hasFileBody(card.change)
    case 'command':
      return card.change.command !== ''
    default:
      return false
  }
}

function Summary(p: { card: CardModel }): React.JSX.Element | null {
  const { card } = p
  if (card.files !== null) return <FilesGroupCard files={card.files} working={card.working} />
  switch (card.change.type) {
    case 'command':
      return card.change.changedFiles.length > 0 ? <CommandSummary change={card.change} /> : null
    case 'activity':
      return <ActivityCard change={card.change} />
    case 'table':
      return <TableCard change={card.change} />
    default:
      return null
  }
}

function Code(p: { card: CardModel }): React.JSX.Element | null {
  const { change } = p.card
  if (change.type === 'file') return <FileCard change={change} />
  if (change.type === 'command') return <CommandCode change={change} />
  return null
}

function Stats(p: { card: CardModel }): React.JSX.Element | null {
  const { card } = p
  if (card.files !== null || card.status === 'working') return null
  const { change } = card
  if (change.type === 'file' && !change.tooLarge) {
    return <ChangeStats added={change.added} removed={change.removed} />
  }
  if (change.type === 'command' && change.durationMs !== null) {
    return <span className="command-time">{t.seconds(change.durationMs)}</span>
  }
  if (change.type === 'table') return <TableStats change={change} />
  return null
}

export function LiveCard(p: {
  card: CardModel
  collapsed: boolean
  onToggle(): void
}): React.JSX.Element {
  const { card } = p
  const m = motionFor(useReducedMotion() ?? false)
  const [codeOpen, setCodeOpen] = useState(false)
  const summary = hasSummary(card)
  const code = hasCode(card)
  const pill = p.collapsed && !card.expanded
  const showCode = code && codeOpen && !pill
  const showBody = !pill && (summary || showCode)

  return (
    <motion.div
      layout
      transition={{ layout: m.layout }}
      className={pill ? 'card pill' : 'card'}
      data-status={card.status}
      data-testid="live-card"
      aria-busy={card.status === 'working'}
    >
      <motion.div layout="position" transition={{ layout: m.layout }} className="card-head">
        <span className={`dot ${card.status}`} aria-hidden="true" />
        <span className="card-title">{cardTitle(card)}</span>
        {!pill && <Stats card={card} />}
        {code && !pill && (
          <button type="button" className="link-button" onClick={() => setCodeOpen(!codeOpen)}>
            {codeOpen ? t.hideCode : t.showCode}
          </button>
        )}
        {p.collapsed && (summary || code) && (
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
            animate={{ opacity: 1, transition: m.enter.transition }}
            exit={m.exit}
          >
            {summary && <Summary card={card} />}
            {showCode && <Code card={card} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
