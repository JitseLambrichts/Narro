import type { AppEvent, ModelId } from './types'

export const IPC = {
  openProject: 'project:open',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  getAccount: 'account:get',
  signIn: 'account:sign-in',
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

// How Claude Code is signed in. Narro only reads this; the credentials stay with Claude Code.
export interface AccountView {
  signedIn: boolean
  email: string | null
  // 'claude': a Claude account; 'api-key': the user's own API key, set up for Claude Code.
  method: 'claude' | 'api-key' | null
}

export interface RendererApi {
  openProject(): Promise<string | null>
  getSettings(): Promise<SettingsView>
  saveSettings(patch: { model?: ModelId }): Promise<void>
  getAccount(): Promise<AccountView>
  signIn(): Promise<AccountView>
  cancelSignIn(): Promise<void>
  signOut(): Promise<AccountView>
  send(text: string): Promise<{ turnId: string }>
  stop(): Promise<void>
  resolvePermission(requestId: string, allow: boolean): Promise<void>
  onEvent(cb: (e: AppEvent) => void): () => void
}
