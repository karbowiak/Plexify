import { create } from "zustand"
import { persist } from "zustand/middleware"
import { engine } from "../audio/WebAudioEngine"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EQ_LABELS = ["32", "64", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"]

export type EqGains = [number, number, number, number, number, number, number, number, number, number]

const FLAT: EqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

export const EQ_PRESETS: { name: string; gains: EqGains }[] = [
  { name: "Flat",         gains: [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
  { name: "Bass Boost",   gains: [ 8,  6,  4,  2,  0,  0,  0,  0,  0,  0] },
  { name: "Treble Boost", gains: [ 0,  0,  0,  0,  0,  0,  2,  4,  6,  8] },
  { name: "Vocal",        gains: [-2, -2,  0,  3,  5,  5,  3,  0, -2, -2] },
  { name: "Electronic",   gains: [ 7,  5,  0,  0, -3, -2,  0,  4,  6,  7] },
  { name: "Rock",         gains: [ 5,  4,  3,  1, -1, -1,  0,  3,  4,  5] },
  { name: "Classical",    gains: [ 0,  0,  0,  0,  0,  0, -2, -3, -3, -4] },
]

// ---------------------------------------------------------------------------
// Device Profile
// ---------------------------------------------------------------------------

export interface EqProfile {
  gains: EqGains
  enabled: boolean
  postgainDb: number
  autoPostgain: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute auto postgain dB from current gains: max(0, max_boost). */
function computeAutoPostgainDb(gains: EqGains): number {
  const maxBoost = Math.max(0, ...gains)
  return maxBoost
}

/** Send postgain state to the Web Audio engine. */
function sendPostgain(db: number, auto: boolean) {
  engine.setEqPostgainAuto(auto)
  engine.setEqPostgain(db)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface EqState {
  // Core EQ
  gains: EqGains
  enabled: boolean
  // Postgain (makeup gain)
  postgainDb: number
  autoPostgain: boolean
  // Device profiles
  deviceProfiles: Record<string, EqProfile>
  currentDevice: string

  // Core EQ actions
  setBand: (index: number, db: number) => void
  setEnabled: (enabled: boolean) => void
  applyPreset: (preset: EqGains) => void
  syncToEngine: () => void

  // Postgain actions
  setPostgainDb: (db: number) => void
  setAutoPostgain: (auto: boolean) => void

  // Device profile actions
  setCurrentDevice: (name: string) => void
  saveProfileForDevice: (deviceName: string) => void
  deleteProfileForDevice: (deviceName: string) => void
  loadProfileForDevice: (deviceName: string) => void
}

export const useEqStore = create<EqState>()(
  persist(
    (set, get) => ({
      gains: [...FLAT] as EqGains,
      enabled: false,
      postgainDb: 0,
      autoPostgain: true,
      deviceProfiles: {},
      currentDevice: "",

      setBand: (index, db) => {
        const next = [...get().gains] as EqGains
        next[index] = db
        const updates: Partial<EqState> = { gains: next }
        if (get().autoPostgain) {
          updates.postgainDb = computeAutoPostgainDb(next)
        }
        set(updates)
        if (get().enabled) {
          engine.setEq(next)
        }
      },

      setEnabled: (enabled) => {
        set({ enabled })
        engine.setEqEnabled(enabled)
        if (enabled) {
          const { gains, postgainDb, autoPostgain } = get()
          engine.setEq(gains)
          sendPostgain(postgainDb, autoPostgain)
        }
      },

      applyPreset: (preset) => {
        const updates: Partial<EqState> = { gains: [...preset] as EqGains }
        if (get().autoPostgain) {
          updates.postgainDb = computeAutoPostgainDb(preset)
        }
        set(updates)
        if (get().enabled) {
          engine.setEq(preset)
        }
      },

      syncToEngine: () => {
        const { gains, enabled, postgainDb, autoPostgain } = get()
        engine.setEqEnabled(enabled)
        if (enabled) {
          engine.setEq(gains)
          sendPostgain(postgainDb, autoPostgain)
        }
        // Web Audio API uses system default device — no device query needed
      },

      setPostgainDb: (db) => {
        set({ postgainDb: db, autoPostgain: false })
        engine.setEqPostgainAuto(false)
        engine.setEqPostgain(db)
      },

      setAutoPostgain: (auto) => {
        if (auto) {
          const postgainDb = computeAutoPostgainDb(get().gains)
          set({ autoPostgain: true, postgainDb })
        } else {
          set({ autoPostgain: false })
        }
        sendPostgain(get().postgainDb, auto)
      },

      setCurrentDevice: (name) => {
        set({ currentDevice: name })
        // Auto-load matching profile if one exists
        const profile = get().deviceProfiles[name]
        if (profile) {
          get().loadProfileForDevice(name)
        }
      },

      saveProfileForDevice: (deviceName) => {
        const { gains, enabled, postgainDb, autoPostgain, deviceProfiles } = get()
        set({
          deviceProfiles: {
            ...deviceProfiles,
            [deviceName]: { gains: [...gains] as EqGains, enabled, postgainDb, autoPostgain },
          },
        })
      },

      deleteProfileForDevice: (deviceName) => {
        const { deviceProfiles } = get()
        const next = { ...deviceProfiles }
        delete next[deviceName]
        set({ deviceProfiles: next })
      },

      loadProfileForDevice: (deviceName) => {
        const profile = get().deviceProfiles[deviceName]
        if (!profile) return
        set({
          gains: [...profile.gains] as EqGains,
          enabled: profile.enabled,
          postgainDb: profile.postgainDb,
          autoPostgain: profile.autoPostgain,
        })
        // Sync to engine
        engine.setEqEnabled(profile.enabled)
        if (profile.enabled) {
          engine.setEq(profile.gains)
          sendPostgain(profile.postgainDb, profile.autoPostgain)
        }
      },
    }),
    {
      name: "plex-eq-v1",
      partialize: (state) => ({
        gains: state.gains,
        enabled: state.enabled,
        postgainDb: state.postgainDb,
        autoPostgain: state.autoPostgain,
        deviceProfiles: state.deviceProfiles,
      }),
    },
  ),
)

// No device change listener needed — Web Audio API uses system default
