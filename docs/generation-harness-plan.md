# VibeOS generation harness

Status: the core harness is implemented; this document is the compact
canonical contract for its remaining hardening and verification.

## Implemented contract

- A work order is versioned, scoped, and contains the original intent,
  acceptance criteria, relevant context, settings, and prior failures.
- Workers run in staged app-owned workspaces with structured output,
  validation, bounded repair, and transactional publication.
- Generated frames use an opaque origin and a channel-bound bridge. Persistence
  is namespaced by world node.
- Job records preserve transitions, events, validation, screenshots, repairs,
  and publication evidence under ignored `world/.jobs/`.
- Unit, build, and deterministic browser tests use isolated world/state copies.

## Hardening backlog

OS/container resource and network limits, cancellation/restart recovery UI,
asset provenance and license handling, disposable-repository repair, browser
accessibility gates, and migration of seeded system views remain deferred.
They are not current security guarantees.

## Acceptance rule

Every generated capability needs a coherent primary workflow with real state
transitions. Failed candidates are not published. Complex games and tools may
defer separate capabilities, but must expose a reachable next step rather than
a dead acknowledgement screen.

See [`vibeos-design.md`](vibeos-design.md) for architecture and
[`../README.md`](../README.md) for tested commands.
