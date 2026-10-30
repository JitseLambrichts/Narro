import { useCallback, useEffect, useReducer, useState } from 'react'
import type { SettingsView } from '../shared/ipc'
import { initialState, reduce } from './state/conversation'
import { useDirector } from './director/useDirector'
import { Conversation } from './ui/Conversation'
import { Composer } from './ui/Composer'
import { EmptyState } from './ui/EmptyState'
import { SettingsDialog } from './ui/SettingsDialog'
import { TopBar } from './ui/TopBar'

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [state, dispatch] = useReducer(reduce, initialState)

  useEffect(() => {
    window.api.getSettings().then((view) => {
      setSettings(view)
      if (!view.hasApiKey) setSettingsOpen(true)
    })
  }, [])

  useDirector(
    useCallback((events) => events.forEach((event) => dispatch({ type: 'event', event })), [])
  )

  const running = state.turns.at(-1)?.status === 'running'

  async function openProject(): Promise<void> {
    const dir = await window.api.openProject()
    if (dir) setProjectDir(dir)
  }

  async function send(text: string): Promise<void> {
    if (!settings?.hasApiKey) {
      setSettingsOpen(true)
      return
    }
    try {
      const { turnId } = await window.api.send(text)
      dispatch({ type: 'user-sent', turnId, text })
    } catch (err) {
      console.error('[narro] send failed', err)
    }
  }

  return (
    <div className="app">
      <TopBar
        projectName={projectDir ? folderName(projectDir) : null}
        onSettings={() => setSettingsOpen(true)}
      />
      {projectDir ? (
        <Conversation
          state={state}
          onToggleCard={(turnId, cardId) => dispatch({ type: 'toggle-card', turnId, cardId })}
          onDecide={(requestId, allow) => {
            dispatch({ type: 'permission-decided', requestId, allow })
            window.api.resolvePermission(requestId, allow)
          }}
        />
      ) : (
        <EmptyState onOpen={openProject} />
      )}
      <div className="composer-dock">
        <Composer
          running={running}
          disabled={!projectDir}
          onSend={(text) => void send(text)}
          onStop={() => void window.api.stop()}
        />
      </div>
      {settingsOpen && settings && (
        <SettingsDialog
          view={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (patch) => {
            await window.api.saveSettings(patch)
            setSettings(await window.api.getSettings())
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}

export default App
