# vibeos 已确立的事实与结论

本文件只搬运本仓库内已有的事实，不新增实验、不新增数字、不做质量评价。每条给出出处（文件:行）。

状态定义：**成立** = 仓内代码/文档直接支撑；**部分** = 仓内只有文字声明，或声明与其它文件不一致；**已撤回** = 仓内记录该结论已被收回或不再成立。

本仓的特殊之处：它自己写了一本主张台账 `papers/CLAIMS.md`，逐条给出状态与边界。下面的结论优先引这本台账，因为那是仓内已经做过的"哪个说法成立、哪个不成立"的分拣。

## 已确立的结论

| # | 结论 | 关键数字 | 出处 | 状态 |
|---|---|---|---|---|
| 1 | 主张台账共 13 条：9 条 Implemented/tested、1 条 Implemented/documented、1 条 Observed、1 条 Unverified、1 条 Explicitly not claimed | 13 条 | `papers/CLAIMS.md:7-19` | 成立 |
| 2 | 台账定义：`Implemented` 指当前源码里存在对应路径且被点名的测试覆盖，**不等于**生产可用 | 1 条定义 | `papers/CLAIMS.md:3` | 成立 |
| 3 | 源码级测试记录为 75/75 通过，运行日期 2026-09-01；台账同时写明改一行代码或换环境就要重跑 | 75/75 | `papers/CLAIMS.md:17` | 成立 |
| 4 | 复现方式：仓库根 `npm install` + `npm test`；该命令会构建 server workspace 并跑其编译后的测试 | 2 条命令 | `papers/CLAIMS.md:23` | 成立 |
| 5 | 论文用的源码快照是 `0.1.0`，commit `90b23f277a52c1862a764a97a9ddd99c8630e4f4` | 1 个提交号 | `papers/CLAIMS.md:25` | 成立 |
| 6 | 版本 `0.1.0` 写在根与三个 workspace 的 manifest 里 | 4 个 manifest | `package.json:5`、`apps/server/package.json:1`、`apps/web/package.json:1`、`packages/shared/package.json:1` | 成立 |
| 7 | 架构边界：core 只拥有通用机制（世界寻址、窗口生命周期、焦点、存储、主题、传输、生成、校验、诊断），生成内容拥有 app 语义；core 不得按 app 名分支 | 9 类核心机制 | `docs/vibeos-design.md:7`、`docs/vibeos-design.md:9`、`README.md:26` | 成立 |
| 8 | 运行时流程固定为：用户意图 → 快照/操作 → 命中缓存则返回生成界面；未命中则作用域内生成 → 校验 → 写入 `world/` | 1 条流程 | `docs/vibeos-design.md:13-16`、`README.md:26` | 成立 |
| 9 | 世界树本身就是持久缓存；缺失的后代按需生成 | — | `docs/vibeos-design.md:18` | 成立 |
| 10 | work order 契约包含：版本化、作用域、原始意图、验收标准、上下文、设置、历史失败；发布是事务性的，失败候选不发布 | 7 项内容 | `docs/generation-harness-plan.md:7-8`、`docs/generation-harness-plan.md:22` | 成立 |
| 11 | 生成帧用不透明源（opaque origin）+ 通道绑定桥接；持久化按世界节点分命名空间 | 2 条隔离措施 | `docs/generation-harness-plan.md:9-10` | 成立 |
| 12 | 作业记录落在被忽略的 `world/.jobs/`，保存状态转移、事件、校验、截图、修复与发布证据 | 1 个目录 | `docs/generation-harness-plan.md:11-12` | 成立 |
| 13 | 已通过的自动化检查有三类入口：`npm test`、`npm run build`、`npm run e2e --workspace @vibeos/web` | 3 条命令 | `docs/vibeos-design.md:26`、`docs/project-status.md:18-19`、`README.md:22` | 成立 |
| 14 | 前置条件是 Node.js 20+、npm，以及已配置的 `codex` CLI/provider | 1 个外部依赖 | `README.md:13` | 成立 |
| 15 | 后端监听 `ws://localhost:8787` 并暴露 `/health` | 1 个端口 | `README.md:22` | 成立 |
| 16 | 界面证据是入库的截图，不是口头声明 | 6 张图 | `README.md:7`、`docs/project-status.md:19`、`docs/screenshots/` | 成立 |

