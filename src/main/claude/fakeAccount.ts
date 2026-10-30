import type { AccountView } from '../../shared/ipc'
import type { ClaudeAccount } from './account'

// A Claude account for tests (VISUAL_IDE_FAKE_AGENT): signing in always works, no browser.
export function createFakeAccount(signedIn: boolean): ClaudeAccount {
  let state = signedIn
  const view = (): AccountView => ({ signedIn: state, email: state ? 'test@example.com' : null })
  return {
    status: async () => view(),
    signIn: async () => {
      state = true
      return view()
    },
    submitCode: () => {},
    cancelSignIn: () => {},
    signOut: async () => {
      state = false
      return view()
    }
  }
}
