import { create } from "zustand"

const STORAGE_KEY = "plex-debug-enabled"

interface DebugState {
  debugEnabled: boolean
  setDebugEnabled: (v: boolean) => void
}

export const useDebugStore = create<DebugState>(() => ({
  debugEnabled: localStorage.getItem(STORAGE_KEY) === "1",

  setDebugEnabled: (v: boolean) => {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0")
    useDebugStore.setState({ debugEnabled: v })
  },
}))
