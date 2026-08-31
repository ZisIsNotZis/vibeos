# VibeOS design

Status: implementation in progress. This is the canonical architectural
summary; executable behavior and tests remain the authority when they differ.

## Core boundary

Core provides world-tree addressing, artifact validation and serving, durable
storage, windows, focus, geometry, shortcuts, themes, generation scheduling,
isolated workers, structured handoff, caching, diagnostics, bridge transport,
patch validation, subscriptions, and refresh notifications.

Generated content provides visual design, routes, commands, state schema,
children, persistence policy, and domain behavior. Core must not branch on app
names or reserve operations for blessed identities.

## Runtime flow

```text
user intent → runtime snapshot/operation → cache hit → generated surface
                                     └──→ scoped generation → validate → world/
```

The world tree is the durable cache. Nodes may be apps, sites, games, editors,
simulators, or nested worlds. Missing descendants are lazy; entering one may
generate it while preserving the original intent.

## Non-goals and risks

There is no default live Internet, production authentication, remote
collaboration, or arbitrary native execution in the browser. Containment,
provenance, visual/accessibility gates, and recovery UX still need hardening;
see [`generation-harness-plan.md`](generation-harness-plan.md).

## Verification

Run `npm test`, `npm run build`, and
`npm run e2e --workspace @vibeos/web`. Visual changes also require screenshot
review. The README is the tested entry point and package manifests are the
version source.
