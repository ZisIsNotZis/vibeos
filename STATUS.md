# vibeos 状态

一句话：一个跑在浏览器里的操作系统运行时，用来承载"还不存在的软件"——桌面窗口、启动器、持久化、通用应用桥接，加上一个按需生成缺失世界节点并在校验后发布、然后恢复用户原操作的惰性生成 harness（`README.md:5`、`docs/project-status.md:5-7`）。

## 当前状态

**已关闭（里程碑，2026-09-29），版本 0.1.0。**

- 关闭声明：`docs/project-status.md:9-12` —— "Closed as a milestone (2026-09-29)"，实验目标已达成，除非项目输入或目标改变否则不再开发；同一结论见 `README.md:30`。
- 性质：实验性、本地优先，不是生产操作系统（`docs/project-status.md:25`）。
- 版本：根 `package.json:5` 为 `0.1.0`，`apps/server`、`apps/web`、`packages/shared` 三个 workspace 同为 `0.1.0`；`README.md:30` 说标签按 `vMAJOR.MINOR.PATCH`，但仓库当前没有任何标签（`git tag` 无输出）。
- 仓库最后一次提交 2026-10-19（`659ee89 Show the project screenshot in the README`），是展示性改动，不是功能改动。
- 边界：本次只读仓内文件，未运行 `npm test` / `npm run build` / `npm run e2e`；仓内记录的测试结果见 `FINDINGS.md` 并对"当前是否仍成立"标注为未知。

## 最新进展落在哪个文件

- 状态与边界：`docs/project-status.md`。
- **主张台账（最重要的一份证据文件）**：`papers/CLAIMS.md` —— 逐条给出状态（Implemented/tested、Observed、Unverified、Explicitly not claimed）、证据文件与边界，末尾一节写死复现边界。
- 架构与契约：`docs/vibeos-design.md`（核心边界与运行时流程）、`docs/generation-harness-plan.md`（work order 契约与加固待办）。
- 界面证据：`docs/screenshots/`（`desktop.png`、`launcher.png`、`browser.png`、`settings-appearance.png`、`dota2.png`、`apps/`），`README.md:7` 直接引用。

## 下一步

仓内没有排期，只写了两类明确的未完成项：

- 加固待办（原文照搬 `docs/generation-harness-plan.md:15-18`）：OS/容器资源与网络限额、取消/重启恢复 UI、资产来源与许可证处理、可丢弃仓库修复、浏览器无障碍门禁、seed 系统视图迁移；这些"不是当前的安全保证"。
- 野心清单（`README.md:32-36`、`docs/project-status.md:25-28`）：更好的生成式 2D/3D 软件、视觉与无障碍验证、恢复 UX、来源管理、可分享世界、协作、显式设备桥接——全部标为 aspiration，不是当前承诺。

若日后要动这件事，仓内写明的入口与前置条件是：Node.js 20+、npm、以及已配置的 `codex` CLI/provider（`README.md:13`、`README.md:22`）。
