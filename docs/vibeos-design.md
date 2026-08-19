# VibeOS Design: An Imagined Operating System

Status: implementation in progress — VibeOS uses a small OS-owned generated-world envelope and leaves application meaning, descendants, assets, behavior, and cache layout to each generated node.

## 0. Architectural rule: core mechanism, generated meaning

VibeOS has two strictly separated layers:

```text
Core VibeOS
  windows · launcher · transport · loading · cache · generation · generic renderer

Generated world tree
  app manifests · app surfaces · routes · controls · content · assets
```

The core defines mechanisms; generated apps define meaning. The core must not contain app-specific branches such as `if appId === 'browser'`, `if appId === 'app-store'`, or special renderers for Calculator, Browser, Files, or Settings. Those are ordinary apps whose manifests and surfaces may be seeded in the cache.

The launcher reads app records from the registry. It does not own a fixed app list. A window hosts a generic surface renderer. It does not switch on app IDs to select hardcoded React views. A missing app, home surface, route, or control is a cache miss handled by the generation coordinator.

The generated cache is the product world. It is data and declarative UI, not core source code:

```text
world/apps/<app-id>/
  node.json                 # OS envelope; required
  icon.svg                  # identity asset for an app node
  children/<child-id>/      # owned descendants; optional
  app/                       # node-chosen implementation; optional
  data/                      # app-scoped mutable state; optional
```

Seeded apps are fixtures in this cache, not special runtime implementations. This separation is the primary extensibility seam: adding an app should add cache data or generate a cache entry, without modifying core code.

### Settings and generation policy

Settings is a normal OS app backed by generic runtime state. It defaults to `effort: quality` and `search: none`; both values persist and are injected into every generation and Assistant task.

Effort contracts: `ultrafast` means minimal reasoning and no tests while still producing a coherent usable page; `fast` means brief reasoning plus one focused smoke check; `balanced` means normal reasoning plus focused primary-interaction tests; `quality` means production-quality implementation, self-review, interaction checks, and obvious fixes (the default); `research` means maximum permitted research, TDD, broad self-tests, and edge-case review before delivery.

Search contracts: `none` forbids Internet access and uses supplied/local context only (the default); `online_info` permits researching current facts while keeping the page locally authored; `online_content` permits online content or repositories as building material, including embedded HTML or GitHub projects serving a web app/backend. The worker must not exceed either selected tier. These are execution contracts, not an application-type enum; generated nodes still own their page behavior, descendants, and internal cache layout.

### Recursive world tree

The world is not a fixed `apps → pages` hierarchy. It is a recursive tree. Each node knows only its direct children; the OS does not need to know the tree’s total depth or global meanings.

```text
world/
  apps/
    tetris/
      node.json
      icon.svg
      children/home/
      children/game/
    virtual-machine/
      node.json
      children/apps/
        node.json
        children/...
```

An app may contain pages, a virtual machine may contain apps, and those apps may contain further trees. All are generic `WorldNode` records. Parents define the meaning of their direct children; core code provides traversal, selection, persistence, windows, and rendering.

```ts
type WorldNode = {
  id: string;
  title: string;
  kind: string;
  parentId?: string;
  children: NodeRef[];
  surface?: SurfaceModel;
  entry?: string;
  storage?: string;
  payload?: unknown;
};
```

The envelope is intentionally general. `kind`, `entry`, `storage`, and `payload` are opaque to the OS except for basic safety and loadability checks. There is no global list of application types. A node may represent a notes editor, game, website, virtual machine, or something not anticipated by VibeOS.

The minimum generated-node contract is stable identity, parent-owned location, a loadable entry or surface, direct children when useful, and no outside-world references unless the user explicitly grants a capability. The node decides its internal file layout and cache keys.

Entering a node loads it and its immediate children. Descendants remain lazy until selected. The tracked `world/` tree is the durable cache: generated artifacts are committed with core code, survive `npm run dev`, and remain reviewable as ordinary project changes. No separate database is required initially.

### Assistant app

Assistant is a normal world-tree app with a core-provided context capability. It receives the selected node, parent chain, selected window, recent operations, runtime errors, and relevant log entries.

