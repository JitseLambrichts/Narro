import type { AppEvent, ModelId } from './types'

export const IPC = {
  openProject: 'project:open',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  getAccount: 'account:get',
  signIn: 'account:sign-in',
  submitSignInCode: 'account:code',
  cancelSignIn: 'account:cancel',
  signOut: 'account:sign-out',
  send: 'agent:send',
  stop: 'agent:stop',
  resolvePermission: 'agent:permission',
  event: 'agent:event'
} as const

export interface SettingsView {
  model: ModelId
}

// The Claude account Claude Code is signed in with; Narro never handles a key itself.
export interface AccountView {
  signedIn: boolean
  email: string | null
}

export interface RendererApi {
  openProject(): Promise<string | null>
  getSettings(): Promise<SettingsView>
  saveSettings(patch: { model?: ModelId }): Promise<void>
  getAccount(): Promise<AccountView>
  signIn(): Promise<AccountView>
  submitSignInCode(code: string): Promise<void>
  cancelSignIn(): Promise<void>
  signOut(): Promise<AccountView>
  send(text: string): Promise<{ turnId: string }>
  stop(): Promise<void>
  resolvePermission(requestId: string, allow: boolean): Promise<void>
  onEvent(cb: (e: AppEvent) => void): () => void
}
