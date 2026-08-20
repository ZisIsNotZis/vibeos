<div align="center">

<img src="logo.svg" alt="VibeOS logo" width="138" />

# VibeOS

### A real desktop for software that does not exist yet. ✨

**A browser-hosted operating system where Codex prepares missing software on demand, then hands control back as if it had always been installed.**

[![AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-6f42c1?style=flat-square)](LICENSE) [![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

<p align="center"><img src="docs/screenshots/desktop.png" alt="VibeOS desktop" width="92%" /></p>

> The browser is not watching an agent write a demo. It is using an operating system. A slow first open is simply software taking time to load; the result becomes durable local world state.

## ✦ The short version

VibeOS is an experiment in **lazy, generative computing**. It looks and feels like a desktop: windows, a dock, a launcher, settings, a browser, applications, games, persistent state, and keyboard shortcuts. When the user asks for something that is not ready, the runtime invokes Codex, prepares the missing node, validates it, caches it under `world/`, and resumes the original action.

```text
user action → VibeOS core → cache hit → local artifact → continue
                         └→ cache miss → Codex exec → validate → world/ → continue
```

## 🏆 What changed most

The project has grown from a generative UI experiment into a small operating-system runtime. The most meaningful upgrades, in order, are:

1. **An explicit kernel-like core boundary.** The core owns mechanisms—world addressing, windows, focus, persistence, themes, shortcuts, transport, generation, validation, and diagnostics. Applications own meaning. There are no app-name branches in the runtime for the world to depend on.
2. **A recursive world tree.** An app can own pages, another app, a virtual machine, or an entire nested environment. Parents define their direct children; VibeOS does not need a fixed global taxonomy.
3. **Lazy generation with durable caching.** Installation can begin as an identity and launchable place. The current page is prepared only when entered. Generated HTML, JavaScript, CSS, SVG, manifests, and app memory live in the tracked `world/` tree and survive restart.
4. **Intent preservation.** Loading is treated as ordinary OS latency. The click, route, form submission, or next page the user asked for is preserved and resumed after generation instead of being replaced by a dead acknowledgement screen.
5. **A generic AI command and state bridge.** `Ctrl/Cmd+K` works anywhere. Apps can expose context, send arbitrary commands to Codex, request scoped changes, patch persistent state, navigate to child surfaces, and receive live refresh events.
6. **A serious generation harness.** Workers run as direct `codex exec` subprocesses in staged workspaces with structured output, scoped inputs, explicit model/reasoning/search policy, artifact validation, repair attempts, screenshots, logs, and transactional publication.
7. **A quality contract for generated software.** Current pages must be usable, controls must cause real state transitions, games must have real render/input loops, editors must edit and persist, and visual tools must render actual canvases rather than decorative mock controls.
8. **A convincing desktop shell.** Windows can focus, move, resize, minimize, restore, maximize, close, and continue to behave like windows. The dock, launcher, app deletion, focus highlighting, title bar, and global shortcuts are shared core functionality.
9. **System-wide preferences.** Themes, desert mode, background images, typography, display scale, dock position, auto-hidden chrome, notification duration, generation effort, model, reasoning, search, and trace visibility are persisted settings.
10. **Developer-grade observability.** The backend records structured Codex trajectories, including begin/end events, agent messages, tool calls, and reasoning summaries. `dev.log`, job records, screenshots, validation errors, and Playwright tests make failures diagnosable.
11. **A built-in Chinese IME.** Pinyin input, candidates, selection, backspace, and switching work inside the browser and generated app frames without depending on the host operating system’s IME.
12. **Reusable OS primitives.** Notifications, typed agent questions, context menus, screenshots, browser-native downloads, persistent app state, theme delivery, and command registration are available to future generated apps.

## 🧱 Architecture: a kernel, not an app catalog

```mermaid
flowchart TB
  U[User action] --> W[Browser desktop]
  W --> R[Core runtime]
  R --> I[Typed intents and bridge]
  R --> C{Cached node?}
  C -->|yes| L[Load local artifact]
  C -->|no| H[Generation harness]
  H --> S[Staged Codex subprocess]
  S --> O[Structured handoff]
  O --> V[Artifact validation and repair]
  V --> P[Publish into world/]
  P --> L
  L --> W
  R -. generic mechanisms .-> A[Generated applications]
  A -. owns meaning, behavior, state, children .-> T[Recursive world tree]
```

```text
Core VibeOS                         Generated world
────────────────────────────       ───────────────────────────────
windows · focus · geometry         app manifests · routes · pages
transport · intents · cache        HTML · CSS · JS · SVG · assets
themes · shortcuts · IME           game loops · editors · state
storage · screenshots              direct children · app memory
Codex execution · validation
```

The core is deliberately small and replaceable content is deliberately powerful. A user can create a different Settings app, Assistant, App Shop, browser, editor, or desktop-like environment. Those names do not grant authority. The runtime provides generic mechanisms; generated content decides what they mean.

## 🌳 The world is a tree

```text
world/
└── apps/
    ├── tetris/
    │   ├── node.json
    │   ├── icon.svg
    │   └── children/game/...
    └── virtual-machine/
        ├── node.json
        └── children/apps/<another-world>/...
```

Each node knows its direct children. There is no required depth and no fixed list of application types. A node may be a game, website, note editor, simulator, creative tool, or something nobody anticipated when the core was written.

## 🎬 From prompt to working software

1. Install or open an app, route, or child action.
2. The runtime checks the durable world tree.
3. A cache hit loads immediately and reuses the existing artifact.
4. A cache miss stages the relevant node, inherited memory, world context, screenshot, acceptance criteria, and settings.
5. Codex writes only the staged target, using the available bridge and permitted search policy.
6. VibeOS validates the handoff, node route, assets, structure, and generated artifact.
7. Failed output receives bounded repair attempts; invalid output is not published.
8. The artifact is committed as ordinary project files and the original user action continues.

The user sees a normal application opening. Developers can choose how much live trajectory to expose: completion only, messages, tool calls, or reasoning summaries.

## 📸 Product tour

<table>
<tr><td width="50%"><img src="docs/screenshots/launcher.png" alt="VibeOS app launcher" /><br /><b>🔎 Launcher</b><br /><sub>Every installed world node appears in one searchable desktop launcher.</sub></td><td width="50%"><img src="docs/screenshots/settings-appearance.png" alt="VibeOS Appearance settings" /><br /><b>🎨 Preferences</b><br /><sub>Appearance, typography, scale, background behavior, and system chrome are user settings.</sub></td></tr>
<tr><td><img src="docs/screenshots/browser.png" alt="VibeOS browser" /><br /><b>🌐 Browser</b><br /><sub>Addresses become locally authored, reusable destinations by default.</sub></td><td><img src="docs/screenshots/dota2.png" alt="VibeOS playable 3D game" /><br /><b>🎮 Serious generated software</b><br /><sub>A real three-lane 3D playable game slice, with camera, HUD, entities, abilities, and combat.</sub></td></tr>
</table>

## 🧪 The generated app gallery

These are the applications currently present in `world/apps`. **Agent time** is an approximate preparation time for the current artifact. **Human time** is approximate direct prompting and interaction needed to reach the current state. Older artifacts do not all have precise historical timestamps, so ranges are intentionally honest.

Complexity describes the current slice, not the full real-world product it resembles: 🟢 **Seed / shell**, 🔵 **Interactive**, 🟣 **Rich**, 🔴 **3D / game**.

| App | Snapshot | What it demonstrates | Complexity | Agent time | Human time |
|---|---|---|---|---:|---:|
| Assistant | ![Assistant](docs/screenshots/apps/assistant.png) | Natural-language repair requests against the current world | 🔵 Interactive | ~5–20 s | ~10 s |
| App Shop | ![App Shop](docs/screenshots/apps/app-shop.png) | Searchable app installation and durable launcher identity | 🔵 Interactive | ~5–15 s | ~10 s |
| Settings | ![Settings](docs/screenshots/apps/settings.png) | Model, reasoning, effort, search, themes, scale, dock, and notification preferences | 🔵 Interactive | ~5–15 s | ~10 s |
| Browser | ![Browser](docs/screenshots/apps/browser.png) | Locally authored destinations, search routes, and cached child pages | 🔵 Interactive | ~10–30 s | ~15 s |
| Firefox | ![Firefox](docs/screenshots/apps/firefox.png) | A replaceable browser-like app using the same core navigation | 🔵 Interactive | ~10–30 s | ~15 s |
| Sublime Text | ![Sublime Text](docs/screenshots/apps/sublime-text.png) | Persistent tabs, editor state, highlighting, save, run, and command palette | 🟣 Rich | ~30–90 s | ~2–5 min |
| Zed | ![Zed](docs/screenshots/apps/zed.png) | A second editor identity generated from a short request | 🔵 Interactive | ~10–30 s | ~20 s |
| Codex | ![Codex](docs/screenshots/apps/codex.png) | An app-shaped interface for the underlying coding agent | 🔵 Interactive | ~10–30 s | ~20 s |
| Claude Code | ![Claude Code](docs/screenshots/apps/claude-code.png) | An alternative coding-agent world node | 🟢 Seed / shell | ~10–30 s | ~20 s |
| Paint | ![Paint](docs/screenshots/apps/paint.png) | Persistent raster canvas and browser-native export path | 🟣 Rich | ~30–90 s | ~2–5 min |
| Paint 3D | ![Paint 3D](docs/screenshots/apps/paint3d.png) | A 3D-oriented creative-tool identity | 🔵 Interactive | ~10–30 s | ~30 s |
| CAD Editor | ![CAD Editor](docs/screenshots/apps/cad-editor.png) | Visual editing, file-oriented workflows, and external-file semantics | 🟣 Rich | ~30–90 s | ~5–10 min |
| 3D Model Editor | ![3D Model Editor](docs/screenshots/apps/3d-model-editor.png) | Scene-oriented 3D editing and persistent model data | 🔴 3D / game | ~45–120 s | ~5–10 min |
| Draw.io | ![Draw.io](docs/screenshots/apps/draw-io.png) | Diagram-editor identity and extensible visual-tool surface | 🟣 Rich | ~20–60 s | ~2–5 min |
| MIDI Editor | ![MIDI Editor](docs/screenshots/apps/midi-editor.png) | Timeline/grid editing with an audio-production vocabulary | 🟣 Rich | ~20–60 s | ~2–5 min |
| Music Studio | ![Music Studio](docs/screenshots/apps/music-studio.png) | Purpose-built creative studio with custom visual identity | 🟣 Rich | ~20–60 s | ~2–5 min |
| Poetry House | ![Poetry House](docs/screenshots/apps/poetry-house.png) | Chinese creative writing with bespoke artwork | 🔵 Interactive | ~20–60 s | ~1–3 min |
| Scientific Calculator | ![Scientific Calculator](docs/screenshots/apps/scientific-calculator.png) | Real keypad, expressions, functions, and answer memory | 🔵 Interactive | ~20–60 s | ~1–3 min |
| Minesweeper | ![Minesweeper](docs/screenshots/apps/minesweeper.png) | Grid state, reveal/flag interactions, and restart flow | 🔵 Interactive | ~20–60 s | ~1–3 min |
| FreeCell | ![FreeCell](docs/screenshots/apps/freecell.png) | Card-game world with deal and rules child surfaces | 🟣 Rich | ~30–90 s | ~2–5 min |
| Tetris | ![Tetris](docs/screenshots/apps/tetris.png) | Lazy game pages progressing into a real keyboard-playable board | 🔴 3D / game | ~30–120 s | ~5–15 min |
| DOTA2 | ![DOTA2](docs/screenshots/apps/dota2.png) | Three lanes, river, jungle, camera, HUD, abilities, combat, and respawn | 🔴 3D / game | ~2–6 min | ~10–20 min |
| Red Alert 3 | ![Red Alert 3](docs/screenshots/apps/red-alert-3.png) | Strategy-game lobby flow and generated child screens | 🔴 3D / game | ~45–120 s | ~5–10 min |
| Warcraft III | ![Warcraft III](docs/screenshots/apps/warcraft-iii.png) | Strategy-game identity and battlefield direction | 🔴 3D / game | ~20–60 s | ~2–5 min |
| CS 1.6 | ![CS 1.6](docs/screenshots/apps/cs1-6.png) | First-person-game shell and extensible game-world surface | 🔴 3D / game | ~20–60 s | ~2–5 min |
| Flappy Bird | ![Flappy Bird](docs/screenshots/apps/flappy-bird.png) | Compact real-time arcade loop | 🔴 3D / game | ~20–60 s | ~1–3 min |
| Temple Run | ![Temple Run](docs/screenshots/apps/temple-run.png) | Endless-runner direction, score, and progress state | 🔴 3D / game | ~20–60 s | ~1–3 min |
| 3D Pinball: Space Cadet | ![3D Pinball: Space Cadet](docs/screenshots/apps/3d-pinball-space-cadet.png) | Physics-flavored 3D arcade scene | 🔴 3D / game | ~30–90 s | ~2–5 min |
| Android Simulator | ![Android Simulator](docs/screenshots/apps/android-simulator.png) | Nested-device environment and child world | 🟣 Rich | ~30–90 s | ~3–8 min |
| iPhone Simulator | ![iPhone Simulator](docs/screenshots/apps/iphone-simulator.png) | Another device-world interpretation | 🟣 Rich | ~30–90 s | ~3–8 min |
| Excel | ![Excel](docs/screenshots/apps/excel.png) | Spreadsheet direction and future extensibility target | 🟢 Seed / shell | ~10–30 s | ~20 s |
| Word | ![Word](docs/screenshots/apps/word.png) | Document-editor identity ready for deeper lazy pages | 🟢 Seed / shell | ~10–30 s | ~20 s |
| PowerPoint | ![PowerPoint](docs/screenshots/apps/powerpoint.png) | Presentation-tool identity and future slide-world surface | 🟢 Seed / shell | ~10–30 s | ~20 s |
| Outlook | ![Outlook](docs/screenshots/apps/outlook.png) | Communication-tool identity for future mail/calendar flows | 🟢 Seed / shell | ~10–30 s | ~20 s |
| Plants vs Zombies | ![Plants vs Zombies](docs/screenshots/apps/plants-vs-zombies.png) | Game request staged for deeper lazy implementation | 🟢 Seed / shell | ~10–30 s | ~20 s |
| 押韵大师 ProMax | ![押韵大师 ProMax](docs/screenshots/apps/promax.png) | Bespoke Chinese creative app from a concise concept | 🟣 Rich | ~30–90 s | ~2–5 min |

The table shows the range of software VibeOS can hold, not a claim that every node is a finished commercial product. The same core supports shells, tools, editors, simulations, websites, and games.

## 🧭 What is it useful for?

- **Rapid product prototypes:** use a concept before committing to a full implementation.
- **Interactive demos:** demonstrate a working flow rather than a static mockup.
- **Vibe coding without living in a terminal:** describe the result, inspect it in the OS, and use `Ctrl/Cmd+K` for the next change.
- **Bug repair by conversation:** describe a broken behavior to Assistant with runtime context, screenshots, and logs attached.
- **Personal software:** create local notes, creative tools, editors, calculators, games, and dashboards that keep state.
- **Local-first imagined Internet:** explore production-like destinations without silently connecting to the real Internet.
- **Complex-world exploration:** progressively build games, simulations, visual editors, device environments, and nested worlds page by page.

Traditional software asks developers to implement the whole product before users can discover what it should become. VibeOS flips that order: the user explores a coherent current page, and the world grows exactly where a new capability is needed. The result is still real code, inspectable, testable, and commit-able—it simply arrives lazily.

## 🛠️ Extensibility primitives

Generated apps can use persistent state and storage, scoped AI commands, state patches, child navigation, recursive world growth, global command registration, notifications, typed questions, context menus, screenshots, browser-native downloads, semantic themes and typography, global shortcuts, window lifecycle, and the built-in Chinese IME.

## 🔭 Where it can go

The long-term direction is not a larger hard-coded app catalog. It is a more capable substrate for generated worlds:

- higher-quality 2D/3D assets, animation, physics, and scene composition;
- stronger visual regression and interaction testing before publication;
- reusable rendering and editor primitives agents can compose instead of reinventing;
- richer typed questions, approvals, and real-world capability boundaries;
- multi-agent implementation, review, and repair pipelines;
- shareable app/world packages and collaborative world trees;
- stronger durable memory for applications and users;
- audio, video, recording, device, and hardware bridges when explicitly authorized;
- a general software environment where the boundary between app, website, game, and world is chosen by each node.

## 🚀 Quick start

### Requirements

- Node.js 20+
- npm
- A working `codex` CLI on `PATH`
- A configured Codex provider/authentication environment

```bash
npm install
npm run build
npm run dev
```

Open the Vite URL printed in the terminal. The backend listens on `ws://localhost:8787` and exposes `/health`. Generated artifacts are served from `world/` and reused on later runs.

## 🧪 Development

```bash
npm test
npm run build
npm run e2e --workspace @vibeos/web
git diff --check
```

Useful evidence lives in `dev.log`, `world/.jobs/`, `world/`, `docs/vibeos-design.md`, and `docs/screenshots/`.

Keep the core generic. App-specific meaning belongs in `world/`, never in an `if appId === ...` branch in the runtime. Pull requests should include a focused problem statement, design notes, tests, screenshots for visual changes, and generated world artifacts when relevant.

The maintainer is busy and may not reply frequently. Make reasonable decisions, document assumptions, run the suite, and leave a runnable result rather than waiting for conversational approval. 📨

## 📁 Project map

| Path | Responsibility |
|---|---|
| `apps/server` | Runtime, persistence, generation harness, Codex subprocess, validation, logs |
| `apps/web` | Desktop shell, windows, launcher, dock, themes, shortcuts, IME, Playwright E2E |
| `packages/shared` | Shared runtime, intent, world, surface, and settings contracts |
| `world` | Durable generated application tree and cache |
| `docs` | Design documents, generation plans, and product screenshots |
| `AGENTS.md` | Core boundary and implementation rules |

## 📜 License

VibeOS is free software licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). Third-party notices are collected in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