```text
world/apps/assistant/
  node.json
  icon.svg
  children/home/
  children/conversations/
```

An Assistant request contains a natural-language complaint and runtime context. Codex diagnoses the issue, edits the smallest affected subtree or core seam, validates it, reloads the affected node, and reports the result in Assistant. The user always has a place to explain what is wrong.

## 1. Product premise

VibeOS is a browser-hosted operating system whose world is generated on demand by Codex.

The user experiences a coherent OS: windows, apps, navigation, files, search, installation, and interaction. The user does not experience a developer tool, code-generation dashboard, or collection of disconnected mockups.

The world is lazy. Installing an app creates its identity and a launchable place in the OS. Opening it generates the first usable surface. Interacting with a surface generates the next required capability or page. Existing state remains stable while the missing part is prepared.

The browser does not connect to the real Internet by default. A browser URL is resolved to a local production-style page for that address, with links and controls that can request further local loading.

## 2. User-visible contract

Every user action is treated as a normal OS action, regardless of whether its implementation already exists.

Examples:

- Clicking Calculator opens a real calculator window immediately.
- Entering `example.com` in Browser displays a locally rendered page for that address.
- Searching App Shop for “music studio” returns an app listing even when no physical package exists.
- Installing “music studio” adds an app record and launcher entry immediately.
- Opening the installed app first shows its stable shell, then fills in the generated home page.
- Clicking a generated button produces the next page or capability in the same app and preserves the original action while generation runs.

Generation latency is represented as ordinary OS latency: a page/app surface may show a neutral loading state, skeleton, or disabled control. The UI does not expose prompts, token streams, source files, agent phases, or implementation terminology.

The only developer-facing generation trace is written to the backend terminal running `npm run dev`.

## 3. Runtime model

The backend owns a persistent `WorldRuntime`, the deep module at the system seam. The frontend asks it to perform user intents and renders the resulting OS state. The runtime is app-agnostic: it coordinates records, surfaces, controls, windows, and generation jobs without knowing what an app means.

The runtime contains five related stores:

1. **OS state** — windows, focus, dock, notifications, installed apps, and current session.
2. **World state** — local pages, app surfaces, generated routes, controls, and content snapshots.
3. **Intent journal** — user actions with IDs, target context, input, and resumable status.
4. **Capability registry** — what an app/page can currently do and where its implementation lives.
5. **Generation jobs** — queued, running, ready, failed, or cancelled work associated with an intent.

The browser communicates through a small typed interface:

```ts
dispatch(intent: UserIntent): Promise<OperationReceipt>
subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe
snapshot(): WorldSnapshot
```

The frontend never calls Codex, filesystem paths, or generated modules directly.

## 4. Intent and resume model

User actions are semantic intents, not UI implementation instructions.

```ts
type UserIntent =
  | { type: 'open_app'; appId: string }
  | { type: 'install_app'; query: string }
  | { type: 'open_page'; appId: string; route: string; input?: unknown }
  | { type: 'navigate_browser'; url: string }
  | { type: 'activate_control'; appId: string; pageId: string; controlId: string; input?: unknown }
  | { type: 'create_file'; path: string; content: string }
  | { type: 'close_window'; windowId: string };
```

Each intent receives an operation ID and captures the exact app/page/control context required to replay it. A generation job may fulfill the intent, but the job is not the user’s conceptual operation.

The runtime follows this sequence:

1. Accept and validate the intent.
2. Apply any immediate OS effect, such as opening a window or creating an app placeholder.
3. Resolve the target capability from the registry.
4. If ready, execute it locally.
5. If absent, create a generation job and preserve the intent.
6. Render a neutral pending state in the affected surface.
7. Ask Codex to implement only the missing slice.
8. Validate and register the result.
9. Replay the preserved intent exactly once.
10. Emit normal OS/world events so the browser continues naturally.

Generation is idempotent by capability key. Repeated clicks while a job is running join the same job rather than starting duplicate work.

## 5. App Shop and lazy installation

App Shop is an ordinary generated app backed by the world catalog. The core exposes generic app-registry operations; the App Shop surface chooses to present search and install controls. The core does not render or special-case an App Shop.

