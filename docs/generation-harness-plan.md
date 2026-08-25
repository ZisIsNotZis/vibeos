# VibeOS Generation Harness Upgrade Plan

Status: core redesign implemented following `docs/vibeos-design.md`. The hermetic baseline, exact OmniRoute profile routing, staged worker kit, structured handoff, candidate validation, transactional publication, bounded concurrency, durable job records, sandboxed generated-frame bridge, app-scoped persistence, and deterministic verification/repair loop are operational. The generation contract also defines effort-based scope, reachable deferred capabilities, resource-specific access policy, and a cooperative ultra budget. Remaining hardening is listed under “Deferred hardening” below.

## Implemented baseline

- Ordinary generation runs in an app-owned staging directory with Codex `workspace-write`, approvals disabled, a scrubbed environment, resource-specific access policy, structured output, and transactional publication.
- Effort profiles select the configured base model (`gpt-5.6-luna`, `gpt-5.6-terra`, or `gpt-5.6-sol`), optional `gh/` prefix, native reasoning effort, and distinct repair budget.
- Workers receive a versioned, self-contained work order, acceptance contract, current node, bridge API, semantic theme contract, fidelity guidance, and explicit complete-vertical-slice/deferred-capability guidance.
- Generated HTML runs in an opaque-origin `allow-scripts` iframe and reaches the runtime only through a channel-bound, app-bound bridge with request limits and isolated durable storage.
- Static asset checks and effort-dependent repair run before publication. Job transitions and evidence survive under `world/.jobs/` (ignored by Git).
- Unit, build, and deterministic Playwright suites use isolated state/world copies and do not mutate tracked artifacts.

## Deferred hardening

These remain intentional follow-up work, not claims of current protection: OS/container-enforced network and resource limits; browser-driven candidate scenarios, screenshots and accessibility gates; cancellation/restart recovery UI; provenance/license enforcement for vendored online content; transactional whole-repository repair in a disposable worktree; and migration of the three seeded system-app React views to generated apps using only generic bridge operations.

## Goals

1. Make `fast` materially faster by reducing exploration, prompt size, validation scope, and reasoning effort while preserving a reachable primary workflow and deferred actions.
2. Make `quality`, `research`, and `ultra` materially better through executable acceptance contracts, browser validation, visual inspection, and repair loops.
3. Preserve open-ended application power while preventing generated JavaScript or a confused worker from damaging the host or unrelated VibeOS state.
4. Make failures diagnosable from one job record without manually reconstructing prompts, logs, files, browser errors, and settings.
5. Generate complete vertical slices—including substantial games and creative tools—without interpreting laziness as permission to ship dead controls or shallow mockups.

## Target modules

The upgrade should concentrate complexity into five deep modules with small interfaces.

### Operation runtime

```ts
dispatch(operation: OSOperation): Promise<OperationReceipt>
subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe
snapshot(): RuntimeSnapshot
```

This module validates and executes app-agnostic OS operations. It does not inspect app identities to decide whether Settings, App Shop, or Assistant behavior is allowed.

### Generation coordinator

```ts
prepare(request: CapabilityRequest): Promise<PublishedCapability>
```

This module owns cache keys, deduplication, queueing, staging, worker selection, validation, repair, publication, rollback, and exact-once intent resume. Callers do not manage Codex processes or filesystem paths.

### Worker runner

```ts
run(workOrder: WorkOrder, profile: WorkerProfile): Promise<WorkerResult>
```

Production uses the Codex subprocess adapter. Tests use a deterministic fake adapter. The runner owns process limits, environment filtering, structured event capture, timeouts, and cancellation.

### Artifact verifier

```ts
verify(staged: StagedArtifact, contract: AcceptanceContract): Promise<VerificationReport>
```

This module combines schema/path checks, static checks, generated-entry launch, browser scenarios, console and asset checks, resize/theme checks, screenshots, and effort-dependent quality gates.

### Generated surface host

```ts
mount(node: PublishedNode, bridge: OSBridge): MountedSurface
```

This module hosts generated entries in sandboxed, opaque-origin frames and exposes only the typed bridge. It owns authenticated messaging, theme updates, storage namespacing, navigation, and teardown.

## Work order and worker kit

Workers should not explore the live repository to learn the framework. The coordinator creates a self-contained staged job:

