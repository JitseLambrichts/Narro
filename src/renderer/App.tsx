import { EmptyState } from './ui/EmptyState'

function App(): React.JSX.Element {
  return (
    <div className="app">
      <EmptyState onOpen={() => {}} />
    </div>
  )
}

export default App
