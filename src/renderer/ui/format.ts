// "2.7s": for steps that take seconds.
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`
}

// "5s" or "1m 12s": for how long a whole turn took.
export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}
