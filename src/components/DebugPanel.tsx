import { useEffect, useState } from "react"
import { useDebugPanelStore } from "../stores/debugPanelStore"
import type { Track, Album, Artist } from "../types/plex"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-1.5 pr-4 text-white/40 whitespace-nowrap align-top font-mono text-[11px]">{label}</td>
      <td className="py-1.5 text-white/80 text-right font-mono text-[11px] break-all">{value}</td>
    </tr>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-2">{title}</h4>
      <table className="w-full text-xs">
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function RawJson({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="text-[10px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/50 transition-colors flex items-center gap-1"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
          <path d="M6 4l4 4-4 4V4z" />
        </svg>
        Raw JSON
      </button>
      {expanded && (
        <pre className="mt-2 p-3 rounded bg-white/5 text-[10px] text-white/60 overflow-auto max-h-64 font-mono leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function fmt(v: string | number | null | undefined): string {
  if (v == null) return "—"
  return String(v)
}

// ---------------------------------------------------------------------------
// Per-type content
// ---------------------------------------------------------------------------

function TrackContent({ track }: { track: Track }) {
  const media = track.media?.[0]
  const part = media?.parts?.[0]
  const streams = part?.streams ?? []

  return (
    <>
      <Section title="IDs">
        <Row label="rating_key" value={fmt(track.rating_key)} />
        <Row label="key" value={fmt(track.key)} />
        <Row label="parent_key" value={fmt(track.parent_key)} />
        <Row label="grandparent_key" value={fmt(track.grandparent_key)} />
        <Row label="library_section_id" value={fmt(track.library_section_id)} />
        {track.playlist_item_id != null && <Row label="playlist_item_id" value={fmt(track.playlist_item_id)} />}
        {track.guid && <Row label="guid" value={fmt(track.guid)} />}
      </Section>

      <Section title="File Info">
        <Row label="file" value={part?.file ?? "—"} />
        <Row label="container" value={fmt(media?.container)} />
        <Row label="codec" value={fmt(media?.audio_codec)} />
        <Row label="bitrate" value={media?.bitrate ? `${media.bitrate} kbps` : "—"} />
        <Row label="size" value={part?.size ? `${(part.size / 1024 / 1024).toFixed(1)} MB` : "—"} />
      </Section>

      {streams.length > 0 && (
        <Section title="Streams">
          {streams.map((s, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              <td colSpan={2} className="py-1.5 font-mono text-[11px]">
                <span className="text-white/40">#{i} type={fmt(s.stream_type)} </span>
                <span className="text-white/70">
                  {[
                    s.codec && `codec=${s.codec}`,
                    s.bitrate && `bitrate=${s.bitrate}kbps`,
                    s.channels && `ch=${s.channels}`,
                    s.sampling_rate && `sr=${s.sampling_rate}Hz`,
                    s.bit_depth && `depth=${s.bit_depth}bit`,
                    s.gain != null && `gain=${s.gain.toFixed(2)}dB`,
                    s.loudness != null && `loud=${s.loudness.toFixed(2)}LUFS`,
                    s.peak != null && `peak=${s.peak.toFixed(4)}`,
                  ].filter(Boolean).join("  ")}
                </span>
              </td>
            </tr>
          ))}
        </Section>
      )}

      <Section title="Analysis">
        <Row label="music_analysis_version" value={fmt(track.music_analysis_version)} />
      </Section>

      <Section title="Stats">
        <Row label="view_count" value={fmt(track.view_count)} />
        <Row label="last_viewed_at" value={fmt(track.last_viewed_at)} />
        <Row label="added_at" value={fmt(track.added_at)} />
        <Row label="updated_at" value={fmt(track.updated_at)} />
        <Row label="user_rating" value={fmt(track.user_rating)} />
        {track.distance != null && <Row label="distance" value={track.distance.toFixed(4)} />}
      </Section>

      <RawJson data={track} />
    </>
  )
}

function AlbumContent({ album }: { album: Album }) {
  const tags = (arr: { tag: string }[]) => arr.map(t => t.tag).join(", ") || "—"

  return (
    <>
      <Section title="IDs">
        <Row label="rating_key" value={fmt(album.rating_key)} />
        <Row label="key" value={fmt(album.key)} />
        <Row label="parent_key" value={fmt(album.parent_key)} />
        <Row label="library_section_id" value={fmt(album.library_section_id)} />
        {album.guid && <Row label="guid" value={fmt(album.guid)} />}
        {album.parent_guid && <Row label="parent_guid" value={fmt(album.parent_guid)} />}
      </Section>

      <Section title="Metadata">
        <Row label="leaf_count" value={fmt(album.leaf_count)} />
        <Row label="loudness_analysis_version" value={fmt(album.loudness_analysis_version)} />
        <Row label="studio" value={fmt(album.studio)} />
      </Section>

      <Section title="Tags">
        <Row label="genre" value={tags(album.genre)} />
        <Row label="style" value={tags(album.style)} />
        <Row label="mood" value={tags(album.mood)} />
        <Row label="label" value={tags(album.label)} />
        <Row label="subformat" value={tags(album.subformat)} />
      </Section>

      <Section title="Stats">
        <Row label="view_count" value={fmt(album.viewed_leaf_count)} />
        <Row label="added_at" value={fmt(album.added_at)} />
        <Row label="updated_at" value={fmt(album.updated_at)} />
        <Row label="user_rating" value={fmt(album.user_rating)} />
        {album.distance != null && <Row label="distance" value={album.distance.toFixed(4)} />}
      </Section>

      <RawJson data={album} />
    </>
  )
}

function ArtistContent({ artist }: { artist: Artist }) {
  return (
    <>
      <Section title="IDs">
        <Row label="rating_key" value={fmt(artist.rating_key)} />
        <Row label="key" value={fmt(artist.key)} />
        <Row label="library_section_id" value={fmt(artist.library_section_id)} />
        {artist.guid && <Row label="guid" value={fmt(artist.guid)} />}
      </Section>

      {artist.locations.length > 0 && (
        <Section title="Files">
          {artist.locations.map((loc, i) => (
            <Row key={i} label={`location[${i}]`} value={loc} />
          ))}
        </Section>
      )}

      <Section title="Media">
        <Row label="theme" value={fmt(artist.theme)} />
        <Row label="art" value={fmt(artist.art)} />
      </Section>

      <Section title="Stats">
        <Row label="added_at" value={fmt(artist.added_at)} />
        <Row label="updated_at" value={fmt(artist.updated_at)} />
        <Row label="user_rating" value={fmt(artist.user_rating)} />
        {artist.rating != null && <Row label="rating" value={artist.rating.toFixed(2)} />}
        {artist.distance != null && <Row label="distance" value={artist.distance.toFixed(4)} />}
      </Section>

      <RawJson data={artist} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DebugPanel() {
  const { open, type, data, close } = useDebugPanelStore()
  const [copied, setCopied] = useState(false)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, close])

  if (!open || !type || !data) return null

  const title = `Debug — ${type.charAt(0).toUpperCase() + type.slice(1)}`
  const subtitle = (data as Track | Album | Artist).title ?? ""

  function handleCopy() {
    void navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/60"
        onClick={close}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-white/10 bg-[#16161a] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 flex-shrink-0">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">{title}</span>
              {subtitle && <span className="ml-2 text-xs text-white/50 truncate">{subtitle}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1 rounded text-xs bg-white/8 hover:bg-white/14 text-white/70 hover:text-white transition-colors"
              >
                {copied ? "Copied!" : "Copy JSON"}
              </button>
              <button
                onClick={close}
                className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
                aria-label="Close"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {type === "track" && <TrackContent track={data as Track} />}
            {type === "album" && <AlbumContent album={data as Album} />}
            {type === "artist" && <ArtistContent artist={data as Artist} />}
          </div>
        </div>
      </div>
    </>
  )
}
