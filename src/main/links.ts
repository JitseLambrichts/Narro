// Links in Claude's answers open in the user's browser; only web and mail links qualify,
// so a link can never open a local file or another app.
export function isExternalLink(url: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

// The app window only ever shows Narro itself: the same page (a reload) is fine, anything
// else is not.
export function isSamePage(url: string, current: string): boolean {
  try {
    const target = new URL(url)
    const page = new URL(current)
    if (target.protocol === 'file:' || page.protocol === 'file:') {
      return target.protocol === page.protocol && target.pathname === page.pathname
    }
    return target.origin === page.origin
  } catch {
    return false
  }
}
