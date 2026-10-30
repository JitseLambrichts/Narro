import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Claude answers in markdown. HTML inside an answer stays text (react-markdown's default),
// and unsafe link protocols are dropped by its default URL check.
const components: Components = {
  // Links open in the browser, never inside the app window.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  // The page may not load outside images, so an image shows its description instead.
  img: ({ alt }) => (alt ? <span className="md-image-alt">{alt}</span> : null)
}

const plugins = [remarkGfm]

export const AgentText = memo(function AgentText(p: { text: string }): React.JSX.Element {
  return (
    <div className="agent-text markdown">
      <Markdown remarkPlugins={plugins} components={components}>
        {p.text}
      </Markdown>
    </div>
  )
})
