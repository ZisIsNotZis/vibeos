# VibeOS core boundary

VibeOS is a generic operating-system runtime for an evolving world tree. Treat
applications, websites, system-looking apps, games, and their interactions as
replaceable world content. Never add app-name checks, command-name checks,
application-specific UI, or application-specific behavior to core.

Core may contain only mechanisms that are unique and non-replaceable:

- world-tree addressing, artifact validation, serving, and durable storage;
- window lifecycle, focus, geometry, shortcuts, capture, and theme delivery;
- generation scheduling, isolated worker execution, structured handoff, cache,
  and diagnostics;
- bridge transport, capability-independent state reads/writes, patch
  validation, subscriptions, and refresh notifications.

Generated content owns its visual design, behavior, commands, state schema,
child layout, and persistence policy. A feature belongs in core only when it
cannot be implemented as replaceable generated content through the public
runtime interfaces.

When implementing or repairing a feature:

1. Model the smallest explicit state and mutation contract first.
2. Make the UI render from that state and emit declared intents.
3. Keep deterministic local interactions local; use AI only for open-ended
   work or source/world changes.
4. Validate the relevant state transition and visible result with tests.

Do not add convenience special cases. If an interaction seems common, expose a
generic primitive or keep it in the app artifact.
