export function UserBubble(p: { text: string }): React.JSX.Element {
  return (
    <div className="user-row">
      <div className="user-bubble">{p.text}</div>
    </div>
  )
}
