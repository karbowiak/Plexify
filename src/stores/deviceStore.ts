import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useEqStore } from "./eqStore"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioOutputDevice {
  name: string
  is_default: boolean
}

interface DeviceState {
  devices: AudioOutputDevice[]
  currentDevice: string

  initDeviceTracking: () => void
  refreshDevices: () => Promise<void>
  dispose: () => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let unlisten: UnlistenFn | null = null

export const useDeviceStore = create<DeviceState>()((set, get) => ({
  devices: [],
  currentDevice: "",

  initDeviceTracking: () => {
    // Fetch initial state
    void get().refreshDevices()

    // Listen for device changes from the Rust backend
    void listen<string>("audio-device-changed", (event) => {
      const deviceName = event.payload
      set({ currentDevice: deviceName })

      const eqState = useEqStore.getState()
      if (eqState.currentDevice !== deviceName) {
        eqState.setCurrentDevice(deviceName)
      }

      // Also refresh the full device list
      void get().refreshDevices()
    }).then((fn) => {
      unlisten = fn
    })
  },

  refreshDevices: async () => {
    try {
      const [devices, currentDevice] = await Promise.all([
        invoke<AudioOutputDevice[]>("get_audio_output_devices"),
        invoke<string>("get_audio_output_device"),
      ])
      set({ devices, currentDevice })

      const eqState = useEqStore.getState()
      if (eqState.currentDevice !== currentDevice) {
        eqState.setCurrentDevice(currentDevice)
      }
    } catch {
      // Tauri invoke failed — running in browser dev mode or command not available
    }
  },

  dispose: () => {
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  },
}))
