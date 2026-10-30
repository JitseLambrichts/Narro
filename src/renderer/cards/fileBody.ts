import type { FileChange } from '../../shared/types'

// Whether a file card has anything to show below its title.
export function hasFileBody(change: FileChange): boolean {
  return change.tooLarge || change.lines.length > 0
}
