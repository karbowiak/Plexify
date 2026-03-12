import { useAnnouncerStore } from "../stores/announcerStore"

export default function LiveAnnouncer() {
  const politeMessage = useAnnouncerStore(s => s.politeMessage)
  const assertiveMessage = useAnnouncerStore(s => s.assertiveMessage)

  const srOnly: React.CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  }

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" style={srOnly}>
        {politeMessage}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" style={srOnly}>
        {assertiveMessage}
      </div>
    </>
  )
}
