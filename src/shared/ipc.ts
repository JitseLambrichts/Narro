import type { AppEvent, ModelId } from './types'

export const IPC = {
  openProject: 'project:open',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  send: 'agent:send',
  stop: 'agent:stop',
  resolvePermission: 'agent:permission',
  event: 'agent:event'
} as const

export interface SettingsView {
  hasApiKey: boolean
  model: ModelId
}

export interface RendererApi {
  openProject(): Promise<string | null>
  getSettings(): Promise<SettingsView>
  saveSettings(patch: { apiKey?: string; model?: ModelId }): Promise<void>
  send(text: string): Promise<{ turnId: string }>
  stop(): Promise<void>
  resolvePermission(requestId: string, allow: boolean): Promise<void>
  onEvent(cb: (e: AppEvent) => void): () => void
}
