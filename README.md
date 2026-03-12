# Hibiki

A Spotify-inspired desktop music client for [Plex](https://www.plex.tv/), built with Tauri 2 and React 19. Browse your library, play tracks with a Web Audio engine, manage playlists, explore radio & DJ modes, discover podcasts, enjoy visualizers, and more — all from a fast, frameless desktop app.

> Frontend layout and design based on [tauri-spotify-clone](https://github.com/agmmnn/tauri-spotify-clone) by [@agmmnn](https://github.com/agmmnn).

## Features

### Playback
- Web Audio engine with modular DSP chain — FLAC, MP3, AAC, ALAC, Ogg Vorbis, WAV
- Gapless playback + crossfade with album-aware, time-based, and MixRamp modes
- Dual-deck architecture with seamless track transitions
- 10-band parametric EQ with built-in presets
- Preamp, postgain, and limiter DSP nodes
- Sleep timer

### Radio & Discovery
- Track Radio, Artist Radio, Plex Stations
- 6 DJ modes — Stretch, Gemini, Freeze, Twofer, Contempo, Groupie
- Internet radio via radio-browser.info with ICY metadata parsing

### Podcasts
- iTunes + Podcast Index search
- Top charts by category
- Subscribe & play episodes

### Visualizer
- **Compact** — waveform, spectrum, oscilloscope, VU meter
- **Fullscreen** — spectrum, oscilloscope, VU, starfield, Milkdrop (butterchurn)
- 555 Milkdrop presets with browser, favorites, and auto-cycle

### Library
- Home hubs & recommendations
- Playlists page with smart playlists and infinite scroll + virtual scrolling
- Liked tracks, albums, and artists
- Tag / genre browsing
- Draggable sidebar playlists
- Full-text search across tracks, albums, and artists
- Plex websocket for real-time library updates

### Metadata & Integrations
- **Last.fm** — scrobble, now-playing, love/unlove, metadata augment or replace mode
- **Deezer** — artist images, album covers, genres, fan counts
- **iTunes** — image fallback
- Synced lyrics display with adjustable offset

### Image Caching
- Custom `image://` URI scheme with on-disk cache
- Multi-provider fallback: Plex → Deezer → iTunes

### Appearance
- 9 accent colors + custom hex picker with color picker
- Dark / light theme
- Font selection
- Card size slider
- Compact mode
- Reduced motion support
- Easter eggs

### Accessibility & Usability
- Global keyboard hotkeys with help modal
- Live announcer for screen readers
- Reduced motion preference
- i18n scaffolding (English)

### Platform
- OS media keys (macOS / Windows / Linux via souvlaki)
- Desktop notifications
- Auto-updater
- Plex.tv OAuth sign-in
- Local SQLite database
- Window state persistence

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript |
| Styling | Tailwind CSS v3 |
| Routing | Wouter |
| State | Zustand v5 |
| Desktop shell | Tauri v2 |
| Backend | Rust (Tauri commands) |
| Audio engine | Web Audio API (custom modular DSP) |
| Media keys | souvlaki |
| Database | rusqlite (SQLite, WAL mode) |
| Visualizer | butterchurn (Milkdrop) |
| Drag-and-drop | dnd-kit |
| Icons | Tabler Icons |
| Package manager | Bun |

## Download & Install

Grab the latest release for your platform from the [Releases page](https://github.com/karbowiak/hibiki/releases).

| Platform | File | Notes |
|---|---|---|
| **Windows** | `.exe` (NSIS installer) | Run the installer and follow the prompts |
| **macOS (Apple Silicon)** | `.dmg` (aarch64) | Drag Hibiki into Applications |
| **macOS (Intel)** | `.dmg` (x86_64) | Drag Hibiki into Applications |
| **Linux** | `.AppImage` / `.deb` | See below |

### macOS — Security Warning

Hibiki is not currently code-signed or notarized with Apple, so macOS Gatekeeper will block it. Run this in Terminal after downloading to remove the quarantine flag:

```bash
# Remove quarantine from the downloaded .dmg
xattr -cr ~/Downloads/Hibiki_*.dmg
```

Then open the `.dmg` and drag Hibiki into Applications as usual. If macOS still shows a warning when launching the app:

```bash
# Remove quarantine from the installed app
xattr -cr /Applications/Hibiki.app
```

Alternatively, you can **right-click** the app in Applications, click **Open**, then click **Open** again in the dialog — macOS remembers your choice after the first time.

### Windows — SmartScreen Warning

Hibiki is not currently code-signed, so Windows SmartScreen may show a warning when you run the installer:

1. Click **More info**
2. Click **Run anyway**

### Linux

No special steps needed. For `.AppImage` files, make them executable first:

```bash
chmod +x Hibiki_*.AppImage
./Hibiki_*.AppImage
```

For `.deb` packages:

```bash
sudo dpkg -i hibiki_*.deb
```

### First Launch

You'll need a running Plex Media Server with a music library. On first launch, open Settings and enter your server URL (e.g. `https://192.168.1.100:32400`) and your [Plex token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/), or sign in with Plex.tv OAuth.

## Building from Source

```bash
git clone https://github.com/karbowiak/hibiki.git
cd Hibiki
bun install
```

```bash
bun run tauri dev   # development
bun run tauri build # production bundle
```

## Project Structure

```
.
├── src/                           # React/TypeScript frontend
│   ├── components/
│   │   ├── Pages/                 # Full-page views (Home, Artist, Album, Playlists, Search, Radio, Podcasts, …)
│   │   ├── Player.tsx             # Playback bar
│   │   ├── SideBar.tsx
│   │   ├── TopBar.tsx
│   │   ├── HotkeyHelpModal.tsx    # Keyboard shortcut reference
│   │   └── LiveAnnouncer.tsx      # Accessibility live region
│   ├── audio/
│   │   ├── WebAudioEngine.ts      # Main audio engine orchestrator
│   │   └── engine/                # Modular Web Audio DSP
│   │       ├── deck.ts            #   Audio deck (source + gain + scheduling)
│   │       ├── deckManager.ts     #   Dual-deck crossfade manager
│   │       ├── signalChain.ts     #   DSP node routing
│   │       ├── scheduler.ts       #   Gapless scheduling & preload
│   │       ├── analyserBridge.ts  #   Analyser node for visualizers
│   │       ├── crossfade/         #   Crossfade strategies (album-aware, time-based, MixRamp)
│   │       └── dsp/               #   DSP nodes (EQ, preamp, postgain, limiter)
│   ├── stores/                    # Zustand stores
│   │   ├── playerStore.ts         #   Playback state machine, crossfade, queue
│   │   ├── libraryStore.ts        #   Playlists, hubs, recentlyAdded, prefetch
│   │   ├── eqStore.ts             #   10-band EQ state & presets
│   │   ├── radioStreamStore.ts    #   Internet radio streams
│   │   ├── sleepTimerStore.ts     #   Sleep timer
│   │   ├── visualizerStore.ts     #   Visualizer settings & presets
│   │   └── …                      #   More (accent, font, theme, compact, custom colors, …)
│   ├── backends/plex/             # Plex backend
│   │   ├── provider.ts            #   MusicProvider implementation
│   │   ├── connectionStore.ts     #   Server connection & settings
│   │   ├── websocket.ts           #   Real-time Plex notifications
│   │   └── …                      #   API, mappers, image URL, types
│   ├── metadata/                  # Metadata providers (enrichment, not playback)
│   │   ├── apple/                 #   iTunes image fallback
│   │   ├── deezer/                #   Artist images, genres, fan counts
│   │   └── lastfm/                #   Scrobbling, now-playing, love/unlove
│   ├── i18n/                      # Internationalization
│   ├── hooks/                     # Custom hooks (hotkeys, media image, reduced motion, …)
│   ├── lib/                       # Utilities (image URL, ICY parser, app menu)
│   └── types/                     # TypeScript interfaces
│
└── src-tauri/src/                 # Rust backend
    ├── main.rs                    # App setup, state, command registrations
    ├── commands.rs                # #[tauri::command] handlers
    │
    ├── plex/                      # Plex API client
    │   ├── client.rs              #   HTTP client with retry/backoff
    │   ├── models.rs              #   Serde data types (Track, Album, Artist, Playlist, …)
    │   ├── library.rs             #   Browse sections, search, tags, on_deck, recently_added
    │   ├── playlist.rs            #   Playlist CRUD + smart playlists
    │   ├── playqueue.rs           #   PlayQueue management
    │   ├── discovery.rs           #   Hubs & recommendations
    │   ├── history.rs             #   Playback tracking & scrobbling
    │   ├── collection.rs          #   Collections & favorites
    │   ├── audio.rs               #   Sonic similarity, track/artist radio
    │   ├── lyrics.rs              #   Synced & plain lyrics
    │   ├── streaming.rs           #   Stream URL builders
    │   ├── server.rs              #   Server identity & info
    │   └── auth.rs                #   Settings persistence
    │
    ├── db/                        # Local SQLite database
    │   ├── schema.rs              #   Migration runner
    │   ├── kv.rs                  #   Key-value store
    │   ├── artists.rs             #   Artist CRUD + locations + tags
    │   ├── albums.rs              #   Album CRUD + tags + reviews
    │   ├── tracks.rs              #   Track CRUD + media chain + lyrics
    │   ├── playlists.rs           #   Playlist CRUD + membership
    │   └── migrations/            #   SQL migration files
    │
    ├── itunes_throttle.rs         # iTunes rate limiter
    ├── podcast.rs                 # Podcast RSS feed parser
    ├── podcastindex.rs            # Podcast Index API
    ├── radiobrowser.rs            # radio-browser.info API
    ├── mediasession.rs            # OS media key integration (souvlaki)
    └── plextv.rs                  # Plex.tv OAuth authentication
```

## Running Tests

```bash
bun run test
# or directly:
cd src-tauri && cargo test
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
