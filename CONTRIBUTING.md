# Contributing to VibeOS

VibeOS is a closed experimental milestone that still accepts issues and focused
pull requests. The scope rule is the hard part of every change: **core stays
generic, generated content owns app meaning.**

## Scope

- Core (`apps/server`, `apps/web/src`, `packages/shared`) may contain only
  mechanisms that cannot be expressed as replaceable world content: world-tree
  addressing, artifact validation and serving, window lifecycle, storage,
  generation scheduling, bridge transport, diagnostics. See
  [`AGENTS.md`](AGENTS.md) for the binding list.
- App-specific behaviour, UI, state schema and child layout belong in `world/`
  under the node they serve.
- No app-name or command-name special cases in core, and no convenience
  shortcuts that bypass the public runtime interfaces.

## Checks a pull request must pass

```bash
npm install
npm test                              # tsc -b + node --test for the server runtime
npm run build                         # every workspace
npm run e2e --workspace @vibeos/web   # Playwright, Chromium, deterministic agent
```

Visual changes also need before/after screenshots. Store them under
`docs/screenshots/` if they document the product, or attach them to the pull
request if they only show a review.

`npm run e2e` starts the server with `VIBEOS_AGENT_MODE=deterministic`, so no
provider and no network are required. A `codex` CLI/provider is only needed for
live generation.

## Pull request expectations

- One concern per pull request, with a commit message in Conventional Commits
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Every new generated capability needs a coherent primary workflow with real
  state transitions; failed candidates are not published, and a deferred
  capability must stay reachable rather than dying in an acknowledgement
  screen.
- Add or update a test when behaviour changes. If a claim in `papers/CLAIMS.md`
  becomes false, update the ledger in the same pull request — it is the
  project's evidence of record.
- Keep `README.md` and `README.zh-CN.md` in sync when user-facing facts change.

## Issues

Say what you ran, what you expected, and what happened. For generation problems,
the job evidence under `world/.jobs/` (transitions, validation, screenshots,
repairs) is the fastest way to reproduce — attach the relevant record.

## License

Contributions are accepted under AGPL-3.0-or-later. By opening a pull request you
agree that your contribution is licensed under the same terms.