```text
.vibeos/jobs/<job-id>/
  input/                    # read-only
    work-order.json
    acceptance.json
    current-node/
    parent-context.json
    child-index.json
  framework/                # read-only, versioned
    FRAMEWORK.md
    bridge.d.ts
    bridge.js
    theme.css
    schemas/
    examples/
  output/                   # only writable publication candidate
  evidence/                 # logs, reports, screenshots, final result
```

`work-order.json` contains the exact original intent and input, capability key, requested coherent outcome, cache identity, target route, effort/search settings, model/profile, known state, and previous verification failures. Relevant existing file contents are included directly; a list of filenames is insufficient.

The framework kit must be concise and versioned. Prompt text should contain only the job objective, invariants that apply to this job, and references to supplied files. Application examples are few-shot guidance, never a closed application taxonomy.

The worker returns a structured result using `codex exec --output-schema`, while `--json` records its trajectory. A textual `VIBEOS_READY` sentinel is not the machine contract.

## Worker profiles and OmniRoute model routing

The model slider selects a base model without a provider prefix. The independent `useGhPrefix` setting controls whether the exact command model is `gpt-5.6-*` or `gh/gpt-5.6-*`; it defaults off for fresh settings. A local OmniRoute deployment may enable it, and the exact configured model string is passed unchanged to Codex.

| Profile | Model | `model_reasoning_effort` | Search | Worker behavior | Verification/repair budget |
| --- | --- | --- | --- | --- | --- |
| `fast` | configured base model | `low` | selected policy | One focused pass | one primary browser scenario; one compact repair if it fails |
| `balanced` | configured base model | `medium` | selected policy | Complete current workflow | focused scenarios, persistence/reload check, up to one repair |
| `quality` | configured base model | `high` | selected policy | Polished production-style vertical slice | browser, console, assets, two sizes, both themes, screenshot review, up to two repairs |
| `ultra` | configured base model | `ultra` | selected policy | Maximum practical fidelity and breadth, with every deferred capability reachable | adversarial and broad verification, visual review, repeated repair within a cooperative ~60-minute budget |

Effort is a tradeoff between implementation time and visual/UX quality. Scope reduction may defer breadth, asset detail, research depth, and edge-case polish; it may never remove the requested identity, primary workflow, or a reachable action for a capability the worker chose not to implement now. A deferred action opens a concrete child capability or invokes an app-owned AI command with focused state; it is never a dummy dialog, acknowledgement, dead button, or invisible omission.

Ultra receives a target of approximately 60 minutes. The worker checks elapsed time before research, implementation, testing, and repair, and delivers the best accepted artifact before that target. Priority is primary workflow, recognizability, important adjacent actions, reachable deferrals, then polish. The coordinator may retain a final host safety timeout, but normal completion is cooperative rather than an early kill.

The runner should invoke native Codex controls rather than merely describing effort in prose, conceptually:

```bash
codex exec \
  --model gpt-5.6-sol \
  -c model_reasoning_effort=high \
  --sandbox workspace-write \
  --ask-for-approval never \
  --cd <staged-job> \
  --output-schema <result-schema> \
  --json \
  <prompt>
```

Resource access is independent: `knowledge` (facts/docs/references), `assets` (media/fonts/models/textures), `code` (repositories/examples/engines), and `packages` (npm/uv/pip/system tools). Each is `off`, `allowed`, or `recommended`; explicit user-named URLs, local paths, libraries, packages, and tools override the corresponding setting. `none` remains an offline preset. Network containment is enforced outside the prompt. Online artifacts record source URL, revision/hash when available, license, and vendored files. Generated apps remain runnable offline unless the user explicitly requests a live dependency.

## Containment model

### Generated browser code

- Run entries in a sandboxed iframe without same-origin access to the desktop.
- Communicate through a typed, versioned, authenticated `postMessage` bridge.
- Do not expose the parent DOM, raw WebSocket, backend URL, arbitrary fetch, or host storage.
- Namespace persistence by world node through bridge operations rather than shared ambient `localStorage`.
- Validate operation type, payload size, target IDs, paths, and rate before dispatch.

### Ordinary generation worker

