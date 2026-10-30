import { describe, it, expect, vi, beforeAll } from 'vitest'
import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '../shared/ipc'

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() }
}))

let exposedName: string
let exposed: RendererApi
const api = (): RendererApi => exposed

describe('preload bridge', () => {
  beforeAll(async () => {
    await import('./index')
    const [name, value] = vi.mocked(contextBridge.exposeInMainWorld).mock.calls[0]
    exposedName = name
    exposed = value as RendererApi
  })

  it('exposes window.api under the name "api"', () => {
    expect(exposedName).toBe('api')
    expect(Object.keys(exposed).sort()).toEqual([
      'cancelSignIn',
      'getAccount',
      'getSettings',
      'onEvent',
      'openProject',
      'resolvePermission',
      'saveSettings',
      'send',
      'signIn',
      'signOut',
      'stop'
    ])
  })

  it('send invokes the agent:send channel', async () => {
    await api().send('hi')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('agent:send', 'hi')
  })

  it('signIn invokes the account:sign-in channel', async () => {
    await api().signIn()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('account:sign-in')
  })

  it('resolvePermission passes the request id and the decision', async () => {
    await api().resolvePermission('r1', false)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('agent:permission', 'r1', false)
  })

  it('onEvent subscribes to agent:event and the returned function unsubscribes the same listener', () => {
    const cb = vi.fn()
    const off = api().onEvent(cb)
    const listener = vi.mocked(ipcRenderer.on).mock.calls[0][1]
    expect(vi.mocked(ipcRenderer.on).mock.calls[0][0]).toBe('agent:event')
    listener({} as Electron.IpcRendererEvent, { kind: 'text', turnId: 't', at: 0, text: 'x' })
    expect(cb).toHaveBeenCalledWith({ kind: 'text', turnId: 't', at: 0, text: 'x' })
    off()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('agent:event', listener)
  })
})
