import { useCallback, useEffect, useState } from "react"
import { useMetadataFetch } from "../hooks/useMetadataFetch"
import { usePlayerStore } from "../stores"
import { getTrack } from "../lib/plex"
import { formatMs, formatSize, formatSampleRate } from "../lib/formatters"
import type { Track } from "../types/plex"
import { useLastfmMetadataStore } from "../stores/lastfmMetadataStore"
import type { LastfmTrackInfo } from "../lib/lastfm"
import { useDeezerMetadataStore } from "../stores/deezerMetadataStore"
import type { DeezerArtistInfo } from "../lib/deezer"
import { useDebugStore } from "../stores/debugStore"


interface Props {
  onClose: () => void
}

export default function TrackInfoPanel({ onClose }: Props) {
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const [fullTrack, setFullTrack] = useState<Track | null>(null)
  const getLastfmTrack = useLastfmMetadataStore(s => s.getTrack)
  const [lastfmData, setLastfmData] = useState<LastfmTrackInfo | null>(null)
  const getDeezerArtist = useDeezerMetadataStore(s => s.getArtist)
  const [deezerArtistData, setDeezerArtistData] = useState<DeezerArtistInfo | null>(null)

  // Fetch full metadata to get stream details (bit depth, sample rate, etc.)
  useEffect(() => {
    if (!currentTrack) return
    let cancelled = false
    getTrack(currentTrack.rating_key).then(t => {
      if (!cancelled) setFullTrack(t)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [currentTrack?.rating_key])

  const trackKey = currentTrack?.grandparent_title && currentTrack?.title
    ? `${currentTrack.grandparent_title}||${currentTrack.title}`
    : null
  useMetadataFetch([
    { key: trackKey, fetch: () => getLastfmTrack(currentTrack!.grandparent_title, currentTrack!.title), setState: setLastfmData },
    { key: currentTrack?.grandparent_title, fetch: () => getDeezerArtist(currentTrack!.grandparent_title), setState: setDeezerArtistData },
  ], [currentTrack?.rating_key, getLastfmTrack, getDeezerArtist])

  const debugEnabled = useDebugStore(s => s.debugEnabled)

  const track = fullTrack ?? currentTrack
  if (!track) return null

  const media = track.media?.[0]
  const part = media?.parts?.[0]
  const audioStream = part?.streams?.find(s => s.stream_type === 2)

  const codec = audioStream?.codec ?? media?.audio_codec ?? track.audio_codec
  const channels = audioStream?.channels ?? media?.audio_channels ?? track.audio_channels
  const bitrate = audioStream?.bitrate ?? media?.bitrate ?? track.audio_bitrate
  const bitDepth = audioStream?.bit_depth
  const sampleRate = audioStream?.sampling_rate
  const fileSize = part?.size
  const container = media?.container

  const hasGain = audioStream?.gain != null
  const hasLoudness = audioStream?.loudness != null

  const rows: [string, string][] = []

  if (track.grandparent_title) rows.push(["Artist", track.grandparent_title])
  if (track.parent_title) rows.push(["Album", track.parent_title])
  if (track.parent_year) rows.push(["Year", String(track.parent_year)])
  rows.push(["Duration", formatMs(track.duration)])

  // Audio details
  if (codec) rows.push(["Codec", codec.toUpperCase()])
  if (container && container.toLowerCase() !== codec?.toLowerCase()) rows.push(["Container", container.toUpperCase()])
  if (bitDepth) rows.push(["Bit Depth", `${bitDepth}-bit`])
  if (sampleRate) rows.push(["Sample Rate", formatSampleRate(sampleRate)])
  if (bitrate) rows.push(["Bitrate", `${bitrate} kbps`])
  if (channels) rows.push(["Channels", channels === 2 ? "Stereo" : channels === 1 ? "Mono" : `${channels}ch`])
  if (fileSize) rows.push(["File Size", formatSize(fileSize)])

  // Loudness analysis status
  rows.push(["Loudness Analysis", hasGain || hasLoudness ? "Yes" : "No"])
  if (hasGain) rows.push(["Track Gain", `${audioStream!.gain!.toFixed(1)} dB`])
  if (audioStream?.album_gain != null) rows.push(["Album Gain", `${audioStream.album_gain.toFixed(1)} dB`])
  if (hasLoudness) rows.push(["Loudness", `${audioStream!.loudness!.toFixed(1)} LUFS`])
  if (audioStream?.peak != null) rows.push(["Peak", `${(audioStream.peak * 100).toFixed(1)}%`])

  // Last.fm stats
  if (lastfmData) {
    if (lastfmData.listeners > 0) rows.push(["Listeners (Last.fm)", lastfmData.listeners.toLocaleString()])
    if (lastfmData.play_count > 0) rows.push(["Scrobbles (Last.fm)", lastfmData.play_count.toLocaleString()])
    if (lastfmData.tags.length > 0) rows.push(["Tags (Last.fm)", lastfmData.tags.slice(0, 5).join(", ")])
  }

  // Deezer stats
  if (deezerArtistData?.fans && deezerArtistData.fans > 0) {
    rows.push(["Fans (Deezer)", deezerArtistData.fans.toLocaleString()])
  }

  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(JSON.stringify(track, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [track])

  const debugRows: [string, string][] = []
  if (debugEnabled) {
    debugRows.push(["Rating Key", String(track.rating_key)])
    debugRows.push(["Key", track.key])
    debugRows.push(["Library Section", String(track.library_section_id)])
    if (part?.file) debugRows.push(["File", part.file])
    if (track.music_analysis_version != null) debugRows.push(["Music Analysis v", String(track.music_analysis_version)])
    if (track.view_count != null) debugRows.push(["Play Count", String(track.view_count)])
    if (track.added_at) debugRows.push(["Added At", track.added_at])
    if (track.updated_at) debugRows.push(["Updated At", track.updated_at])
  }

  return (
    <>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">Track Info</h3>
        <div className="flex items-center gap-2">
          {debugEnabled && (
            <button
              onClick={handleCopy}
              className="px-2 py-0.5 rounded text-[10px] bg-white/8 hover:bg-white/14 text-white/50 hover:text-white/80 transition-colors"
            >
              {copied ? "Copied!" : "Copy JSON"}
            </button>
          )}
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="px-4 pb-1">
        <p className="text-sm font-medium text-white truncate">{track.title}</p>
      </div>
      <div className="px-4 pb-3">
        <table className="w-full text-xs">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-white/5 last:border-0">
                <td className="py-1.5 pr-3 text-white/40 whitespace-nowrap">{label}</td>
                <td className="py-1.5 text-white/80 text-right">{value}</td>
              </tr>
            ))}
            {debugRows.length > 0 && (
              <>
                <tr>
                  <td colSpan={2} className="pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/25">
                    Debug
                  </td>
                </tr>
                {debugRows.map(([label, value]) => (
                  <tr key={`dbg-${label}`} className="border-b border-white/5 last:border-0">
                    <td className="py-1.5 pr-3 text-white/30 whitespace-nowrap font-mono">{label}</td>
                    <td className="py-1.5 text-white/55 text-right font-mono break-all">{value}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
