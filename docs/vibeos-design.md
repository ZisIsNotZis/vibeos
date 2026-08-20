# VibeOS Design: A Generative Operating System

Status: implementation in progress — this document describes the target architecture. Some containment, operation-bridge, validation, and generation-profile work below is not implemented yet.

## 0. Architectural rule: core mechanism, generated meaning

VibeOS has two strictly separated layers:

```text
Core VibeOS
  windows · launcher · transport · loading · cache · generation · generic renderer

Generated world tree
  app manifests · app surfaces · routes · controls · content · assets
```

The core defines mechanisms; generated apps define meaning. The core must not contain app-identity branches such as `if appId === 'browser'`, `if appId === 'app-store'`, or special renderers for Calculator, Browser, Files, Settings, App Shop, or Assistant. Those may be seeded apps, but they use the same operation bridge as any user-created replacement.

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

### Open OS operations, contained execution

VibeOS does not use a traditional privileged-app model. A user may build another Settings, Assistant, App Shop, desktop shell, or application manager. App identity never grants authority and seeded apps are not trusted merely because they shipped with VibeOS.

The core instead exposes typed, app-agnostic OS operations:

```text
settings.get / settings.set
apps.list / apps.install / apps.remove
world.inspect / world.generate / world.repair
windows.open / windows.close / windows.update
storage.read / storage.write
```

Every app may invoke these operations through the same bridge. Validation protects structural invariants, path ownership, transactionality, and host containment; it does not decide that one Settings app is legitimate and another is not. Operations that cross out of VibeOS into the real Internet, host filesystem, clipboard, camera, microphone, or devices remain explicit external-world interactions.

This yields two independent rules:

- **Application power is open.** Apps may reshape the VibeOS world through typed operations.
- **Execution authority is contained.** App code and workers never receive ambient authority over the host environment.

### Settings and generation policy

Settings is a normal replaceable app backed by generic `settings.*` operations. It defaults to `effort: quality` and `search: none`; both values persist and are injected into every generation and repair task.

Effort is an execution contract enforced by worker model choice, native reasoning effort, scope, validation, and repair budget—not prompt wording alone:

| VibeOS effort | Model | Native effort | Required delivery contract |
| --- | --- | --- | --- |
| `ultrafast` | `gh/gpt-5.6-terra` | `low` | Smallest coherent usable vertical slice; no worker-authored tests; deterministic platform checks still run |
| `fast` | `gh/gpt-5.6-terra` | `low` | Complete primary interaction loop plus one focused smoke scenario |
| `balanced` | `gh/gpt-5.6-terra` | `medium` | Complete current workflow, meaningful local state, and focused interaction tests |
| `quality` | `gh/gpt-5.6-sol` | `high` | Production-style vertical slice, self-review, browser interaction checks, visual inspection, and repair of discovered defects; default |
| `research` | `gh/gpt-5.6-sol` | `max` | TDD where useful, permitted research, broad interaction/state/edge-case checks, visual review, and multiple repair opportunities |
| `ultra` | `gh/gpt-5.6-sol` | `ultra` | Largest sensible coherent slice, automatic delegation where available, adversarial review, comprehensive validation, and repeated repair within budget |

The model slider stores the base family without a provider prefix. The independent `useGhPrefix` setting controls whether the runner sends `gpt-5.6-*` or `gh/gpt-5.6-*` to Codex. It defaults off for fresh settings; local OmniRoute users can enable it. Model routing is explicit and testable, and the runner sends the exact configured string without silently changing it. `ultra` is an engineering-assurance tier, while `research` emphasizes evidence and investigation. Both remain bounded by the selected search policy.

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

The minimum generated-node contract is stable identity, parent-owned location, a loadable entry or surface, direct children when useful, and no undeclared outside-world references. The node decides its internal file layout and cache keys.

Entering a node loads it and its immediate children. Descendants remain lazy until selected. The tracked `world/` tree is the durable cache: generated artifacts are committed with core code, survive `npm run dev`, and remain reviewable as ordinary project changes. No separate database is required initially.

### Assistant and world repair

Assistant is a normal replaceable world-tree app using `world.inspect`, `world.generate`, and `world.repair`. Any other app may provide the same workflow. A repair request receives the selected node, parent chain, selected window, recent operations, runtime errors, relevant log entries, screenshot, generated-frame console errors, and the prompt/profile revision that produced the artifact.

```text
world/apps/assistant/
  node.json
  icon.svg
  children/home/
  children/conversations/
```

An Assistant request contains a natural-language complaint and runtime context. A world-only repair uses the ordinary isolated generation pipeline. A repository repair uses a disposable Git worktree or repository copy, may edit any VibeOS-owned file inside it, validates the complete diff and test results, and publishes transactionally. Neither profile writes directly to the live checkout or outside its isolated workspace.

## 1. Product premise

VibeOS is a browser-hosted operating system whose world is generated on demand by Codex.

The user experiences a coherent OS: windows, apps, navigation, files, search, installation, and interaction. The user does not experience a developer tool, code-generation dashboard, or collection of disconnected mockups.

