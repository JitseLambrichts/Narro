import { app, shell, BrowserWindow, dialog, nativeTheme, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
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
  let win = createWindow()
  let projectDir: string | null = null

  registerIpc({
    settings,
    onSettingsSaved: async () => {},
    openProject: async () => {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      projectDir = result.filePaths[0]
      return projectDir
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
