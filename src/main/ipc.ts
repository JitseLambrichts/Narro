import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { ModelId } from '../shared/types'
import type { ClaudeAccount } from './claude/account'
import type { SettingsStore } from './settings/store'

export interface IpcDeps {
  settings: SettingsStore
  account: ClaudeAccount
  onSettingsSaved(): Promise<void>
  openProject(): Promise<string | null>
  send(text: string): Promise<{ turnId: string }>
  stop(): void
  resolvePermission(requestId: string, allow: boolean): void
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.getSettings, () => deps.settings.view())
  ipcMain.handle(IPC.saveSettings, async (_evt, patch: { model?: ModelId }) => {
    await deps.settings.save(patch)
    await deps.onSettingsSaved()
  })
  ipcMain.handle(IPC.getAccount, () => deps.account.status())
  ipcMain.handle(IPC.signIn, () => deps.account.signIn())
  ipcMain.handle(IPC.cancelSignIn, () => deps.account.cancelSignIn())
  ipcMain.handle(IPC.signOut, () => deps.account.signOut())
  ipcMain.handle(IPC.openProject, () => deps.openProject())
  ipcMain.handle(IPC.send, (_evt, text: string) => deps.send(String(text)))
  ipcMain.handle(IPC.stop, () => deps.stop())
  ipcMain.handle(IPC.resolvePermission, (_evt, requestId: string, allow: boolean) =>
    deps.resolvePermission(String(requestId), allow === true)
  )
}
