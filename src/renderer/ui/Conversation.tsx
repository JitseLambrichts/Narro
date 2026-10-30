import { useEffect, useLayoutEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ConversationState, Turn, TurnItem } from '../state/conversation'
import { fade, spring } from '../motion/tokens'
import { t } from '../i18n/en'
import { isNearBottom } from './scroll'
import { UserBubble } from './UserBubble'
import { AgentText } from './AgentText'

interface Props {
  state: ConversationState
  onToggleCard(turnId: string, cardId: string): void
  onDecide(requestId: string, allow: boolean): void
}

const enter = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }
const transition = { layout: spring, default: fade }

function Item(p: { turn: Turn; item: TurnItem }): React.JSX.Element | null {
  const { item } = p
  if (item.kind === 'text') return <AgentText text={item.text} />
  return null
}

function TurnView(p: { turn: Turn } & Omit<Props, 'state'>): React.JSX.Element {
  const { turn } = p
  // Items already there when a turn first renders appear as they are; later ones animate in.
  return (
    <div className="turn" data-testid="turn">
      <UserBubble text={turn.userText} />
      <AnimatePresence initial={false}>
        {turn.items.map((item) => (
          <motion.div key={item.id} layout="position" {...enter} transition={transition}>
            <Item turn={turn} item={item} />
          </motion.div>
        ))}
        {turn.status === 'failed' && turn.error && (
          <motion.div
            key="error"
            layout
            {...enter}
            transition={transition}
            className="turn-error"
            role="alert"
          >
            {turn.error}
          </motion.div>
        )}
        {turn.status === 'stopped' && (
          <motion.div
            key="stopped"
            layout
            {...enter}
            transition={transition}
            className="turn-stopped"
          >
            {t.stopped}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Conversation(p: Props): React.JSX.Element {
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
            <motion.div key={turn.id} layout="position" {...enter} transition={transition}>
              <TurnView turn={turn} onToggleCard={p.onToggleCard} onDecide={p.onDecide} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