- Give the worker a staged directory, never the live repository or live `world/` subtree.
- Mount `input/` and `framework/` read-only and make only `output/` writable.
- Use Codex `workspace-write`, approval policy `never`, a scrubbed environment, and no inherited secrets.
- Apply process, time, memory, file-count, output-size, and concurrency limits outside Codex.
- Disable network at the process/container layer when search is `none`; allow only the configured search behavior otherwise.
- Resolve real paths after symlinks and reject symlinks, devices, sockets, path escapes, unexpected executables, and excessive artifacts before publication.

### Repository repair worker

- Run in a disposable Git worktree or complete repository copy.
- Permit writes only within that isolated VibeOS repository.
- Capture the base revision and complete diff.
- Reject changes outside the intended repository and protect credentials/environment exactly as for ordinary workers.
- Build, test, launch, and verify before transactional publication.
- Keep the previous revision and generated subtree available for rollback.

The invariant is: VibeOS operations are broadly available; host authority is never available.

## Capability-sized laziness

Replace “generate the smallest page” with “generate the smallest experientially complete vertical slice.” A capability may contain many internal screens, states, assets, simulation systems, and controls. Only a genuinely separate coherent destination becomes a lazy child.

For a Red Alert-style skirmish capability, the current slice might include setup, battlefield rendering, selection, movement, combat, resource collection, production, opponent behavior, pause/restart, sound, and victory/defeat. Campaign mode, another map, multiplayer, or an editor may remain lazy children. Setup controls that lead to an acknowledgement modal and stop are not a complete capability.

The generator decides boundaries using these rules:

- Same-page manipulation, forms, tabs, menus, game loops, state transitions, and the primary workflow are implemented now.
- Prerequisites for the advertised primary experience are implemented now.
- A distinct workflow with its own durable identity, navigation destination, or independently useful experience may be a child capability.
- Effort changes fidelity, breadth, asset sophistication, and verification—not whether visible controls work.
- If a meaningful capability is deferred, expose its normal affordance and connect it to a concrete child route or `vibeOS.ai.command` with relevant scope/state. The user always has a path forward.

Resource policy follows the independent access settings:

- `knowledge=off`: use supplied context and local reasoning only.
- `knowledge=allowed/recommended`: research factual and visual references when useful/necessary.
- `assets=allowed/recommended`: use suitable legally usable local/online assets and record provenance.
- `code=allowed/recommended`: reuse established implementations, repositories, engines, and examples rather than reinventing them.
- `packages=allowed/recommended`: install appropriate existing packages/tools when they materially improve correctness or fidelity.
- Explicit references are always inspected when technically accessible, regardless of these settings.

## Executable acceptance contract

Each generated capability declares observable behavior rather than an application type:

```json
{
  "goal": "Complete one playable skirmish",
  "primaryScenarios": [
    "start a skirmish from setup",
    "select and command a unit",
    "reach a visible victory or defeat state"
  ],
  "persistence": ["settings survive reload"],
  "lazyExits": ["campaign", "map editor"],
  "viewports": [[760, 500], [1280, 800]],
  "themes": ["dark", "light"],
  "forbidConsoleErrors": true,
  "forbidBrokenAssets": true
}
```

The artifact verifier translates this into deterministic and browser checks. Quality gates remain general-purpose: loadability, primary goal completion, visible-control outcomes, state persistence, resize behavior, theme compatibility, asset integrity, console/network failures, keyboard/pointer accessibility, and accidental overflow.

Verification failures become a compact repair packet containing failed scenario, expected and actual observations, console output, screenshot, relevant files, and previous attempt. The repair worker edits the staged candidate, not the live artifact.

## Observability and user experience

Every job has one durable record containing timestamps, cache key, original intent, selected settings, exact model name, native reasoning effort, prompt/framework revisions, structured Codex events, changed files, validation reports, screenshots, repair attempts, publication revision, and final state.

The OS presents generation as normal loading:

- show loading inside the affected window or region;
- preserve the last known-good shell/content when possible;
- coalesce duplicate requests by capability key;
- allow retry and cancellation without losing the original intent;
- resume the exact action once after publication;
- use neutral user-facing errors and keep technical details in diagnostics/Assistant context.

Cache-hit latency, generation latency, first-pass acceptance, repair count, browser errors, broken assets, overflow, scenario success, and rollback rate should be measurable by effort profile.

## Implementation phases

### Phase 0 — Hermetic baseline

- Give server and Playwright tests temporary world/state/job directories and a deterministic fake worker.
- Stop E2E tests from installing timestamped applications into the tracked `world/` tree.
- Add cleanup/migration tooling for historical duplicate fixtures without deleting user state automatically.
- Record baseline latency and success metrics for representative app, website, stateful tool, and game scenarios.

