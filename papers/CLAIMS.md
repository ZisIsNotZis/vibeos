# VibeOS paper claim ledger

This ledger is the conservative boundary for `main.tex`. “Implemented” means the current source contains the described path and the named test exercises it; it does not mean production readiness.

| Claim | Status | Evidence | Boundary |
| --- | --- | --- | --- |
| VibeOS is a browser-hosted imagined/local OS prototype. | Implemented/documented | `README.md`; `docs/vibeos-design.md`. | Product description, not an OS standards claim. |
| Missing surfaces can be requested lazily and cached by app/route. | Implemented/tested | `apps/server/src/runtime.ts`; `runtime.test.ts` cache and concurrent-generation tests. | Surface generation exposes readiness; it does not replay the original control action. |
| Generation uses staged, scoped work orders and structured results. | Implemented/tested | `generation-harness.ts`; `generation-harness.test.ts`. | Path/process restrictions are not a complete security sandbox. |
| Resource access is separately policy-selected. | Implemented/tested | `selectResourcePolicy`; policy tests. | Policy metadata and search flags are not complete host/provider enforcement. |
| Candidates receive source-level validation before publication. | Implemented/tested | `artifact-verifier.ts`; `world-contract.ts`; verifier and contract tests. | Checks do not establish semantic correctness, accessibility, or malware absence. |
| Publication preserves mutable data and rolls back after a tested post-load failure. | Implemented/tested | `publishCandidate`; publication and rollback tests. | No crash-safe transaction, fsync, journal, or concurrency proof. |
| Generated frames use a generic channel-bound bridge. | Implemented/tested | `frame-bridge.ts`; `frame-bridge.test.ts`; runtime bridge tests. | No claim of browser isolation or complete capability security. |
| App state is revisioned and patchable through a generic seam. | Implemented/tested | `app-state.ts`; `app-state.test.ts`; runtime bridge tests. | JSON state is not a database or consistency proof. |
| Surface generation uses a staged work order and typed handoff. | Implemented/tested | `generation-harness.ts`; `generation-harness.test.ts`; `runtime.ts`. | A generated surface is exposed after validation; the originating action is not replayed. |
| Process execution has bounded implementation-level controls. | Implemented/tested | `runtime.ts` process bridge tests. | This is not a complete sandbox against hostile code or resource exhaustion. |
| The source-level test run passed 75/75. | Observed | `npm test`, run 2026-09-01. | A later edit or environment change requires rerunning it. |
| VibeOS improves generation quality, latency, cost, or safety. | Unverified | No dataset, baseline, provider trace, or measurement package. | Do not infer these results from unit tests. |
| VibeOS is secure for arbitrary generated code or hostile workloads. | Explicitly not claimed | Design docs list containment and provenance as hardening work. | Requires adversarial, browser, process, and provenance evaluation. |

## Reproduction boundary

The reported test result is reproduced from the repository root with `npm install` and `npm test`; the command builds the server workspace and runs its compiled tests. Live generation additionally needs the configured external worker/provider and is not part of the 75-test result.

The source snapshot used for the paper is VibeOS `0.1.0` at revision `90b23f277a52c1862a764a97a9ddd99c8630e4f4`. Browser E2E was exploratory rather than an evidence result: the current setup reported 19 passed, 6 failed, and 3 skipped and mutated a tracked state fixture. Visual screenshots, benchmark data, generated-job traces, and provider-backed quality are not claimed as reproduced by this package.
