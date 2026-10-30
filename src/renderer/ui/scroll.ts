export function isNearBottom(
  el: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 80
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}
