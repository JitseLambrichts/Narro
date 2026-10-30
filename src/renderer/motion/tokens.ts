import type { TargetAndTransition, Transition } from 'motion/react'

export const spring = { type: 'spring', stiffness: 380, damping: 38, mass: 1 } as const
export const fade = { duration: 0.28, ease: [0.16, 1, 0.3, 1] } as const
export const STAGGER_S = 0.03

const REDUCED_FADE = { duration: 0.12 }

export interface MotionSet {
  layout: Transition
  initial: TargetAndTransition
  enter: TargetAndTransition
  exit: TargetAndTransition
}

// With prefers-reduced-motion nothing moves: things only fade, briefly.
export function motionFor(reduced: boolean): MotionSet {
  if (reduced) {
    return {
      layout: { duration: 0 },
      initial: { opacity: 0 },
      enter: { opacity: 1, transition: REDUCED_FADE },
      exit: { opacity: 0, transition: REDUCED_FADE }
    }
  }
  return {
    layout: spring,
    initial: { opacity: 0, y: 10 },
    enter: { opacity: 1, y: 0, transition: fade },
    exit: { opacity: 0, transition: fade }
  }
}
