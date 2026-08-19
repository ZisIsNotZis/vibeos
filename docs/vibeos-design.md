# VibeOS Design: An Imagined Operating System

Status: proposed — review before implementation

## 0. Architectural rule: core mechanism, generated meaning

VibeOS has two strictly separated layers:

```text
Core VibeOS
  windows · launcher · transport · loading · cache · generation · generic renderer

Generated world cache
  app manifests · app surfaces · routes · controls · content · assets
```

The core defines mechanisms; generated apps define meaning. The core must not contain app-specific branches such as `if appId === 'browser'`, `if appId === 'app-store'`, or special renderers for Calculator, Browser, Files, or Settings. Those are ordinary apps whose manifests and surfaces may be seeded in the cache.

The launcher reads app records from the registry. It does not own a fixed app list. A window hosts a generic surface renderer. It does not switch on app IDs to select hardcoded React views. A missing app, home surface, route, or control is a cache miss handled by the generation coordinator.

The generated cache is the product world. It is data and declarative UI, not core source code:

```text
cache/apps/<app-id>/
  manifest.json
  surfaces/<surface-id>/surface.json
  surfaces/<surface-id>/content.json
  assets/
```

Seeded apps are fixtures in this cache, not special runtime implementations. This separation is the primary extensibility seam: adding an app should add cache data or generate a cache entry, without modifying core code.

## 1. Product premise

VibeOS is a browser-hosted operating system whose world is generated on demand by Codex.

The user experiences a coherent OS: windows, apps, navigation, files, search, installation, and interaction. The user does not experience a developer tool, code-generation dashboard, or collection of disconnected mockups.

The world is lazy. Installing an app creates its identity and a launchable place in the OS. Opening it generates the first usable surface. Interacting with a surface generates the next required capability or page. Existing state remains stable while the missing part is prepared.

The browser never connects to the real Internet for imagined websites. A browser URL is an input to the VibeOS world model. Codex generates a plausible local page for that URL, with links and controls that can request further local generation.

## 2. User-visible contract

Every user action is treated as a normal OS action, regardless of whether its implementation already exists.

Examples:

- Clicking Calculator opens a real calculator window immediately.
- Entering `example.com` in Browser displays a locally imagined page for that address.
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

The frontend never calls Codex, MCP, filesystem paths, or generated modules directly.

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

The frontend renders `SurfaceContent` through a controlled renderer. Generated code does not get to manipulate the desktop, open arbitrary sockets, or bypass the runtime. Generated behavior is represented through declarative controls and semantic intents.

Each app has a predictable workspace layout:

```text
world/apps/<app-id>/
  manifest.json
  app-model.json
  surfaces/<surface-id>/surface.json
  surfaces/<surface-id>/content.json
  assets/
  generation-log.jsonl
```

The agent receives the exact target surface path and a compact contract for its parent app, neighboring surfaces, available control types, and acceptance checks. It must modify only that surface slice unless the runtime explicitly requests a manifest or shared-model change.

This location rule is the main protection against global hallucinated rewrites: one user action maps to one capability key and one structured generation location.

## 7. Imagined Browser

Browser is an ordinary generated app. Its generated surface may provide an address input and navigation controls. The core provides a local-world route resolver but does not own a Browser app or Browser renderer. It is a local world navigator, not a network client.

The address bar is a real controlled input. Submitting a URL produces a `navigate_browser` intent. The runtime canonicalizes the URL into a world key, for example:

```text
world://browser/https/example.com/
```

The browser first checks the local surface registry. If absent, it creates a page placeholder and asks Codex to generate the page model and content. The generated page may contain local links, forms, and buttons. Those controls map to new world routes or app intents; they never perform real network requests.

Navigation history, back, forward, reload, address editing, and route persistence are browser-owned OS state. A generated page owns only its content and declared controls.

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

## 9. Codex adapter and MCP relationship

For the browser workflow, the backend is the MCP host/client-side integration point and launches Codex directly through the local `codex exec` process adapter. The browser does not register VibeOS as a Codex MCP server.

The separate VibeOS MCP server is an optional external automation interface. It is not used in the normal browser → backend → Codex path, because registering it with Codex would create a circular architecture.

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
- Invalid generated model: reject the result, preserve the prior surface, and log the validation failure.
- Agent timeout: mark the generation job failed without losing the original intent.
- Browser refresh: restore OS state, installed apps, surfaces, and unfinished jobs from the local store; reconnect running jobs where possible.
- Duplicate activation: deduplicate by capability key and replay the intent once generation is ready.
- Unsafe generated action: reject controls that are not in the allowed declarative control vocabulary.

## 11. Implementation order

### Phase 1 — Runtime seams and persistence

Implement typed OS/world models, intent journal, surface registry, capability keys, operation replay, and a deterministic in-memory store with a file-backed adapter. Remove fixed app branches from core and represent seeded apps as cache fixtures.

Completion criterion: tests can dispatch an absent surface, observe a pending operation, install a generated result, and observe exactly one resumed action.

### Phase 2 — Correct OS primitives

Implement real window close/focus/minimize/maximize behavior, generic controlled inputs and intent dispatch, navigation history, and stable app lifecycle. Browser behavior is supplied by its generated cache surface.

Completion criterion: calculator opens and closes; browser accepts a URL and changes route without network access; refresh restores the session.

### Phase 3 — App Shop and placeholders

Implement local semantic app search, install metadata, launcher registration, placeholder entry surfaces, and app workspace creation.

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
