import { useCallback, useEffect, useReducer, useState } from 'react'
import type { AccountView, SettingsView } from '../shared/ipc'
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
  const [account, setAccount] = useState<AccountView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [state, dispatch] = useReducer(reduce, initialState)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getAccount().then((view) => {
      setAccount(view)
      if (!view.signedIn) setSettingsOpen(true)
    })
  }, [])

  function openSettings(): void {
    setSettingsOpen(true)
    // The sign-in can change outside Narro (for example `claude auth logout`), so look again.
    window.api.getAccount().then(setAccount)
  }

  useDirector(
    useCallback((events) => events.forEach((event) => dispatch({ type: 'event', event })), [])
  )

  const running = state.turns.at(-1)?.status === 'running'

  async function openProject(): Promise<void> {
    const dir = await window.api.openProject()
    if (dir) setProjectDir(dir)
  }

  async function send(text: string): Promise<void> {
    // Only a known sign-out blocks sending; while the check is still running the message goes
    // through, and Claude Code itself reports a missing sign-in.
    if (account && !account.signedIn) {
      openSettings()
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
      <TopBar projectName={projectDir ? folderName(projectDir) : null} onSettings={openSettings} />
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
          account={account}
          onClose={() => setSettingsOpen(false)}
          onModelChange={async (model) => {
            await window.api.saveSettings({ model })
            setSettings(await window.api.getSettings())
          }}
          onSignIn={async () => {
            const view = await window.api.signIn()
            setAccount(view)
            return view
          }}
          onCancelSignIn={() => void window.api.cancelSignIn()}
          onSignOut={async () => setAccount(await window.api.signOut())}
        />
      )}
    </div>
  )
}

export default App
