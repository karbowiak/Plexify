import { useRef, useEffect } from "react"
import { usePlayerStore, useConnectionStore, buildPlexImageUrl } from "../stores"
import { reportTimeline } from "../lib/plex"

function formatMs(ms: number): string {
  if (!ms || isNaN(ms)) return "0:00"
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
}

export function Player() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const positionRef = useRef(0)

  const {
    currentTrack,
    isPlaying,
    streamUrl,
    positionMs,
    volume,
    shuffle,
    repeat,
    pause,
    resume,
    next,
    prev,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    updatePosition,
  } = usePlayerStore()

  const { baseUrl, token } = useConnectionStore()

  // Keep positionRef in sync for the timeline reporting interval
  positionRef.current = positionMs

  // Sync play/pause with audio element
  useEffect(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.play().catch(console.error)
    } else {
      audioRef.current.pause()
    }
  }, [isPlaying])

  // Load new stream URL when track changes
  useEffect(() => {
    if (!audioRef.current || !streamUrl) return
    audioRef.current.src = streamUrl
    audioRef.current.load()
    if (isPlaying) {
      audioRef.current.play().catch(console.error)
    }
  }, [streamUrl])

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  // Report timeline to Plex every 10 seconds during playback
  useEffect(() => {
    if (!currentTrack || !isPlaying) return
    const id = setInterval(() => {
      void reportTimeline(currentTrack.rating_key, "playing", positionRef.current, currentTrack.duration)
    }, 10000)
    return () => clearInterval(id)
  }, [currentTrack?.rating_key, isPlaying])

  // Media session action handlers — wire OS media keys / headphone controls / Control Center
  useEffect(() => {
    if (!navigator.mediaSession) return
    navigator.mediaSession.setActionHandler("play", () => resume())
    navigator.mediaSession.setActionHandler("pause", () => pause())
    navigator.mediaSession.setActionHandler("previoustrack", () => prev())
    navigator.mediaSession.setActionHandler("nexttrack", () => next())
    navigator.mediaSession.setActionHandler("stop", () => pause())
    return () => {
      for (const action of ["play", "pause", "previoustrack", "nexttrack", "stop"] as const) {
        navigator.mediaSession.setActionHandler(action, null)
      }
    }
  }, [])

  // Media session metadata + playback state — update whenever track or play state changes
  useEffect(() => {
    if (!navigator.mediaSession) return
    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.grandparent_title,
        album: currentTrack.parent_title,
      })
    }
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
  }, [currentTrack?.rating_key, isPlaying])

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = parseFloat(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = ms / 1000
    updatePosition(ms)
  }

  const thumbUrl = currentTrack?.thumb
    ? buildPlexImageUrl(baseUrl, token, currentTrack.thumb)
    : null

  const progressPct = currentTrack?.duration
    ? (positionMs / currentTrack.duration) * 100
    : 0

  const repeatActive = repeat > 0
  const shuffleActive = shuffle

  return (
    <div className="border-t border-[#282828]">
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) updatePosition(audioRef.current.currentTime * 1000)
        }}
        onEnded={next}
      />

      <div className="flex h-fit w-screen min-w-[620px] flex-col overflow-clip rounded-b-lg bg-[#181818]">
        <div className="h-24">
          <div className="flex h-full items-center justify-between px-4">

            {/* Left: current track info */}
            <div className="w-[30%] min-w-[11.25rem]">
              <div className="flex items-center">
                <div className="mr-3 flex items-center">
                  <div className="mr-3 h-14 w-14 flex-shrink-0">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-[#282828]" />
                    )}
                  </div>
                  <div>
                    <h6 className="line-clamp-1 text-sm text-white">
                      {currentTrack?.title ?? ""}
                    </h6>
                    <p className="text-[0.688rem] text-white text-opacity-70">
                      {currentTrack?.grandparent_title ?? ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Center: controls + progress */}
            <div className="flex w-[40%] max-w-[45.125rem] flex-col items-center px-4 pt-2">
              <div className="flex items-center gap-x-2">

                {/* Shuffle */}
                <button
                  onClick={toggleShuffle}
                  className={`flex h-8 w-8 items-center justify-center transition-colors ${shuffleActive ? "text-[#1db954]" : "text-white text-opacity-70 hover:text-opacity-100"}`}
                >
                  <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.5H0V14h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356a2.25 2.25 0 0 1 1.724-.804h1.947l-1.017 1.018a.75.75 0 0 0 1.06 1.06L15.98 3.75 13.15.922zM.391 3.5H0V2h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.796-2.14A2.25 2.25 0 0 0 .39 3.5z" />
                    <path d="m7.5 10.723.98-1.167.957 1.14a2.25 2.25 0 0 0 1.724.804h1.947l-1.017-1.018a.75.75 0 1 1 1.06-1.06l2.829 2.828-2.829 2.828a.75.75 0 1 1-1.06-1.06L13.109 13H11.16a3.75 3.75 0 0 1-2.873-1.34l-.787-.938z" />
                  </svg>
                </button>

                {/* Prev */}
                <button
                  onClick={prev}
                  className="flex h-8 w-8 items-center justify-center text-white text-opacity-70 hover:text-opacity-100"
                >
                  <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z" />
                  </svg>
                </button>

                {/* Play/Pause */}
                <button
                  onClick={isPlaying ? pause : resume}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:scale-[1.06]"
                >
                  {isPlaying ? (
                    <svg role="img" height="16" width="16" viewBox="0 0 16 16">
                      <path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z" />
                    </svg>
                  ) : (
                    <svg role="img" height="16" width="16" viewBox="0 0 16 16">
                      <path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z" />
                    </svg>
                  )}
                </button>

                {/* Next */}
                <button
                  onClick={next}
                  className="flex h-8 w-8 items-center justify-center text-white text-opacity-70 hover:text-opacity-100"
                >
                  <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z" />
                  </svg>
                </button>

                {/* Repeat */}
                <button
                  onClick={cycleRepeat}
                  className={`flex h-8 w-8 items-center justify-center transition-colors ${repeatActive ? "text-[#1db954]" : "text-white text-opacity-70 hover:text-opacity-100"}`}
                >
                  <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5z" />
                  </svg>
                </button>
              </div>

              {/* Progress bar */}
              <div className="mt-1.5 flex w-full items-center gap-x-2">
                <div className="text-[0.688rem] text-white text-opacity-70">
                  {formatMs(positionMs)}
                </div>
                <div className="flex h-7 w-full items-center">
                  <input
                    type="range"
                    min={0}
                    max={currentTrack?.duration ?? 0}
                    value={positionMs}
                    onChange={handleSeek}
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[#535353] accent-[#1db954]"
                    style={{
                      background: `linear-gradient(to right, #1db954 0%, #1db954 ${progressPct}%, #535353 ${progressPct}%, #535353 100%)`,
                    }}
                  />
                </div>
                <div className="text-[0.688rem] text-white text-opacity-70">
                  {formatMs(currentTrack?.duration ?? 0)}
                </div>
              </div>
            </div>

            {/* Right: volume */}
            <div className="flex w-[30%] min-w-[11.25rem] items-center justify-end gap-1">
              <svg role="presentation" height="16" width="16" viewBox="0 0 16 16" fill="currentColor" className="text-white text-opacity-70">
                <path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.642 3.642 0 0 1-1.33-4.967 3.639 3.639 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.139 2.139 0 0 0 0 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 6.087a4.502 4.502 0 0 0 0-8.474v1.65a2.999 2.999 0 0 1 0 5.175v1.649z" />
              </svg>
              <div className="w-[5.813rem]">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={e => setVolume(parseInt(e.target.value, 10))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full"
                  style={{
                    background: `linear-gradient(to right, white 0%, white ${volume}%, #535353 ${volume}%, #535353 100%)`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