An app record is metadata, not an implementation bundle:

```ts
type AppRecord = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  installed: boolean;
  entrySurface: SurfaceRef;
  status: 'placeholder' | 'available' | 'failed';
};
```

Search is local and semantic. It may return catalog entries synthesized from the query; it does not require a package to exist in a registry.

Install performs only these immediate actions:

- create a stable app ID and metadata record;
- add the app to the launcher and installed-app list;
- create an app workspace namespace;
- mark its entry surface as `placeholder`.

Install does not ask Codex to build the whole app. First launch requests generation of the entry surface only.

## 6. Surfaces, pages, and structured generation

Every generated experience is a tree of addressable surfaces. A surface is the unit of lazy generation.

```ts
type SurfaceRef = { appId: string; surfaceId: string; route: string };

type Surface = {
  id: string;
  appId: string;
  route: string;
  title: string;
  status: 'placeholder' | 'generating' | 'ready' | 'failed';
  modelPath: string;
  controls: ControlModel[];
  content: SurfaceContent;
};

type ControlModel = {
  id: string;
  kind: 'link' | 'button' | 'form' | 'menu' | 'input';
  label: string;
  action: UserIntentTemplate;
};
```

The frontend renders the optional generic `SurfaceContent` through a controlled renderer. Generated code does not get to manipulate the desktop, open arbitrary sockets, or bypass the runtime. When a node uses the generic renderer, controls map to semantic intents. When a node needs richer behavior, it may provide its own entrypoint behind the same node seam and use the OS bridge. The core does not treat prose as implementation: the primary user action must be usable before the node is marked ready.

There is no mandatory internal app layout. A generated node owns its workspace and may choose a layout such as:

```text
world/apps/<app-id>/
  node.json
  app/entry.html
  app/entry.js
  children/<app-owned-key>/node.json
  data/state.json
```

The agent receives the exact target node path, parent context, existing sibling/child context, available OS primitives, a few quality examples, and acceptance checks. It may modify the target node’s owned subtree. It must not invent OS fields or modify core code for an ordinary generated-world task.

### Persistent local state and external capabilities

Every generated node may use an app-scoped persistent storage namespace. The default is local and survives reloads and development restarts. Generated code chooses its data shape and migration strategy; VibeOS owns namespacing, persistence, and isolation. User data is mutable state and is kept conceptually separate from generated source/cache.

Internet, host filesystem, clipboard, and device access are off by default. A node may request an explicit capability when the user asks for it. VibeOS mediates the request rather than silently granting ambient access.

This location rule is the main protection against global hallucinated rewrites: one user action maps to one capability key and one structured generation location.

## 7. Imagined Browser

Browser is an ordinary generated app. Its generated surface may provide an address input and navigation controls. The core provides a local-world route resolver but does not own a Browser app or Browser renderer. It is a local world navigator, not a network client.

The address bar is a real controlled input. Submitting a URL produces a `navigate_browser` intent. The runtime canonicalizes the URL into a world key, for example:

```text
world://browser/https/example.com/
```

The browser first checks the local surface registry. If absent, it creates a page placeholder and asks Codex to generate the page model and content. The generated page may contain local links, forms, and buttons. Those controls map to new world routes or app intents; they never perform real network requests.

Navigation history, back, forward, reload, address editing, and route persistence are browser-owned OS state. A generated page owns only its content and declared controls.

Search and destination navigation are distinct. A search form first opens a stable search-results surface owned by the search page, preserving the query, shell, tabs, and result list. Only an explicit result activation may navigate to a result site's destination surface; a matching cached site must never replace the results page merely because its title matches the query.

## 8. Window manager

Window management is a runtime concern, not a visual placeholder.

Required operations:

```ts
focusWindow(windowId: string): void
closeWindow(windowId: string): void
minimizeWindow(windowId: string): void
maximizeWindow(windowId: string): void
moveWindow(windowId: string, position: Position): void
resizeWindow(windowId: string, size: Size): void
```

The close button must dispatch `close_window` and remove the window from the runtime snapshot. App contents must not own window lifecycle.

## 9. Codex adapter

