import { lastfmMetadataBackend } from "./lastfm/definition"
import { deezerMetadataBackend } from "./deezer/definition"
import { appleMetadataBackend } from "./apple/definition"
import type { MetadataBackendDefinition } from "./types"

export const metadataBackends: readonly MetadataBackendDefinition[] = [
  lastfmMetadataBackend,
  deezerMetadataBackend,
  appleMetadataBackend,
]

export function getMetadataBackend(id: string): MetadataBackendDefinition | undefined {
  return metadataBackends.find(b => b.id === id)
}

export type { MetadataBackendDefinition, MetadataCapabilities } from "./types"
