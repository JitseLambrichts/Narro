import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { ModelId } from '../shared/types'
import type { SettingsStore } from './settings/store'

export interface IpcDeps {
  settings: SettingsStore
  onSettingsSaved(): Promise<void>
  openProject(): Promise<string | null>
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.getSettings, () => deps.settings.view())
  ipcMain.handle(IPC.saveSettings, async (_evt, patch: { apiKey?: string; model?: ModelId }) => {
    await deps.settings.save(patch)
    await deps.onSettingsSaved()
  })
  ipcMain.handle(IPC.openProject, () => deps.openProject())
}
