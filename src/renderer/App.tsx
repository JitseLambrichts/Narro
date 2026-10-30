import { useEffect, useState } from 'react'
import type { SettingsView } from '../shared/ipc'
import { EmptyState } from './ui/EmptyState'
import { SettingsDialog } from './ui/SettingsDialog'

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((view) => {
      setSettings(view)
      if (!view.hasApiKey) setSettingsOpen(true)
    })
  }, [])

  return (
    <div className="app">
      <EmptyState onOpen={() => {}} />
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
