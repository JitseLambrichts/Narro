import { useEffect, useState } from 'react'

// The current time, refreshed every `intervalMs` while `active`; for live timers.
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])
  return active ? now : Date.now()
}