The world is lazy. Installing an app creates its identity and a launchable place in the OS. Opening it generates the first experientially complete capability. Interacting with it generates a child capability only when the interaction crosses into a genuinely new coherent destination. Existing state remains stable while a missing capability is prepared.

The browser does not connect to the real Internet by default. A browser URL is resolved to a local production-style page for that address, with links and controls that can request further local loading.

## 2. User-visible contract

Every user action is treated as a normal OS action, regardless of whether its implementation already exists.

Examples:

- Clicking Calculator opens a real calculator window immediately.
- Entering `example.com` in Browser displays a locally rendered page for that address.
- Searching App Shop for “music studio” returns an app listing even when no physical package exists.
- Installing “music studio” adds an app record and launcher entry immediately.
- Opening the installed app first shows its stable shell, then fills in the generated home page.
- Clicking a local control updates the current experience immediately; entering a genuinely new destination generates or loads its child capability and preserves the original action while generation runs.

Generation latency is represented as ordinary OS latency: a page/app surface may show a neutral loading state, skeleton, or disabled control. The UI does not expose prompts, token streams, source files, agent phases, or implementation terminology.

Developer-facing generation traces are written to structured job records and the backend terminal running `npm run dev`. They are not exposed as implementation terminology in normal app UI.

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
7. Ask Codex to implement the missing experientially complete capability.
8. Validate and register the result.
9. Replay the preserved intent exactly once.
10. Emit normal OS/world events so the browser continues naturally.

Generation is idempotent by capability key. Repeated clicks while a job is running join the same job rather than starting duplicate work.

## 5. App registry and lazy installation

An App Shop is an ordinary replaceable app backed by `apps.*` operations and the world catalog. Its surface chooses how to present search, installation, updates, or removal. The core does not render or special-case an App Shop, and a user-created replacement receives the same operation interface.

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

Install does not ask Codex to build the whole app. First launch requests the smallest experientially complete entry capability.

## 6. Capabilities, surfaces, and structured generation

Every generated experience is a tree of addressable capabilities. A surface is an addressable presentation location; it is not necessarily the generation boundary. A capability is the unit of lazy generation and may own one surface, many internal screens, a realtime loop, substantial assets, simulation logic, and persistent state.

The boundary rule is: generate the smallest experientially complete vertical slice. Local controls, same-experience state transitions, forms, tabs, dialogs, editor operations, game loops, and prerequisites for the advertised primary goal are implemented together. Only a genuinely separate coherent destination or independently useful workflow becomes a lazy child.

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

The frontend renders optional generic `SurfaceContent` through a controlled renderer. Rich entries run in opaque-origin sandboxed frames and use a typed, versioned OS bridge. They cannot manipulate the desktop DOM, open the runtime WebSocket, share ambient storage, or bypass operation validation. The core does not treat prose as implementation: the capability's primary user goal and all visible local controls must be usable before it is marked ready.

There is no mandatory internal app layout. A generated node owns its workspace and may choose a layout such as:

```text
world/apps/<app-id>/
  node.json
  app/entry.html
  app/entry.js
  children/<app-owned-key>/node.json
  data/state.json
```

The worker receives a staged, self-contained work order: exact intent and input, requested coherent outcome, read-only current node and parent/child context, versioned framework kit, typed OS bridge, theme contract, schemas, relevant examples, and executable acceptance checks. It may write only the staged output candidate. It does not inspect or modify the live repository for an ordinary generated-world task.

A substantial application is allowed to be substantial. For example, a playable strategy-game skirmish capability may need setup, battlefield rendering, input, simulation, units, opponent behavior, audio, persistence, and victory/defeat in the same generated slice. Campaigns, additional maps, multiplayer, or an editor may remain lazy children. Effort changes ambition, fidelity, asset sophistication, and verification; it never excuses dead visible controls.

### Persistent local state and external capabilities

Every generated node may use a node-scoped persistent storage namespace through the OS bridge. The default is local and survives reloads and development restarts. Generated code chooses its data shape and migration strategy; VibeOS owns namespacing, persistence, and isolation. User data is mutable state and remains separate from generated source/cache and Git-tracked artifacts.

Internet, host filesystem, clipboard, and device access are outside-world operations rather than app privileges. They are off by default and mediated explicitly when the user asks for them. No generated frame or worker receives ambient host access.

This staged location rule is the main protection against global hallucinated rewrites: one user action maps to one capability key, one isolated job, one validated publication target, and a rollbackable transaction.

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

## 9. Generation harness and Codex adapter

The backend launches the local `codex exec` process adapter directly. The browser communicates only with the VibeOS WebSocket runtime; it does not register tools with Codex or use an intermediary protocol.

The generation coordinator is a deep module with one narrow interface:

```ts
prepare(request: CapabilityRequest): Promise<PublishedCapability>
```

The coordinator owns cache lookup, deduplication, staging, model/profile selection, the Codex subprocess, verification, repair attempts, transactional publication, rollback, and exact-once resume. `CapabilityRequest` includes the capability key, original intent/input, parent context, requested coherent outcome, execution settings, and executable acceptance contract.

