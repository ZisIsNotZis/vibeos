[English](README.md) | **简体中文**

<img src="assets/logo.svg" alt="VibeOS" width="118">

# VibeOS

### 一个跑在浏览器里、按需生长的操作系统

**VibeOS 在一个浏览器标签页里运行一整套桌面，并且会自己把缺失的软件写出来：打开一个还不存在的应用、页面或子窗口，一个受限的 Codex 工作器就会把它生成出来——经过校验、发布到 `world/`，然后从你原来的那一步操作继续。**

![VibeOS 桌面](docs/screenshots/desktop.png)

*桌面、启动器、设置和生成出来的应用，全都渲染在同一个浏览器标签页里——截图已提交在 [`docs/screenshots/`](docs/screenshots/)。*

## 快速开始

前置条件：Node.js 20+、npm，以及一个在 `PATH` 上的 `codex` CLI/提供方（可用 `CODEX_BIN` 指定其它可执行文件），用于实时生成。没有提供方也能浏览已经提交在 `world/apps/` 下的应用。

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动两个 workspace。打开 Vite 输出的地址（默认 `http://localhost:5173`）；运行时监听 `ws://localhost:8787`，`/health` 返回 `{"ok":true}`。点任意图标——桌面、启动器、以及你打开的每个应用都来自世界树。

不依赖提供方的验证方式：

```bash
npm test                                   # 构建并运行 server 运行时的单元测试
npm run e2e --workspace @vibeos/web        # Playwright（Chromium），对着确定性 agent 跑
```

e2e 会用 `VIBEOS_AGENT_MODE=deterministic` 启动服务端，因此不会调用任何提供方。

## 现在能做什么

- **一个真正的桌面外壳**——窗口生命周期（聚焦、最小化、最大化、移动、缩放）、dock、启动器、命令面板、快捷键、主题与显示缩放。
- **一棵持久的世界树**——每个应用、网站、游戏、编辑器、模拟器和子页面都是 `world/` 下的一个节点（`node.json`、入口 HTML、`data/`、`children/`）。这棵树本身就是缓存，缺失的后代在你进入时才生成。
- **按需生成的 harness**——一份带版本的工单（原始意图、验收标准、上下文、设置、此前失败记录）在隔离的暂存工作区里执行，产出结构化结果，经校验、在有限次数内修复，然后事务性发布。失败的候选永远不会被发布。
- **隔离与证据**——生成的页面运行在不透明源（opaque origin）上，只能走与通道绑定的桥接；存储按节点分命名空间；作业记录把状态转移、事件、校验、截图和修复证据留在被忽略的 `world/.jobs/` 下。
- **是能力桥，不是脚本标签**——生成的页面通过 `window.vibeOS` 发起导航、状态读写、带版本号的补丁式状态更新、通知、`ai.command`（作用域可为本应用、其后代或整个世界）以及 `process.run`。
- **有真实上下文的助理**——窗口截图、最近操作和节点身份会被交给 agent，agent 也能以结构化选项或自由文本的方式反问用户。
- **随仓库提供 39 个世界节点**——3D 建模与 CAD 编辑器、MIDI 与音乐工作站、游戏（CS 1.6、Dota 2、魔兽争霸 III、扫雷、空当接龙、俄罗斯方块……）、带子站点的浏览器、手机与安卓模拟器、办公与代码编辑器。
- **输入与外观**——内置拼音输入法，浅色/深色/沙漠三种外观模式，dock 位置、界面与等宽字体、五档显示缩放，以及在“设置”里暴露的模型/推理/投入/搜索等级。

## 架构

核心只拥有通用机制，生成内容拥有全部应用语义。只有当某个功能无法通过公开的运行时接口表达为可替换的世界内容时，它才属于核心——核心不按应用名分支，也没有“钦定”的保留命令。

```text
apps/            运行时，拆成两个 workspace
  server/        Node HTTP + WebSocket 服务端：运行时状态、世界加载、
                 产物校验、生成 harness、Codex 适配器
  web/           React 桌面外壳（Vite）：窗口、dock、启动器、命令面板、
                 输入法、窗口截图、Playwright 用例
packages/shared/ 意图、设置、快照、运行时事件、桥接契约
world/           持久世界树——每个节点一个目录，含数据与子节点
papers/          论文（main.tex）、主张台账（CLAIMS.md）、参考文献
docs/            设计、生成 harness 契约、项目状态、截图
assets/          logo
vendor/hyperframes   git 子模块：生成视频类应用所用的技能库
```

