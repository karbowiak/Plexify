import type { ProviderCapabilities } from "../providers/types"
import type { ComponentType } from "react"

export interface BackendDefinition {
  id: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  capabilities: ProviderCapabilities
  SettingsComponent: ComponentType
  useIsConnected: () => boolean
  loadAndConnect: () => Promise<void>
  disconnectAndClear: () => Promise<void>
}