## 负结果

| # | 结论 | 关键数字 | 出处 | 状态 |
|---|---|---|---|---|
| N1 | **质量/延迟/成本/安全提升未被验证**：没有数据集、基线、provider 追踪或测量包，台账明确禁止从单元测试推断这些结果 | 0 个测量包 | `papers/CLAIMS.md:18` | 成立 |
| N2 | **不声称对任意生成代码或恶意负载安全**（Explicitly not claimed）；沙箱、进程、来源三类评测都缺 | 1 条明确免责 | `papers/CLAIMS.md:19` | 成立 |
| N3 | 浏览器 E2E 是探索性的、不算证据：当时报告 19 通过、6 失败、3 跳过，并且改动了一个被跟踪的状态 fixture | 19 / 6 / 3 | `papers/CLAIMS.md:25` | 成立 |
| N4 | 生成能力只在"表面"层面兑现：缓存的界面会被暴露，但原始控制动作不会被重放 | 2 条范围限制 | `papers/CLAIMS.md:8`、`papers/CLAIMS.md:15` | 成立 |
| N5 | 路径/进程限制不是完整安全沙箱；资源策略元数据≠宿主侧完整执行；源码校验不等于语义正确、无障碍或无毒 | 3 条边界 | `papers/CLAIMS.md:9`、`papers/CLAIMS.md:10`、`papers/CLAIMS.md:11` | 成立 |
| N6 | 发布没有崩溃安全事务、没有 fsync、没有日志、没有并发证明；JSON 状态不是数据库或一致性证明 | 4 项缺失 | `papers/CLAIMS.md:12`、`papers/CLAIMS.md:14` | 成立 |
| N7 | 没有默认联网、没有生产级认证、没有远程协作、浏览器内没有任意原生执行 | 4 条非目标 | `docs/vibeos-design.md:22` | 成立 |
| N8 | 加固尚未完成：资源/网络限额、取消重启恢复、资产来源与许可证、无障碍门禁、系统视图迁移全在 backlog，且"不是当前安全保证" | 6 项 | `docs/generation-harness-plan.md:15-18` | 成立 |
| N9 | 论文包不声称复现了截图、基准数据、生成作业轨迹或 provider 相关的质量结果 | 4 类不声称 | `papers/CLAIMS.md:25` | 成立 |
| N10 | 仓库至今没有任何标签（`git tag` 无输出）；版本 `0.1.0` 自初始提交 `ec8a198` 起未变更，`README.md:30` 已写明这一点并把 `vMAJOR.MINOR.PATCH` 降为将来打标签时的命名规则 | 0 个标签 | `README.md:30`、`git tag`、`package.json:5` | 成立 |

## 撤回 / 回退记录

本仓没有"某条结论被撤回"的记录；台账把不成立的说法直接标为 Unverified / Explicitly not claimed，而不是先声称再撤回。已核对 `papers/CLAIMS.md`、`docs/project-status.md`、`docs/generation-harness-plan.md` 与 `git log` 的提交标题，均无回退类记录。

暂无。

## 未知（仓内无法确定，不做推断）

- 当前代码是否仍能跑出 75/75：台账自己说"改一行或换环境就要重跑"（`papers/CLAIMS.md:17`），本任务禁止运行，未复跑，未知。
- E2E 的 6 个失败现在是否已修：仓内没有后续记录，未知。
- 生成质量、延迟、成本的任何数值：仓内 0 个测量包（N1），未知。
- 真实浏览器环境下的隔离强度：台账只给设计（`docs/generation-harness-plan.md:9-10`），没有对抗测试记录，未知。
