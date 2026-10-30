import { useEffect, useRef } from 'react'
import type { AppEvent } from '../../shared/types'
import { Director } from './director'

// Feeds agent events through a Director and hands each released batch to onRelease.
export function useDirector(onRelease: (events: AppEvent[]) => void): void {
  const release = useRef(onRelease)
  useEffect(() => {
    release.current = onRelease
  })

  useEffect(() => {
    const director = new Director()
    let timer: ReturnType<typeof setTimeout> | null = null

    const pump = (): void => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      const now = performance.now()
      const events = director.drain(now)
      if (events.length > 0) release.current(events)
      const wakeAt = director.nextWakeAt()
      if (wakeAt !== null) timer = setTimeout(pump, Math.max(0, wakeAt - now))
    }

    const off = window.api.onEvent((e) => {
      director.push(e, performance.now())
      pump()
    })
    return () => {
      off()
      if (timer !== null) clearTimeout(timer)
    }
  }, [])
}
