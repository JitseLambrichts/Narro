import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type RendererApi } from '../shared/ipc'
import type { AppEvent } from '../shared/types'

const api: RendererApi = {
  openProject: () => ipcRenderer.invoke(IPC.openProject),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.saveSettings, patch),
  send: (text) => ipcRenderer.invoke(IPC.send, text),
  stop: () => ipcRenderer.invoke(IPC.stop),
  resolvePermission: (requestId, allow) =>
    ipcRenderer.invoke(IPC.resolvePermission, requestId, allow),
  onEvent(cb) {
    const listener = (_evt: IpcRendererEvent, e: AppEvent): void => cb(e)
    ipcRenderer.on(IPC.event, listener)
    return () => {
      ipcRenderer.removeListener(IPC.event, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
