# VibeOS ✨

English | [简体中文](README.zh-CN.md)

VibeOS is a browser-hosted operating-system runtime for software that does not
exist yet. It provides desktop windows, a launcher, persistence, generic app
bridges, and a lazy generation harness that prepares missing world nodes and
resumes the user’s action.

## Quickstart

Requires Node.js 20+, npm, and a configured `codex` CLI/provider.

```bash
npm install
npm test
npm run build
npm run dev
```

Open the Vite URL. The backend listens on `ws://localhost:8787` and exposes
`/health`. Browser checks run with `npm run e2e --workspace @vibeos/web`.

## Architecture

The core owns generic mechanisms: world addressing, window lifecycle, focus,
storage, themes, transport, generation, validation, and diagnostics. Generated
world content owns app meaning, UI, behavior, state, and children. A cache miss
stages a scoped Codex worker, validates the artifact, publishes it under
`world/`, and resumes the original intent. See the canonical design documents:
[`docs/vibeos-design.md`](docs/vibeos-design.md) and
[`docs/generation-harness-plan.md`](docs/generation-harness-plan.md).

## Current status and version

Version `0.1.0` is declared in the root and workspace package manifests; tags
use `vMAJOR.MINOR.PATCH`. This is a useful, innovative prototype, not a
production operating system. Current screenshots are in `docs/screenshots/`.

## Future vision

Improve generated 2D/3D software, visual and accessibility verification,
recovery UX, provenance handling, shareable worlds, collaboration, and
explicit device bridges. These are aspirations, not current guarantees.

## Contributing

Issues and focused PRs are welcome. Keep core generic, put app-specific meaning
in `world/`, and include tests plus screenshots for visual changes. Agents can
triage, investigate, test, document, and implement accepted issues; maintainers
review and merge. Read [`AGENTS.md`](AGENTS.md) before changing the runtime.

## 中文简介

VibeOS 是一个浏览器中的操作系统运行时，用于承载尚不存在的软件。它提供窗口、
启动器、持久化、通用应用桥接和按需生成：缺失的世界节点由受限 Codex 工作器准备，
校验后写入 `world/` 并继续原始操作。需要 Node.js 20+、npm 和已配置的 `codex`，
运行 `npm install`、`npm test`、`npm run build`、`npm run dev`。当前版本为 `0.1.0`，
仍是原型；未来将加强生成质量、视觉验证、恢复、来源管理、共享世界和协作。项目采用
AGPL-3.0-or-later，详见 [`LICENSE`](LICENSE)。