The backend launches the local `codex exec` process adapter directly. The browser communicates only with the VibeOS WebSocket runtime; it does not register tools with Codex or use an intermediary protocol.

The generation adapter has one narrow interface:

```ts
generate(request: GenerationRequest): Promise<GenerationResult>
```

`GenerationRequest` includes the capability key, target path, current surface model, user intent, acceptance checks, and workspace restrictions. Codex is instructed to finish the smallest complete slice quickly, run checks, write the structured result, and return a machine-readable ready marker.

Backend stdout/stderr shows tagged trajectory logs:

```text
[generation] queued job=...
[codex] starting job=...
[codex] <stdout>
[codex:err] <stderr>
[generation] validated job=...
[generation] resumed operation=...
```

These logs are for the developer operating the local runtime. They are not sent to the browser.

## 10. Failure and recovery

- Codex unavailable: retain the placeholder and show a normal retryable loading/error state.
- Invalid generated envelope: reject the result, preserve the prior surface, and return a compact repair request to the same generation job. Validation checks only OS invariants; unfamiliar app semantics are valid.
- Agent timeout: mark the generation job failed without losing the original intent.
- Browser refresh: restore OS state, installed apps, surfaces, and unfinished jobs from the local store; reconnect running jobs where possible.
- Duplicate activation: deduplicate by capability key and replay the intent once generation is ready.
- Unsafe generated action: reject controls that are not in the allowed declarative control vocabulary.

## 11. Implementation order

### Phase 1 — Runtime seams and persistence

Implement typed OS/world models, recursive node traversal, intent journal, surface registry, capability keys, operation replay, and direct tracked `world/` file loading. Remove fixed app branches from core and represent seeded apps as world-tree fixtures.

Completion criterion: tests can dispatch an absent surface, observe a pending operation, install a generated result, and observe exactly one resumed action.

### Phase 2 — Correct OS primitives

Implement real window close/focus/minimize/maximize behavior, generic controlled inputs and intent dispatch, navigation history, and stable app lifecycle. Browser behavior is supplied by its generated cache surface.

Completion criterion: calculator opens and closes; browser accepts a URL and changes route without network access; refresh restores the session.

### Phase 3 — App Shop and placeholders

Implement local semantic app search, install metadata, launcher registration, placeholder entry nodes, nested world-tree creation, and the Assistant repair surface.

Completion criterion: arbitrary app search → install → launcher entry works without generation.

### Phase 4 — Structured generation

Implement the Codex generation adapter, target-surface prompt, workspace restrictions, model validation, generation logs, and job deduplication.

Completion criterion: opening an installed placeholder causes only its entry surface to be generated and then displayed.

### Phase 5 — Imagined browser and recursive lazy surfaces

Implement browser world keys, generated local pages, declarative controls, route generation, and intent replay for nested interactions.

Completion criterion: type a URL → see generated local page → click a generated link → see the next generated page without network access.

### Phase 6 — End-to-end polish

Add skeleton states, retry/cancel, notifications, generated-content caching, browser history, app persistence, and developer diagnostics.

Completion criterion: a fresh user can install an imaginary app and explore two generated surfaces without seeing implementation details or losing an action.

## 12. Test strategy

Tests cross the runtime interfaces, not private implementation details.

- Window seam: open, focus, close, minimize, maximize, and z-order.
- Input seam: address-bar editing and submit dispatch the expected intent.
- App Shop seam: arbitrary query, install, launcher registration, and persistence.
- Generation seam: request construction, target path, job deduplication, validation, and ready handoff.
- Replay seam: original intent is preserved and executed once after generation.
- Browser seam: URL canonicalization, local-only navigation, generated links, and history.
- Recovery seam: refresh and agent failure retain stable OS/world state.
- End-to-end browser test: install imaginary app → open placeholder → generate entry surface → activate generated control → generate next surface.

## 13. Explicit non-goals

- Real Internet access for imagined browser pages.
- Treating generated source code as the frontend’s public contract.
- Building an entire app during installation.
- Exposing Codex trajectory or prompts as normal OS UI.
- Allowing generated content to directly control windows or server resources.
- Remote multi-user collaboration, production authentication, and arbitrary native process execution in the browser.