各部分如何对话：浏览器通过 WebSocket 发送意图（`open_app`、`open_surface`、`move_window`、`activate_control`、`storage_write`、`ai.command` 等），并收到快照以及增量式的窗口/界面/追踪事件。生成出来的页面从不直接连服务端——它们在沙箱 iframe 里发桥接请求，由运行时校验后再执行。缓存未命中会变成一次受限范围的生成，之后 iframe 加载的正是被发布出来的那个产物。

权威文档：[`docs/vibeos-design.md`](docs/vibeos-design.md)（架构与运行时流程）、[`docs/generation-harness-plan.md`](docs/generation-harness-plan.md)（工单契约与加固待办）、[`AGENTS.md`](AGENTS.md)（任何改动都必须遵守的核心边界规则）。

## 如何开发

```bash
npm install                 # 根 workspace 安装（apps/*、packages/*）
npm run dev                 # 同时启动 server（tsx watch）与 web（vite）
npm test                    # server：tsc -b，再对 dist/*.test.js 跑 node --test
npm run build               # 每个 workspace 的 tsc -b + vite build
npm run e2e --workspace @vibeos/web   # Playwright + Chromium，确定性 agent
```

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `VIBEOS_PORT` | `8787` | 服务端 HTTP/WebSocket 端口 |
| `VIBEOS_WORLD_ROOT` | `./world` | 世界树根目录 |
| `VIBEOS_STATE_FILE` | `world/.runtime-state.json` | 持久化的运行时快照 |
| `VIBEOS_AGENT_MODE` | 实时 | 设为 `deterministic` 时用脚本化 agent 替换 Codex 适配器 |
| `CODEX_BIN` | `codex` | 生成所用的提供方可执行文件 |
| `VIBEOS_GENERATION_CONCURRENCY` | `2` | 并发生成的工作器数量 |
| `VIBEOS_GENERATION_TIMEOUT_MS` | `900000` | 单次生成的超时时间 |

改动界面必须做截图复核；仓库把界面证据保留在 `docs/screenshots/`。

## 如何贡献

欢迎提 issue 和聚焦的 PR。核心保持通用，应用语义放进 `world/`，涉及界面的改动要带测试和改动前后截图。PR 必须通过的检查见 [`CONTRIBUTING.md`](CONTRIBUTING.md)，动运行时之前先读 [`AGENTS.md`](AGENTS.md)——agent 也可以参与分诊、调查、测试、写作和实现已被接受的 issue。

## 路线

**已实现**

- 桌面外壳、世界树寻址、窗口与界面生命周期、持久化、设置与主题。
- 生成 harness：带作用域的工单、隔离工作器、结构化交接、校验、有限次修复、事务性发布、作业证据。
- 桥接传输：补丁校验、版本号、订阅与刷新通知。
- 确定性的单元测试与浏览器测试入口，以及一份把每条论文主张映射到源码证据的主张台账。
- 随仓库提供的 39 个世界节点及其截图集。

**计划中（已推迟，不构成承诺）**

- 生成工作器的 OS/容器资源与网络限额。
- 取消与重启后的恢复界面。
- 生成内容的资产来源与许可证处理。
- 可丢弃仓库的修复、浏览器无障碍门禁。
- 种子系统视图的迁移。

本项目是一个已收尾的实验性里程碑：目标达成，除非输入或目标改变，否则不再计划主动开发（见 [`docs/project-status.md`](docs/project-status.md)）。若再次启动，方向是更可靠的生成式 2D/3D 软件、自动化的视觉与无障碍验证、真正可用的恢复体验、来源追踪、可分享的世界树、协作，以及显式的设备桥接——这些都是愿景，不是当前已交付的行为。

## 许可

[AGPL-3.0-or-later](LICENSE)。第三方组件及其许可证列在 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)，其中包括 MIT 许可的 `naive-pinyin` 输入法引擎，以及采用 CC-BY-4.0/MIT 许可的词典数据。
