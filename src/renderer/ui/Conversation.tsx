import { useEffect, useLayoutEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ConversationState, Turn, TurnItem } from '../state/conversation'
import { motionFor, type MotionSet } from '../motion/tokens'
import { t } from '../i18n/en'
import { isNearBottom } from './scroll'
import { UserBubble } from './UserBubble'
import { AgentText } from './AgentText'
import { ThinkingLine } from './ThinkingLine'
import { LiveCard } from '../cards/LiveCard'
import { PermissionCard } from '../cards/PermissionCard'
import { TaskChecklist } from '../cards/TaskChecklist'

interface Props {
  state: ConversationState
  onToggleCard(turnId: string, cardId: string): void
  onDecide(requestId: string, allow: boolean): void
}

// Props for an item that fades (and, with full motion, slides) in and keeps its place smoothly.
function appear(m: MotionSet): {
  initial: MotionSet['initial']
  animate: MotionSet['enter']
  exit: MotionSet['exit']
  transition: { layout: MotionSet['layout'] }
} {
  return { initial: m.initial, animate: m.enter, exit: m.exit, transition: { layout: m.layout } }
}

function Item(p: { turn: Turn; item: TurnItem } & Omit<Props, 'state'>): React.JSX.Element {
  const { turn, item } = p
  switch (item.kind) {
    case 'text':
      return <AgentText text={item.text} />
    case 'card':
      return (
        <LiveCard
          card={item.card}
          collapsed={turn.collapsed}
          onToggle={() => p.onToggleCard(turn.id, item.card.id)}
        />
      )
    case 'permission':
      return (
        <PermissionCard
          title={item.title}
          detail={item.detail}
          decision={item.decision}
          onDecide={(allow) => p.onDecide(item.requestId, allow)}
        />
      )
  }
}

function TurnView(p: { turn: Turn; m: MotionSet } & Omit<Props, 'state'>): React.JSX.Element {
  const { turn } = p
  const a = appear(p.m)
  // Items already there when a turn first renders appear as they are; later ones animate in.
  return (
    <div className="turn" data-testid="turn">
      <UserBubble text={turn.userText} />
      <ThinkingLine turn={turn} />
      <TaskChecklist tasks={turn.tasks} />
      <AnimatePresence initial={false}>
        {turn.items.map((item) => (
          <motion.div key={item.id} layout="position" {...a}>
            <Item turn={turn} item={item} onToggleCard={p.onToggleCard} onDecide={p.onDecide} />
          </motion.div>
        ))}
        {turn.status === 'failed' && turn.error && (
          <motion.div key="error" layout {...a} className="turn-error" role="alert">
            {turn.error}
          </motion.div>
        )}
        {turn.status === 'stopped' && (
          <motion.div key="stopped" layout {...a} className="turn-stopped">
            {t.stopped}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Conversation(p: Props): React.JSX.Element {
  const m = motionFor(useReducedMotion() ?? false)
  const scroller = useRef<HTMLDivElement>(null)
  // Whether the reader is at the bottom; reading further up must not be interrupted.
  const stick = useRef(true)
  const autoScrolling = useRef(false)
  const turnCount = useRef(p.state.turns.length)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const newTurn = p.state.turns.length !== turnCount.current
    turnCount.current = p.state.turns.length
    if (!stick.current && !newTurn) return
    stick.current = true
    autoScrolling.current = true
    el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' })
  }, [p.state])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // A wheel, touch or key press during an automatic scroll means the reader takes over.
    const takeOver = (): void => {
      autoScrolling.current = false
    }
    const settle = (): void => {
      autoScrolling.current = false
      stick.current = isNearBottom(el)
    }
    el.addEventListener('wheel', takeOver, { passive: true })
    el.addEventListener('touchstart', takeOver, { passive: true })
    el.addEventListener('keydown', takeOver)
    el.addEventListener('scrollend', settle)
    return () => {
      el.removeEventListener('wheel', takeOver)
      el.removeEventListener('touchstart', takeOver)
      el.removeEventListener('keydown', takeOver)
      el.removeEventListener('scrollend', settle)
    }
  }, [])

  return (
    <div
      ref={scroller}
      className="conversation"
      onScroll={(e) => {
        if (!autoScrolling.current) stick.current = isNearBottom(e.currentTarget)
      }}
    >
      <div className="conversation-column">
        <AnimatePresence initial={false}>
          {p.state.turns.map((turn) => (
            <motion.div key={turn.id} layout="position" {...appear(m)}>
              <TurnView turn={turn} m={m} onToggleCard={p.onToggleCard} onDecide={p.onDecide} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