Ordinary jobs run in isolated staged directories containing read-only input/framework material and a writable output directory. Codex runs with `workspace-write` and approval policy `never`, not `--dangerously-bypass-approvals-and-sandbox`. The worker environment excludes host secrets and applies external process, time, memory, file, output, concurrency, and network limits. Search `none` disables network outside the prompt; higher search modes enable only their configured behavior.

Repository repair jobs run in a disposable Git worktree or repository copy and may change any VibeOS-owned file there, but never the live checkout or host environment. Their complete diff and tests are validated before transactional publication.

The Codex adapter selects the configured base model, applies `useGhPrefix`, and passes that exact model identifier together with native reasoning effort. Structured output uses `codex exec --output-schema`; `--json` provides machine-readable trajectory events. A textual ready sentinel is not the handoff contract.

Backend stdout/stderr shows tagged trajectory logs:

```text
[generation] queued job=...
[codex] starting job=... model=gpt-5.6-sol effort=high
[codex] <stdout>
[codex:err] <stderr>
[verification] scenario=... result=...
[generation] published job=... revision=...
[generation] resumed operation=...
```

Each job also has a durable record containing original intent, settings, exact model/profile, framework and prompt revisions, structured events, changed files, verification evidence, screenshots, repair attempts, publication revision, and final state. These diagnostics are available to Assistant and developers but are not normal application UI.

### Verification and repair

The generated envelope is only the first validation layer. Before publication, effort-dependent verification checks observable behavior: loadability, primary scenarios, visible-control outcomes, console errors, broken assets, accidental overflow, theme and viewport behavior, persistence/reload semantics, keyboard/pointer interaction, and declared lazy exits.

Failures produce a compact repair packet with the failed scenario, expected and actual observations, console output, screenshot, and relevant staged files. Repairs modify the staged candidate. The previous published capability remains active until the candidate passes and publication completes.

## 10. Failure and recovery

- Codex unavailable: retain the placeholder and show a normal retryable loading/error state.
- Invalid generated envelope or failed acceptance scenario: reject the candidate, preserve the prior capability, and use the effort tier's compact repair budget.
- Agent timeout: mark the generation job failed without losing the original intent.
- Browser refresh: restore OS state, installed apps, surfaces, and unfinished jobs from the local store; reconnect running jobs where possible.
- Duplicate activation: deduplicate by capability key and replay the intent once generation is ready.
- Unsafe generated action: reject controls that are not in the allowed declarative control vocabulary.
- Worker escape attempt or unexpected path/type/size: reject the complete staged candidate and retain forensic job evidence.
- Publication failure: roll back to the previous capability revision and keep the original intent retryable.

## 11. Implementation roadmap

The detailed executable roadmap is maintained in [`generation-harness-plan.md`](generation-harness-plan.md). Its order is intentional:

1. Make tests hermetic so harness work cannot pollute the tracked world.
2. Introduce generic typed OS operations so seeded and user-created system-style apps use the same interface.
3. Stage workers and publication transactionally before removing unrestricted execution.
4. Add structured work orders, explicit `gh/` model routing, native effort controls, and structured results.
5. Sandbox generated frames behind the typed bridge.
6. Add executable browser verification and repair loops.
7. Move generation boundaries from shallow pages to coherent capabilities and benchmark complex experiences.
8. Optimize scheduling, diagnostics, cache hits, and tier-specific latency using measurements.

No phase may temporarily grant workers direct write access to the live repository as a shortcut.

## 12. Test strategy

Tests cross the runtime interfaces, not private implementation details.

- Window seam: open, focus, close, minimize, maximize, and z-order.
- Input seam: address-bar editing and submit dispatch the expected intent.
- App-registry seam: arbitrary query, install, launcher registration, removal, and persistence from any app UI.
- Generation seam: request construction, target path, job deduplication, validation, and ready handoff.
- Containment seam: staged writes cannot escape to sibling nodes, live repository files, or host paths.
- Worker-profile seam: each effort tier selects the documented `gh/` model, native reasoning effort, search behavior, and repair budget.
- Replay seam: original intent is preserved and executed once after generation.
- Browser seam: URL canonicalization, local-only navigation, generated links, and history.
- Recovery seam: refresh and agent failure retain stable OS/world state.
- Generated-host seam: frame cannot access the desktop DOM or another node's storage; typed operations still work.
- Acceptance seam: visible primary controls are exercised, console/assets/layout are checked, and failed candidates are not published.
- End-to-end browser test: install an application → open placeholder → generate a coherent entry capability → exercise its primary workflow → enter and generate a genuinely separate child capability.

## 13. Explicit non-goals

- Unrequested live Internet access for imagined browser pages.
- Treating generated source code as the frontend’s public contract.
- Building an entire app during installation.
- Exposing Codex trajectory or prompts as normal OS UI.
- Allowing generated content to directly control windows or server resources.
- Reserving Settings, App Shop, Assistant, or world-changing operations for blessed app identities.
- Treating a page, button, modal, or route as the mandatory generation boundary.
- Giving any worker ambient authority over the host environment.
- Remote multi-user collaboration, production authentication, and arbitrary native process execution in the browser.
