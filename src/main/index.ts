import { app, shell, BrowserWindow, dialog, nativeTheme, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { query } from '@anthropic-ai/claude-agent-sdk'
import icon from '../../resources/icon.png?asset'
import { IPC } from '../shared/ipc'
import type { AppEvent } from '../shared/types'
import { AgentSession } from './agent/session'
import { fakeQuery } from './agent/fakeQuery'
import { createSettingsStore } from './settings/store'
import { registerIpc } from './ipc'

// Tests point the app at a throwaway profile so they never touch real settings.
if (process.env.VISUAL_IDE_USER_DATA) app.setPath('userData', process.env.VISUAL_IDE_USER_DATA)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0d' : '#f6f6f7',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.narro.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Linux test machines usually have no keyring; e2e tests opt into Chromium's fallback key.
  if (process.platform === 'linux' && process.env.VISUAL_IDE_PLAINTEXT_SECRETS === '1') {
    safeStorage.setUsePlainTextEncryption(true)
  }
  const settings = createSettingsStore(app.getPath('userData'), safeStorage)
  const queryFn = process.env.VISUAL_IDE_FAKE_AGENT ? fakeQuery : query

  let win = createWindow()
  let projectDir: string | null = null
  let session: AgentSession | null = null
  // Permission questions waiting for the user, by request id.
  const pending = new Map<string, (allow: boolean) => void>()

  const emit = (e: AppEvent): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.event, e)
  }

  const denyPending = (): void => {
    for (const resolve of pending.values()) resolve(false)
    pending.clear()
  }

  async function ensureSession(): Promise<AgentSession> {
    if (!projectDir) throw new Error('Open a project first.')
    const apiKey = await settings.apiKey()
    if (!apiKey) throw new Error('Add your Anthropic API key in Settings.')
    if (!session) {
      session = new AgentSession({
        queryFn,
        projectDir,
        apiKey,
        model: await settings.model(),
        emit,
        requestPermission: (e) => new Promise((resolve) => pending.set(e.requestId, resolve)),
        now: Date.now,
        newId: randomUUID
      })
    }
    return session
  }

  registerIpc({
    settings,
    onSettingsSaved: async () => {
      const apiKey = await settings.apiKey()
      session?.configure({ ...(apiKey ? { apiKey } : {}), model: await settings.model() })
    },
    openProject: async () => {
      // Tests skip the folder picker.
      let dir = process.env.VISUAL_IDE_PROJECT_DIR ?? null
      if (!dir) {
        const result = await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) return null
        dir = result.filePaths[0]
      }
      if (dir !== projectDir) {
        session?.stop()
        denyPending()
        session = null
        projectDir = dir
      }
      return projectDir
    },
    send: async (text) => {
      const { turnId, done } = (await ensureSession()).send(text)
      done.finally(denyPending)
      return { turnId }
    },
    stop: () => {
      session?.stop()
      denyPending()
    },
    resolvePermission: (requestId, allow) => {
      pending.get(requestId)?.(allow)
      pending.delete(requestId)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
