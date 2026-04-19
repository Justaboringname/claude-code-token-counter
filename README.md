# Claude Code Token Counter

macOS popover app that shows how many tokens Claude Code has used and what they would cost. Parses `~/.claude/projects/**/*.jsonl` directly — no API keys, no network calls, works offline.

## Features

- **Cost breakdown by range**: Live / Session / Today / Week / Month / All-time
- **Per-model totals** with accurate 2026 pricing (Opus 4.6/4.7 at $5/$25 per 1M, Sonnet 4.x at $3/$15, Haiku 4.5 at $1/$5; priority/fast tier at 6×)
- **Top tool calls** grid (Read, Edit, Bash, Grep, WebFetch, Glob) with call counts
- **14-day sparkline** of daily spend with delta vs yesterday
- **Auto-refresh**: file watcher on `~/.claude/projects/` emits updates instantly when Claude Code writes new events; 15s polling fallback (5s in Live range)
- **Native liquid glass** via macOS `NSVisualEffectView` — no CSS backdrop-filter flicker
- **Dark mode** that syncs native window appearance (follows system or manual override)
- **Dynamic window height** via `ResizeObserver` + `setSize`
- **Draggable** from the top bar, **resizable** from any edge

## Build

```bash
pnpm install
pnpm tauri build        # .app + .dmg land in src-tauri/target/release/bundle/
```

For development with hot reload:

```bash
pnpm tauri dev
```

## Tech stack

- **Shell**: Tauri 2 (Rust + WKWebView)
- **Frontend**: React 18 + TypeScript + Vite (inline styles, no CSS framework)
- **Glass**: `window-vibrancy` crate with `NSVisualEffectMaterial::HudWindow` + `NSVisualEffectState::Active` (stays active when window loses focus)
- **File watcher**: `notify` + `notify-debouncer-full` (500ms debounce on `~/.claude/projects/`)
- **Drag region**: Tauri's `data-tauri-drag-region` attribute — WKWebView doesn't honor Electron's `-webkit-app-region` CSS

## Data source quirks

The JSONL events have a few traps worth knowing if you want to build anything similar:

- **Dedup by `message.id`, not event uuid** — Claude Code writes multiple JSONL lines per API response when sessions resume/fork. UUIDs are unique per line, but the same `message.id` shows up in 2–9 places. Roughly half of all assistant events in a mature `.claude` dir are duplicates.
- **`usage.speed == "fast"` marks Claude Code's priority tier** — the raw `message.model` never contains "-fast"; ccusage synthesizes the suffix. Priority is 6× standard pricing.
- **Opus 4.6/4.7 is NOT priced like legacy Opus 4** — it's $5/$25/$6.25/$0.5 per 1M (input/output/cache-write/cache-read), not the $15/$75 Oct-2025 numbers. Cross-check with `claude usage --json` (an alias for `npx ccusage`).
- Strip trailing `-YYYYMMDD` date suffix when normalizing model IDs.
- `isSidechain: true` marks subagent calls (~12% of events in typical usage). Current code includes them in totals, matching ccusage.
- Skip `message.model == "<synthetic>"` events entirely.

## Why native vibrancy, not CSS glass

Early versions used stacked `backdrop-filter` + `mix-blend-mode` per the design handoff. On macOS that had a reliable ~1s color shift when the window gained key focus (WKWebView re-samples backdrop and re-composites blend modes on key/non-key transitions). No amount of CSS tuning — opacity, `will-change`, `contain: paint`, GPU promotion, reduced filter complexity — fixed it. Moving the glass to `NSVisualEffectView` via `window-vibrancy` eliminated the flicker entirely because the glass is composited at the AppKit layer, not in WKWebView. The decoration layers (tint, highlights, sheen) still live in CSS on top.

## License

MIT

---

Built on a design handoff from Anthropic's Claude Code Token Counter prototype. The target stack (Tauri + React) and liquid-glass aesthetic follow the handoff spec; deviations (native vibrancy, pricing updates) are documented above.