Exit criterion: repeated tests leave `git status` unchanged and produce reproducible artifacts.

### Phase 1 — Typed operations and generic system apps

- Define the versioned OS operation bridge and payload schemas.
- Route Settings, App Shop, and Assistant through generic operations instead of app-ID branches.
- Add operations for settings, registry, world inspection/generation/repair, windows, and node storage.
- Test that a newly generated replacement app can perform the same VibeOS operations.

Exit criterion: no privileged behavior depends on a seeded app ID.

### Phase 2 — Staging and host containment

- Implement job-directory construction, read-only framework/input material, writable output, environment scrubbing, limits, and cancellation.
- Replace live-tree worker writes with staged publication.
- Remove `--dangerously-bypass-approvals-and-sandbox`; use `workspace-write` and approval policy `never` inside the staged root.
- Add realpath/symlink/path/type/size validation and transactional publish/rollback.
- Introduce the disposable repository-repair profile.

Exit criterion: adversarial fixture workers cannot modify the live repository, sibling nodes, or host files.

### Phase 3 — Structured harness and model routing

- Define `WorkOrder`, `AcceptanceContract`, `WorkerProfile`, `WorkerResult`, and `VerificationReport` schemas.
- Build and version the worker framework kit with bridge/theme/schema/example material.
- Replace the monolithic universal prompt with common invariants plus task-specific instructions.
- Use `--output-schema`, `--json`, explicit `--model`, native `model_reasoning_effort`, and conditional `--search`.
- Implement base-model plus optional-prefix routing and test exact command construction.

Exit criterion: each effort tier produces a distinct, inspectable execution profile and structured result.

### Phase 4 — Sandboxed generated-surface host

- Move generated entries to opaque-origin sandboxed frames.
- Implement authenticated bridge handshakes, operation validation, theme updates, node-scoped storage, navigation, and error reporting.
- Remove same-origin DOM/style mutation and raw generated-frame access to runtime transport.

Exit criterion: generated code cannot access the desktop DOM or another node's storage but can use all typed VibeOS operations.

### Phase 5 — Executable verification and repair

- Implement static/schema checks and a generated-entry test host.
- Generate browser scenarios from acceptance contracts and capture console, failed assets, overflow, screenshots, theme/viewport results, and persistence behavior.
- Add profile-dependent repair loops and preserve the prior good artifact until acceptance.
- Feed diagnostics automatically into Assistant repair context.

Exit criterion: dead controls, broken assets, console exceptions, incorrect primary workflows, and obvious layout/theme failures are rejected before delivery at the configured quality level.

### Phase 6 — Capability planning and complex-app depth

- Add a short capability-boundary planning step for balanced and above; keep it inline for ultrafast/fast.
- Require the current vertical slice to own all internal state transitions and local controls.
- Add provenance/license handling and vendoring for `online_content`.
- Add benchmark scenarios for Notes persistence, search-result semantics, an interactive board game, a realtime keyboard game, and a substantial 2D/3D simulation slice.

Exit criterion: complex requests produce a coherent playable/usable experience rather than chains of shallow pages.

### Phase 7 — Scheduling, diagnostics, and optimization

- Add bounded priority scheduling, per-node deduplication, fair concurrency, timeout/cancel/retry, and restart recovery.
- Build a diagnostics view backed by durable job records.
- Optimize framework packet caching, relevant-context selection, subprocess startup, and parallel verification.
- Tune budgets using measured latency and acceptance results rather than prompt intuition.

Exit criterion: ultrafast/fast latency improves without relaxing deterministic safety, while quality/research/ultra show measured gains in first-delivery success and defect detection.

## Definition of done

- No generation or repair worker has ambient host authority.
- Any app can invoke typed VibeOS world operations without identity-based privilege.
- Test runs never mutate the tracked world or user state.
- Every effort tier maps to the documented `gh/` model, native effort, tests, and repair budget.
- Generated entries are sandboxed and node storage is isolated.
- Publication is transactional and rollbackable.
- Every delivered capability passes its effort-dependent executable acceptance contract.
- Complex applications are split at coherent experience boundaries, not arbitrary pages or buttons.
- A single durable job record is sufficient to diagnose generation and delivery failures.
