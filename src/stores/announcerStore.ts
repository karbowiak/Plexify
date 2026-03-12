import { create } from "zustand"

interface AnnouncerState {
  politeMessage: string
  assertiveMessage: string
  announce: (text: string, priority?: "polite" | "assertive") => void
}

export const useAnnouncerStore = create<AnnouncerState>()((set) => ({
  politeMessage: "",
  assertiveMessage: "",

  announce: (text: string, priority: "polite" | "assertive" = "polite") => {
    const key = priority === "assertive" ? "assertiveMessage" : "politeMessage"
    // Two-step DOM update: clear first, then set on next microtask.
    // This forces ARIA live regions to re-announce even if the text is the same.
    set({ [key]: "" })
    queueMicrotask(() => {
      set({ [key]: text })
    })
  },
}))
