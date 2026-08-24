import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  Calculator,
  FileText,
  Folder,
  Globe,
  Search,
  Settings,
  Terminal,
  X,
  Store,
  Sparkles,
  MessageCircle,
  Minus,
  Square,
} from "lucide-react";
import type {
  AgentQuestion,
  AppId,
  Intent,
  Operation,
  RuntimeEvent,
  RuntimeSnapshot,
  WindowModel,
  RuntimeIntent,
  AppearanceMode,
  BackgroundMode,
} from "@vibeos/shared";
import "./styles.css";
import { captureElement, captureScreen } from "./capture";
import { matchesShortcut, shortcuts } from "./shortcuts";
import { InputMethodController, type ImeState } from "./input-method";

const appInfo: Record<
  string,
  { label: string; icon: typeof Folder; color: string }
> = {
  files: { label: "Files", icon: Folder, color: "#f4b942" },
  calculator: { label: "Calculator", icon: Calculator, color: "#75a4ff" },
  assistant: { label: "Assistant", icon: MessageCircle, color: "#9b8cff" },
  editor: { label: "Text Editor", icon: FileText, color: "#ee8fb7" },
  browser: { label: "Browser", icon: Globe, color: "#7ed7bb" },
  settings: { label: "Settings", icon: Settings, color: "#a89dfc" },
  shop: { label: "App Shop", icon: Store, color: "#f08c62" },
};
const bridgeFrames = new Map<string, Window>();
const blankIme: ImeState = {
  enabled: false,
  loading: false,
  preedit: "",
  candidates: [],
  selected: 0,
};
const initial: RuntimeSnapshot = {
  windows: [],
  operations: [],
  notifications: [],
  apps: [],
  surfaces: [],
  settings: {
    model: "terra",
    useGhPrefix: false,
    reasoning: "high",
    effort: "quality",
    search: "none",
    generationVisibility: "completion",
    appearance: {
      mode: "dark",
      backgroundMode: "fill",
      autoHideChromeOnMaximize: false,
      dockPosition: "bottom",
      uiTypeface: "modern",
      monoTypeface: "modern",
      displayScale: "default",
      notificationDuration: 20,
    },
  },
};
async function captureDesktop() {
  try {
    await captureScreen();
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Screenshot could not be created in this browser.",
    );
  }
}

function App() {
  const [snapshot, setSnapshot] = useState(initial);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [launcher, setLauncher] = useState(false);
  const [commandPalette, setCommandPalette] = useState<{
    open: boolean;
    appId?: string;
    context?: unknown;
    commands: Array<{
      id: string;
      title: string;
      detail?: string;
      context?: unknown;
    }>;
  }>({ open: false, commands: [] });
  const [commandText, setCommandText] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    level: "info" | "success" | "warning" | "error";
  } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const [taskBubbles, setTaskBubbles] = useState<
    Record<
      string,
      { title: string; kind: string; text: string; status: string }
    >
  >({});
  const taskTimers = useRef(new Map<string, number>());
  const [connected, setConnected] = useState(false);
  const [queued, setQueued] = useState<RuntimeIntent[]>([]);
  const [closingWindows, setClosingWindows] = useState<Set<string>>(new Set());
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    requestId: string;
    frame: Window;
    channel: string;
    items: Array<{ id: string; label: string; disabled?: boolean }>;
    x: number;
    y: number;
  } | null>(null);
  const [agentQuestion, setAgentQuestion] = useState<{
    questionId: string;
    title: string;
    question: AgentQuestion;
  } | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [customAnswer, setCustomAnswer] = useState(false);
  const [imeState, setImeState] = useState<ImeState>(blankIme);
  const ime = useMemo(() => new InputMethodController(setImeState), []);
  useEffect(() => () => ime.destroy(), [ime]);
  useEffect(
    () => () => taskTimers.current.forEach((timer) => clearTimeout(timer)),
    [],
  );
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue =
        "VibeOS is still open. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  useEffect(() => {
    document
      .querySelectorAll<HTMLIFrameElement>("iframe.generated-entry")
      .forEach((frame) =>
        frame.contentWindow?.postMessage(
          {
            type: "vibeos:ime-state",
            channel: frame.dataset.bridgeChannel,
            enabled: imeState.enabled,
            composing: !!imeState.preedit,
          },
          "*",
        ),
      );
  }, [imeState.enabled, imeState.preedit]);
  useEffect(() => {
    const appearance = snapshot.settings.appearance;
    document.documentElement.dataset.theme = appearance.mode;
    document.documentElement.dataset.uiTypeface = appearance.uiTypeface;
    document.documentElement.dataset.monoTypeface = appearance.monoTypeface;
    document.documentElement.dataset.displayScale = appearance.displayScale;
    document
      .querySelectorAll<HTMLIFrameElement>("iframe.generated-entry")
      .forEach((frame) =>
        frame.contentWindow?.postMessage(
          {
            type: "vibeos:theme",
            channel: frame.dataset.bridgeChannel,
            theme: appearance.mode,
            typography: appearance,
          },
          "*",
        ),
      );
    const root = document.querySelector<HTMLElement>(".os");
    if (root) {
      root.style.setProperty(
        "--user-background",
        appearance.backgroundImage
          ? `url(${appearance.backgroundImage})`
          : "none",
      );
      root.dataset.backgroundMode = appearance.backgroundMode;
      root.dataset.dockPosition = appearance.dockPosition;
      root.classList.toggle(
        "auto-hide-chrome",
        appearance.autoHideChromeOnMaximize &&
          snapshot.windows.some((window) => window.state === "maximized"),
      );
    }
  }, [snapshot.settings.appearance, snapshot.windows]);
  useEffect(() => {
    const focusFrame = (event: MessageEvent) => {
      const message = event.data;
      if (!message || message.type !== "vibeos:focus") return;
      const frame = Array.from(
        document.querySelectorAll<HTMLIFrameElement>("iframe.generated-entry"),
      ).find(
        (candidate) =>
          candidate.contentWindow === event.source &&
          candidate.dataset.bridgeChannel === message.channel,
      );
      const windowId = frame?.closest<HTMLElement>(".window")?.dataset.windowId;
      if (windowId && socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "focus_window", windowId }));
    };
    window.addEventListener("message", focusFrame);
    return () => window.removeEventListener("message", focusFrame);
  }, [socket]);
  const showNotice = (
    message: string,
    level: "info" | "success" | "warning" | "error" = "info",
    timeoutMs = 3500,
  ) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ message, level });
    noticeTimer.current = window.setTimeout(() => setNotice(null), timeoutMs);
  };
  useEffect(() => {
    const connection = new WebSocket(
      import.meta.env.VITE_VIBEOS_SOCKET ?? "ws://localhost:8787",
    );
    connection.onopen = () => {
      console.info("[vibeos] backend connected");
      setConnected(true);
      setSocket(connection);
    };
    connection.onclose = () => {
      console.info("[vibeos] backend disconnected");
      setConnected(false);
      setSocket(null);
    };
    connection.onerror = () => {
      setConnected(false);
      showNotice("System connection failed.", "error");
    };
    connection.onmessage = (event) => {
      const message = JSON.parse(event.data) as RuntimeEvent;
      console.info("[vibeos:event]", message);
      if (message.type === "bridge_result") {
        const target = bridgeFrames.get(message.requestId);
        const frame = Array.from(
          document.querySelectorAll<HTMLIFrameElement>(
            "iframe.generated-entry",
          ),
        ).find((candidate) => candidate.contentWindow === target);
        target?.postMessage(
          {
            ...message,
            type: "vibeos:result",
            channel: frame?.dataset.bridgeChannel,
          },
          "*",
        );
        bridgeFrames.delete(message.requestId);
        return;
      }
      if (message.type === "agent_question") {
        setAgentQuestion({
          questionId: message.questionId,
          title: message.title,
          question: message.question,
        });
        setQuestionAnswer(
          message.question.kind === "text"
            ? (message.question.initial ?? "")
            : "",
        );
        setCustomAnswer(false);
        return;
      }
      if (message.type === "task_trace") {
        setSnapshot((current) => {
          const order = ["completion", "messages", "tools", "reasoning"];
          const needed =
            message.kind === "begin" || message.kind === "end"
              ? 0
              : message.kind === "message"
                ? 1
                : message.kind === "tool_call"
                  ? 2
                  : 3;
          if (order.indexOf(current.settings.generationVisibility) < needed)
            return current;
          const timer = taskTimers.current.get(message.taskId);
          if (timer) clearTimeout(timer);
          setTaskBubbles((bubbles) => ({
            ...bubbles,
            [message.taskId]: {
              title: message.title,
              kind: message.kind,
              text: message.text,
              status: message.status ?? "active",
            },
          }));
          if (message.kind === "end")
            taskTimers.current.set(
              message.taskId,
              window.setTimeout(
                () =>
                  setTaskBubbles((bubbles) => {
                    const next = { ...bubbles };
                    delete next[message.taskId];
                    return next;
                  }),
                message.status === "error" ? 12000 : 4000,
              ),
            );
          return current;
        });
        return;
      }
      if (message.type === "state_changed")
        document
          .querySelectorAll<HTMLIFrameElement>(
            `iframe.generated-entry[data-app-id="${CSS.escape(message.appId)}"]`,
          )
          .forEach((frame) =>
            frame.contentWindow?.postMessage(
              {
                type: "vibeos:state",
                channel: frame.dataset.bridgeChannel,
                state: {
                  appId: message.appId,
                  revision: message.revision,
                  state: message.state,
                },
              },
              "*",
            ),
          );
      if (message.type === "world_changed")
        setRefreshVersion((version) => version + 1);
      setSnapshot((current) => reduce(current, message));
      if (message.type === "notification")
        showNotice(message.message, message.level, message.timeoutMs);
      if (message.type === "trace" && message.message.startsWith("failed"))
        showNotice(message.message, "error");
    };
    const bridge = (event: MessageEvent) => {
      const frame = Array.from(
        document.querySelectorAll<HTMLIFrameElement>("iframe.generated-entry"),
      ).find((candidate) => candidate.contentWindow === event.source);
      const appId = frame?.dataset.appId;
      const channel = frame?.dataset.bridgeChannel;
      const message = event.data;
      if (!appId || !channel || !message || typeof message !== "object") return;
      if (message.type === "vibeos:ready" && !("channel" in message)) {
        frame.contentWindow?.postMessage(
          {
            type: "vibeos:init",
            channel,
            theme: document.documentElement.dataset.theme ?? "dark",
          },
          "*",
        );
        frame.contentWindow?.postMessage(
          {
            type: "vibeos:ime-state",
            channel,
            enabled: ime.snapshot().enabled,
          },
          "*",
        );
        return;
      }
      if (message.type === "vibeos:ime-toggle" && message.channel === channel) {
        ime.toggle();
        return;
      }
      if (message.type === "vibeos:ime-key" && message.channel === channel) {
        const rect = frame.getBoundingClientRect();
        const point =
          message.anchor &&
          typeof message.anchor.x === "number" &&
          typeof message.anchor.y === "number"
            ? {
                x: rect.left + message.anchor.x,
                y: rect.top + message.anchor.y,
              }
            : undefined;
        ime.setTarget({
          kind: "frame",
          frame: event.source as Window,
          channel,
          anchor: point,
        });
        ime.key(String(message.key ?? ""), point);
        return;
      }
      if (
        message.type === "vibeos:context-menu" &&
        message.channel === channel &&
        typeof message.requestId === "string"
      ) {
        const rect = frame.getBoundingClientRect();
        const point =
          message.point &&
          typeof message.point.x === "number" &&
          typeof message.point.y === "number"
            ? {
                x: Math.min(
                  window.innerWidth - 180,
                  rect.left + message.point.x,
                ),
                y: Math.min(
                  window.innerHeight - 120,
                  rect.top + message.point.y,
                ),
              }
            : { x: rect.left + 20, y: rect.top + 20 };
        setContextMenu({
          requestId: message.requestId,
          frame: event.source as Window,
          channel,
          items: Array.isArray(message.items)
            ? message.items
                .filter(
                  (
                    item: unknown,
                  ): item is {
                    id: string;
                    label: string;
                    disabled?: boolean;
                  } =>
                    !!item &&
                    typeof item === "object" &&
                    typeof (item as { id?: unknown }).id === "string" &&
                    typeof (item as { label?: unknown }).label === "string",
                )
                .slice(0, 20)
            : [],
          ...point,
        });
        return;
      }
      if (
        message.type === "vibeos:command-palette" &&
        message.channel === channel
      ) {
        setCommandText("");
        setCommandPalette({
          open: true,
          appId,
          context: message.context,
          commands: Array.isArray(message.commands) ? message.commands : [],
        });
        return;
      }
      if (
        message.type !== "vibeos:request" ||
        message.channel !== channel ||
        typeof message.requestId !== "string"
      )
        return;
      bridgeFrames.set(message.requestId, event.source as Window);
      connection.send(
        JSON.stringify({
          type: "bridge_request",
          requestId: message.requestId,
          appId,
          operation: message.operation,
        }),
      );
    };
    window.addEventListener("message", bridge);
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      window.removeEventListener("message", bridge);
      connection.close();
    };
  }, [ime]);
  useEffect(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN || queued.length === 0)
      return;
    queued.forEach((intent) => socket.send(JSON.stringify(intent)));
    setQueued([]);
  }, [socket, queued]);
  const runtimeApps = snapshot.apps.filter((app) => app.installed);
  const visibleApps = runtimeApps.filter((app) =>
    app.name.toLowerCase().includes(search.toLowerCase()),
  );
  const dispatch = (intent: RuntimeIntent) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(intent));
    else setQueued((current) => [...current, intent]);
    setLauncher(false);
  };
  const focused = snapshot.windows.find((window) => window.focused);
  const openCommandPalette = () => {
    setCommandText("");
    setCommandPalette({ open: true, appId: focused?.appId, commands: [] });
  };
  const submitCommand = async (
    command = commandText,
    context = commandPalette.context,
  ) => {
    const appId = commandPalette.appId ?? focused?.appId;
    if (!command.trim()) return;
    let visualContext = context;
    const target =
      appId && focused?.appId === appId
        ? document.querySelector<HTMLElement>(
            `.window[data-window-id="${focused.id}"]`,
          )
        : undefined;
    if (target) {
      try {
        visualContext = {
          ...(context && typeof context === "object"
            ? (context as Record<string, unknown>)
            : {}),
          __vibeosWindowScreenshot: await captureElement(target),
        };
      } catch {
        /* visual observation is optional */
      }
    }
    dispatch({
      type: "bridge_request",
      requestId: crypto.randomUUID(),
      appId: appId ?? "desktop",
      operation: {
        type: "ai.command",
        command: command.trim(),
        scope: appId ? "app" : "world",
        context: visualContext,
        output: "modify",
      },
    });
    setCommandPalette({ open: false, commands: [] });
    setCommandText("");
  };
  const submitQuestion = () => {
    if (!agentQuestion || !questionAnswer.trim()) return;
    dispatch({
      type: "answer_agent_question",
      questionId: agentQuestion.questionId,
      answer: questionAnswer.trim(),
    });
    setAgentQuestion(null);
    setQuestionAnswer("");
    setCustomAnswer(false);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (matchesShortcut(event, "ime-toggle")) {
        event.preventDefault();
        ime.toggle();
        return;
      }
      if (
        ime.snapshot().enabled &&
        ime.accepts(event.target) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const element = event.target as HTMLElement;
        const rect = element.getBoundingClientRect();
        ime.setTarget({
          kind: "local",
          element,
          anchor: { x: rect.left + 12, y: rect.bottom + 6 },
        });
        if (ime.key(event.key)) {
          event.preventDefault();
          return;
        }
      }
      if (matchesShortcut(event, "command-palette")) {
        event.preventDefault();
        openCommandPalette();
      } else if (matchesShortcut(event, "launcher")) {
        event.preventDefault();
        setLauncher(true);
      } else if (matchesShortcut(event, "screenshot")) {
        event.preventDefault();
        void captureDesktop();
      } else if (matchesShortcut(event, "close-window") && focused) {
        event.preventDefault();
        dispatch({ type: "close_window", windowId: focused.id });
      } else if (matchesShortcut(event, "minimize-window") && focused) {
        event.preventDefault();
        dispatch({ type: "minimize_window", windowId: focused.id });
      } else if (matchesShortcut(event, "maximize-window") && focused) {
        event.preventDefault();
        dispatch({ type: "maximize_window", windowId: focused.id });
      } else if (matchesShortcut(event, "escape")) {
        setLauncher(false);
        setCommandPalette({ open: false, commands: [] });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focused?.id, socket, commandPalette.appId, ime]);
  const pending =
    snapshot.operations.filter((operation) => operation.state === "pending")
      .length + queued.length;
  const iconUrl = (app: RuntimeSnapshot["apps"][number]) =>
    `${import.meta.env.VITE_VIBEOS_HTTP ?? "http://localhost:8787"}/assets/apps/${encodeURIComponent(app.id)}/icon.svg`;
  return (
    <main className="os" onContextMenu={(event) => event.preventDefault()}>
      <div className="wallpaper">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
      </div>
      <header className="topbar">
        <span className="brand">VibeOS</span>
        <span className="topbar-center">
          {snapshot.windows.find((w) => w.focused)?.title ?? "Desktop"}
        </span>
        <span className="clock">
          {new Intl.DateTimeFormat([], {
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date())}
        </span>
      </header>
      <section className="desktop">
        {snapshot.windows.length === 0 && (
          <div className="welcome">
            <div className="welcome-mark">V</div>
            <h1>Welcome home.</h1>
            <p>Everything you need, right where you left it.</p>
            <button onClick={() => setLauncher(true)}>
              Open launcher <span>⌘ K</span>
            </button>
          </div>
        )}
        {snapshot.windows.map((window) => (
          <Window
            key={`${window.id}:${refreshVersion}`}
            window={window}
            refreshVersion={refreshVersion}
            closing={closingWindows.has(window.id)}
            onClose={() => {
              setClosingWindows((current) => new Set(current).add(window.id));
              setTimeout(() => {
                dispatch({ type: "close_window", windowId: window.id });
                setClosingWindows((current) => {
                  const next = new Set(current);
                  next.delete(window.id);
                  return next;
                });
              }, 220);
            }}
            onAction={dispatch}
            snapshot={snapshot}
          />
        ))}
      </section>
      <nav className="dock">
        <button
          className="dock-item launcher-button"
          aria-label="Open app launcher"
          title="All apps (Ctrl/Cmd+Shift+Space)"
          onClick={() => setLauncher(true)}
        >
          <Search size={22} />
        </button>
        <button
          className="dock-item"
          aria-label="Take screenshot"
          title="Screenshot (Ctrl+Shift+S)"
          onClick={() => void captureDesktop()}
        >
          ▣
        </button>
        {runtimeApps.slice(0, 7).map((app) => {
          const info = appInfo[app.id];
          const Icon = info?.icon ?? Sparkles;
          const open = snapshot.windows.find((w) => w.appId === app.id);
          return (
            <button
              key={app.id}
              className={`dock-item ${open?.state === "minimized" ? "minimized-app" : ""}`}
              title={app.name}
              onClick={() => dispatch({ type: "open_app", appId: app.id })}
            >
              {app.icon.endsWith(".svg") ? (
                <img className="app-svg" src={iconUrl(app)} alt="" />
              ) : (
                <Icon size={22} color={info?.color ?? "#d5a6ff"} />
              )}{" "}
              {open && <i />}
            </button>
          );
        })}
      </nav>
      {launcher && (
        <div className="launcher-backdrop" onClick={() => setLauncher(false)}>
          <div
            className="launcher"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="searchbox">
              <Search size={20} />
              <input
                autoFocus
                placeholder="Search apps"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="app-grid">
              {visibleApps.map((app) => {
                const info = appInfo[app.id];
                const Icon = info?.icon ?? Sparkles;
                const system = [
                  "assistant",
                  "settings",
                  "shop",
                  "browser",
                ].includes(app.id);
                return (
                  <div key={app.id} className="app-tile-wrap">
                    <button
                      className="app-tile"
                      onClick={() =>
                        dispatch({ type: "open_app", appId: app.id })
                      }
                    >
                      <span
                        className="app-icon"
                        style={{ background: info?.color ?? "#c69cff" }}
                      >
                        {app.icon.endsWith(".svg") ? (
                          <img className="app-svg" src={iconUrl(app)} alt="" />
                        ) : (
                          <Icon size={24} />
                        )}
                      </span>
                      <span>{app.name}</span>
                    </button>
                    {!system && (
                      <button
                        className="app-delete"
                        aria-label={`Delete ${app.name}`}
                        onClick={() => {
                          if (confirm(`Delete ${app.name}?`))
                            dispatch({ type: "uninstall_app", appId: app.id });
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {visibleApps.length === 0 && search && (
              <div className="empty-search">
                No app installed yet for “{search}”.
              </div>
            )}
          </div>
        </div>
      )}
      {commandPalette.open && (
        <div
          className="launcher-backdrop command-backdrop"
          onClick={() => setCommandPalette({ open: false, commands: [] })}
        >
          <form
            className="command-palette"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitCommand();
            }}
          >
            <div className="searchbox">
              <Terminal size={20} />
              <input
                autoFocus
                aria-label="Command palette"
                placeholder={
                  commandPalette.appId
                    ? `Command ${snapshot.apps.find((app) => app.id === commandPalette.appId)?.name ?? ""}`
                    : "Command the VibeOS desktop"
                }
                value={commandText}
                onChange={(event) => setCommandText(event.target.value)}
              />
            </div>
            <p>
              {commandPalette.appId
                ? "Describe what you want to do in this app."
                : "Describe what you want VibeOS to change."}
            </p>
            {commandPalette.commands.map((command) => (
              <button
                type="button"
                key={command.id}
                onClick={() =>
                  submitCommand(
                    command.title,
                    command.context ?? commandPalette.context,
                  )
                }
              >
                <strong>{command.title}</strong>
                {command.detail && <small>{command.detail}</small>}
              </button>
            ))}
            <footer>
              {shortcuts
                .filter((shortcut) =>
                  [
                    "close-window",
                    "minimize-window",
                    "maximize-window",
                  ].includes(shortcut.id),
                )
                .map((shortcut) => (
                  <span key={shortcut.id}>{shortcut.keys}</span>
                ))}
            </footer>
          </form>
        </div>
      )}
      {agentQuestion && (
        <div className="launcher-backdrop question-backdrop">
          <form
            className="agent-question"
            role="dialog"
            aria-modal="true"
            aria-label={agentQuestion.question.title}
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion();
            }}
          >
            <h2>{agentQuestion.question.title}</h2>
            <p>{agentQuestion.question.message}</p>
            {agentQuestion.question.kind === "choices" ? (
              <div className="question-choices">
                {agentQuestion.question.choices.map((choice) => (
                  <button
                    type="button"
                    className={
                      questionAnswer === choice.id && !customAnswer
                        ? "selected"
                        : ""
                    }
                    key={choice.id}
                    onClick={() => {
                      setQuestionAnswer(choice.id);
                      setCustomAnswer(false);
                    }}
                  >
                    <strong>{choice.label}</strong>
                    {choice.description && <small>{choice.description}</small>}
                  </button>
                ))}
                {agentQuestion.question.allowCustom && (
                  <button
                    type="button"
                    className={customAnswer ? "selected" : ""}
                    onClick={() => {
                      setQuestionAnswer("");
                      setCustomAnswer(true);
                    }}
                  >
                    <strong>Other</strong>
                    <small>Enter a different answer.</small>
                  </button>
                )}
                {customAnswer && (
                  <input
                    autoFocus
                    aria-label="Custom answer"
                    value={questionAnswer}
                    onChange={(event) => setQuestionAnswer(event.target.value)}
                  />
                )}
              </div>
            ) : agentQuestion.question.multiline ? (
              <textarea
                autoFocus
                placeholder={agentQuestion.question.placeholder}
                value={questionAnswer}
                onChange={(event) => setQuestionAnswer(event.target.value)}
              />
            ) : (
              <input
                autoFocus
                placeholder={agentQuestion.question.placeholder}
                value={questionAnswer}
                onChange={(event) => setQuestionAnswer(event.target.value)}
              />
            )}
            <footer>
              <button type="submit" disabled={!questionAnswer.trim()}>
                Continue
              </button>
            </footer>
          </form>
        </div>
      )}
      {contextMenu && (
        <div
          className="context-menu-backdrop"
          onMouseDown={() => {
            contextMenu.frame.postMessage(
              {
                type: "vibeos:context-menu-result",
                channel: contextMenu.channel,
                requestId: contextMenu.requestId,
                id: null,
              },
              "*",
            );
            setContextMenu(null);
          }}
        >
          <div
            className="context-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {contextMenu.items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  contextMenu.frame.postMessage(
                    {
                      type: "vibeos:context-menu-result",
                      channel: contextMenu.channel,
                      requestId: contextMenu.requestId,
                      id: item.id,
                    },
                    "*",
                  );
                  setContextMenu(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {imeState.enabled && (
        <div className="ime-indicator" title="Chinese input on">
          中
        </div>
      )}
      {imeState.preedit && (
        <div
          className="ime-candidates"
          role="listbox"
          aria-label="Chinese input candidates"
          style={{
            left: imeState.anchor?.x ?? window.innerWidth / 2,
            top: imeState.anchor?.y ?? window.innerHeight / 2,
          }}
        >
          <div className="ime-preedit">
            {imeState.preedit}
            {imeState.loading && "…"}
          </div>
          {imeState.candidates.map((candidate, index) => (
            <button
              type="button"
              key={`${candidate.text}-${index}`}
              role="option"
              aria-selected={index === imeState.selected}
              className={index === imeState.selected ? "selected" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                ime.key(String(index + 1));
              }}
            >
              <kbd>{index + 1}</kbd>
              {candidate.text}
            </button>
          ))}
        </div>
      )}
      <aside className="task-bubbles" aria-live="polite">
        {Object.entries(taskBubbles).map(([id, bubble]) => (
          <section
            key={id}
            className={`task-bubble task-${bubble.status}`}
            role="status"
          >
            <strong>{bubble.title}</strong>
            <span className="task-kind">{bubble.kind}</span>
            <pre>{bubble.text}</pre>
          </section>
        ))}
      </aside>
      {!connected && (
        <div className="connection-pill">Connecting to VibeOS…</div>
      )}
      {notice && (
        <div className={`notice notice-${notice.level}`} role="status">
          <Terminal size={17} />
          {notice.message}
        </div>
      )}
    </main>
  );
}

function Window({
  window,
  refreshVersion,
  closing,
  onClose,
  onAction,
  snapshot,
}: {
  window: WindowModel;
  refreshVersion: number;
  closing: boolean;
  onClose: () => void;
  onAction: (intent: RuntimeIntent) => void;
  snapshot: RuntimeSnapshot;
}) {
  const surface = snapshot.surfaces.find(
    (item) =>
      item.appId === window.appId && item.route === (window.route ?? "/"),
  );
  const app = snapshot.apps.find((item) => item.id === window.appId);
  const dragRef = useRef<
    | {
        kind: "move" | "resize";
        pointerId: number;
        x: number;
        y: number;
        left: number;
        top: number;
        width: number;
        height: number;
      }
    | undefined
  >(undefined);
  const pendingDrag = useRef<RuntimeIntent | undefined>(undefined);
  const dragFrame = useRef<number | undefined>(undefined);
  const sendDrag = (intent: RuntimeIntent, immediate = false) => {
    pendingDrag.current = intent;
    if (immediate) {
      if (dragFrame.current !== undefined)
        cancelAnimationFrame(dragFrame.current);
      dragFrame.current = undefined;
      const next = pendingDrag.current;
      pendingDrag.current = undefined;
      if (next) onAction(next);
      return;
    }
    if (dragFrame.current !== undefined) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = undefined;
      const next = pendingDrag.current;
      pendingDrag.current = undefined;
      if (next) onAction(next);
    });
  };
  const startMove = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    const restored = window.state === "maximized";
    const offsetX = restored
      ? Math.min(
          window.size.width - 40,
          Math.max(
            40,
            (event.clientX / Math.max(1, globalThis.innerWidth)) *
              window.size.width,
          ),
        )
      : event.clientX - window.position.x;
    const left = restored ? event.clientX - offsetX : window.position.x;
    const top = restored ? Math.max(42, event.clientY - 18) : window.position.y;
    if (restored)
      onAction({
        type: "restore_and_move_window",
        windowId: window.id,
        x: left,
        y: top,
      });
    dragRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left,
      top,
      width: window.size.width,
      height: window.size.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startResize = (event: React.PointerEvent) => {
    if (window.state === "maximized") return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: window.position.x,
      top: window.position.y,
      width: window.size.width,
      height: window.size.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragIntent = (
    drag: NonNullable<typeof dragRef.current>,
    event: React.PointerEvent,
  ): RuntimeIntent =>
    drag.kind === "move"
      ? {
          type: "move_window",
          windowId: window.id,
          x: drag.left + event.clientX - drag.x,
          y: drag.top + event.clientY - drag.y,
        }
      : {
          type: "resize_window",
          windowId: window.id,
          width: drag.width + event.clientX - drag.x,
          height: drag.height + event.clientY - drag.y,
        };
  const move = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId)
      sendDrag(dragIntent(drag, event));
  };
  const stop = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      sendDrag(dragIntent(drag, event), true);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
      dragRef.current = undefined;
    }
  };
  return (
    <article
      data-window-id={window.id}
      className={`window ${window.state === "maximized" ? "maximized" : ""} ${window.state === "minimized" ? "window-minimized" : ""} ${closing ? "window-closing" : ""} ${window.focused ? "focused" : ""}`}
      style={{
        left: window.position.x,
        top: window.position.y,
        width: window.size.width,
        height: window.size.height,
      }}
      onMouseDown={() =>
        onAction({ type: "focus_window", windowId: window.id })
      }
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <div
        className="window-bar"
        onPointerDown={startMove}
        onDoubleClick={(event) => {
          if (!(event.target as HTMLElement).closest("button"))
            onAction({ type: "maximize_window", windowId: window.id });
        }}
      >
        <span className="traffic">
          <button
            className="close-control"
            aria-label="Close window"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X size={11} />
          </button>
          <button
            className="min-control"
            aria-label="Minimize window"
            onClick={(event) => {
              event.stopPropagation();
              onAction({ type: "minimize_window", windowId: window.id });
            }}
          >
            <Minus size={8} />
          </button>
          <button
            className="max-control"
            aria-label="Maximize window"
            onClick={(event) => {
              event.stopPropagation();
              onAction({ type: "maximize_window", windowId: window.id });
            }}
          >
            <Square size={8} />
          </button>
        </span>
        <span>{window.title}</span>
        <span className="window-menu">•••</span>
      </div>
      <div className="window-body">
        {app?.status === "placeholder" && !surface ? (
          <PlaceholderView app={app} />
        ) : window.appId === "assistant" ? (
          <AssistantView onAction={onAction} windowId={window.id} />
        ) : window.appId === "settings" ? (
          <SettingsView snapshot={snapshot} onAction={onAction} />
        ) : window.appId === "shop" ? (
          <ShopView onAction={onAction} apps={snapshot.apps} />
        ) : surface ? (
          <SurfaceView
            surface={surface}
            onAction={onAction}
            windowId={window.id}
          />
        ) : (
          <PlaceholderView
            app={
              app ?? {
                id: window.appId,
                name: window.title,
                description: "",
                icon: "sparkles",
                installed: true,
                status: "placeholder",
              }
            }
          />
        )}
      </div>
      <span className="resize-grip" onPointerDown={startResize} />
    </article>
  );
}
function SettingsView({
  snapshot,
  onAction,
}: {
  snapshot: RuntimeSnapshot;
  onAction: (intent: RuntimeIntent) => void;
}) {
  const model = ["luna", "terra", "sol"] as const;
  const reasoning = [
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
  ] as const;
  const effort = ["fast", "balanced", "quality", "ultra"] as const;
  const search = ["none", "online_info", "online_content"] as const;
  const visibility = ["completion", "messages", "tools", "reasoning"] as const;
  const [tab, setTab] = useState<"generation" | "appearance">("generation");
  const effortText = {
    fast: "Fastest reasonable result; minimal prompt and no repair.",
    balanced: "Complete workflow with focused primary-interaction tests.",
    quality:
      "Production-quality implementation, visual review, and interaction checks.",
    ultra: "Maximum diligence, broad testing, and repeated repair.",
  };
  const searchText = {
    none: "No Internet access; use supplied context only.",
    online_info:
      "Research current factual information; keep the page locally authored.",
    online_content:
      "Use permitted online content or repositories as building material.",
  };
  const visibilityText = {
    completion: "Show only task start and completion.",
    messages: "Also show agent messages.",
    tools: "Also show raw tool calls.",
    reasoning: "Also show model-provided reasoning summaries.",
  };
  const appearance = snapshot.settings.appearance;
  const notificationDuration = appearance.notificationDuration ?? 20;
  const updateAppearance = (
    key:
      | "mode"
      | "backgroundMode"
      | "backgroundImage"
      | "autoHideChromeOnMaximize"
      | "dockPosition"
      | "uiTypeface"
      | "monoTypeface"
      | "displayScale"
      | "notificationDuration",
    value?: string | boolean | number,
  ) => onAction({ type: "set_appearance", key, value } as RuntimeIntent);
  const durationControl = (
    <>
      <h3>Notification duration</h3>
      <input
        aria-label="Notification duration"
        type="range"
        min="10"
        max="60"
        step="1"
        value={appearance.notificationDuration ?? 20}
        onChange={(event) =>
          updateAppearance("notificationDuration", Number(event.target.value))
        }
      />
      <strong>{appearance.notificationDuration ?? 20}s</strong>
    </>
  );
  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <Settings size={20} />
          <span>Settings</span>
        </div>
        <button
          className={tab === "generation" ? "active" : ""}
          onClick={() => setTab("generation")}
        >
          Generation
        </button>
        <button
          className={tab === "appearance" ? "active" : ""}
          onClick={() => setTab("appearance")}
        >
          Appearance
        </button>
      </aside>
      <section className="settings-panel">
        {tab === "generation" ? (
          <>
            <h2>Generation</h2>
            <p>Choose how new pages and applications are prepared.</p>
            <h3>Model</h3>
            <input
              aria-label="Model"
              type="range"
              min="0"
              max="2"
              value={model.indexOf(snapshot.settings.model)}
              onChange={(e) =>
                onAction({
                  type: "set_setting",
                  key: "model",
                  value: model[Number(e.target.value)],
                })
              }
            />
            <div className="range-labels">
              {model.map((x) => (
                <span key={x}>gpt-5.6-{x}</span>
              ))}
            </div>
            <strong>gpt-5.6-{snapshot.settings.model}</strong>
            <label className="setting-toggle">
              <input
                aria-label="Use gh model prefix"
                type="checkbox"
                checked={snapshot.settings.useGhPrefix}
                onChange={(event) =>
                  onAction({
                    type: "set_setting",
                    key: "useGhPrefix",
                    value: event.target.checked,
                  })
                }
              />{" "}
              Use <code>gh/</code> model prefix
            </label>
            <h3>Reasoning</h3>
            <input
              aria-label="Reasoning"
              type="range"
              min="0"
              max="6"
              value={reasoning.indexOf(snapshot.settings.reasoning)}
              onChange={(e) =>
                onAction({
                  type: "set_setting",
                  key: "reasoning",
                  value: reasoning[Number(e.target.value)],
                })
              }
            />
            <div className="range-labels">
              {reasoning.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
            <strong>{snapshot.settings.reasoning}</strong>
            <h3>Effort level</h3>
            <input
              aria-label="Effort level"
              type="range"
              min="0"
              max="3"
              step="1"
              value={effort.indexOf(snapshot.settings.effort)}
              onChange={(e) =>
                onAction({
                  type: "set_setting",
                  key: "effort",
                  value: effort[Number(e.target.value)],
                })
              }
            />
            <div className="range-labels">
              {effort.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
            <strong>{snapshot.settings.effort}</strong>
            <small>{effortText[snapshot.settings.effort]}</small>
            <h3>Search level</h3>
            <input
              aria-label="Search level"
              type="range"
              min="0"
              max="2"
              step="1"
              value={search.indexOf(snapshot.settings.search)}
              onChange={(e) =>
                onAction({
                  type: "set_setting",
                  key: "search",
                  value: search[Number(e.target.value)],
                })
              }
            />
            <div className="range-labels">
              {search.map((x) => (
                <span key={x}>{x.replace("_", " ")}</span>
              ))}
            </div>
            <strong>{snapshot.settings.search.replace("_", " ")}</strong>
            <small>{searchText[snapshot.settings.search]}</small>
            <h3>Generation visibility</h3>
            <input
              aria-label="Generation visibility"
              type="range"
              min="0"
              max="3"
              step="1"
              value={visibility.indexOf(snapshot.settings.generationVisibility)}
              onChange={(e) =>
                onAction({
                  type: "set_setting",
                  key: "generationVisibility",
                  value: visibility[Number(e.target.value)],
                })
              }
            />
            <div className="range-labels">
              {visibility.map((x) => (
                <span key={x}>
                  {x === "completion" ? "completion only" : `+ ${x}`}
                </span>
              ))}
            </div>
            <strong>
              {snapshot.settings.generationVisibility === "completion"
                ? "Completion only"
                : `+ ${snapshot.settings.generationVisibility}`}
            </strong>
            <small>
              {visibilityText[snapshot.settings.generationVisibility]}
            </small>
          </>
        ) : (
          <>
            <h2>Appearance</h2>
            <p>Personalize the look of your desktop.</p>
            <h3>Text &amp; scale</h3>
            <select
              aria-label="Interface font"
              value={appearance.uiTypeface}
              onChange={(event) =>
                updateAppearance("uiTypeface", event.target.value)
              }
            >
              <option value="modern">Modern</option>
              <option value="system">System</option>
              <option value="accessible">Accessible</option>
            </select>
            <select
              aria-label="Code font"
              value={appearance.monoTypeface}
              onChange={(event) =>
                updateAppearance("monoTypeface", event.target.value)
              }
            >
              <option value="modern">Modern mono</option>
              <option value="system">System mono</option>
              <option value="accessible">Accessible mono</option>
            </select>
            <select
              aria-label="Display scale"
              value={appearance.displayScale}
              onChange={(event) =>
                updateAppearance("displayScale", event.target.value)
              }
            >
              <option value="compact">80%</option>
              <option value="default">100%</option>
              <option value="comfortable">110%</option>
              <option value="large">125%</option>
              <option value="extra_large">150%</option>
            </select>
            <h3>Theme</h3>
            <div className="setting-options">
              <button
                className={appearance.mode === "dark" ? "selected" : ""}
                onClick={() => updateAppearance("mode", "dark")}
              >
                Dark
              </button>
              <button
                className={appearance.mode === "light" ? "selected" : ""}
                onClick={() => updateAppearance("mode", "light")}
              >
                Light
              </button>
              <button
                className={appearance.mode === "desert" ? "selected" : ""}
                onClick={() => updateAppearance("mode", "desert")}
              >
                Desert
              </button>
            </div>
            <h3>Background image</h3>
            <label className="file-picker">
              {appearance.backgroundImage ? "Change image" : "Choose image"}
              <input
                aria-label="Background image"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) {
                    alert("Please choose an image smaller than 10 MB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () =>
                    updateAppearance("backgroundImage", String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {appearance.backgroundImage && (
              <button
                className="clear-background"
                onClick={() => updateAppearance("backgroundImage")}
              >
                Clear image
              </button>
            )}
            <h3>Background mode</h3>
            <select
              aria-label="Background mode"
              value={appearance.backgroundMode}
              onChange={(event) =>
                updateAppearance(
                  "backgroundMode",
                  event.target.value as BackgroundMode,
                )
              }
            >
              <option value="stretch">Stretch</option>
              <option value="fill">Fill</option>
              <option value="pad">Pad</option>
            </select>
            {durationControl}
            <label className="setting-toggle">
              <input
                aria-label="Auto-hide system bars when maximized"
                type="checkbox"
                checked={appearance.autoHideChromeOnMaximize}
                onChange={(event) =>
                  updateAppearance(
                    "autoHideChromeOnMaximize",
                    event.target.checked,
                  )
                }
              />{" "}
              Auto-hide top bar and dock when maximized
            </label>
            <h3>Dock position</h3>
            <div className="setting-options">
              <button
                className={
                  appearance.dockPosition === "bottom" ? "selected" : ""
                }
                onClick={() => updateAppearance("dockPosition", "bottom")}
              >
                Bottom
              </button>
              <button
                className={appearance.dockPosition === "left" ? "selected" : ""}
                onClick={() => updateAppearance("dockPosition", "left")}
              >
                Left
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
function AssistantView({
  onAction,
  windowId,
}: {
  onAction: (intent: RuntimeIntent) => void;
  windowId: string;
}) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState("");
  return (
    <div className="assistant settings">
      <MessageCircle size={34} />
      <h2>Assistant</h2>
      <p>Describe what feels wrong. VibeOS will repair the affected world.</p>
      <textarea
        aria-label="Describe a problem"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Tell Assistant what to fix…"
      />
      <button
        onClick={() => {
          if (!message.trim()) return;
          setSent(message.trim());
          onAction({
            type: "assistant_request",
            message: message.trim(),
            context: { windowId },
          });
          setMessage("");
        }}
      >
        Ask Assistant
      </button>
      {sent && <small>Working on: {sent}</small>}
    </div>
  );
}
function CalculatorView() {
  const [display, setDisplay] = useState("0");
  const [left, setLeft] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const press = (key: string) => {
    if (/^\d$/.test(key) || key === ".") {
      setDisplay(display === "0" && key !== "." ? key : display + key);
      return;
    }
    if (key === "C") {
      setDisplay("0");
      setLeft(null);
      setOperator(null);
      return;
    }
    if (key === "=") {
      if (left !== null && operator) {
        const right = Number(display);
        const value =
          operator === "+"
            ? left + right
            : operator === "−"
              ? left - right
              : operator === "×"
                ? left * right
                : right === 0
                  ? NaN
                  : left / right;
        setDisplay(String(value));
        setLeft(null);
        setOperator(null);
      }
      return;
    }
    setLeft(Number(display));
    setOperator(key);
    setDisplay("0");
  };
  return (
    <div className="calculator">
      <div className="calc-display">{display}</div>
      <div className="calc-keys">
        {[
          "C",
          "7",
          "8",
          "9",
          "÷",
          "4",
          "5",
          "6",
          "×",
          "1",
          "2",
          "3",
          "−",
          "0",
          ".",
          "=",
          "+",
        ].map((key) => (
          <button key={key} onClick={() => press(key)}>
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
function EditorView({ onAction }: { onAction: (intent: Intent) => void }) {
  return (
    <div className="editor">
      <div className="editor-toolbar">
        <span>Untitled.txt</span>
        <button
          onClick={() =>
            onAction({
              type: "open_surface",
              appId: "app-editor",
              route: "/save",
            })
          }
        >
          Save
        </button>
      </div>
      <textarea placeholder="Start writing..." />
    </div>
  );
}
function FilesView({ onAction }: { onAction: (intent: Intent) => void }) {
  return (
    <div className="files">
      <aside>
        <strong>Locations</strong>
        <button>⌂ Home</button>
        <button>▣ Documents</button>
        <button>↓ Downloads</button>
      </aside>
      <div className="file-content">
        <div className="file-heading">
          <h2>Home</h2>
          <button
            onClick={() => onAction({ type: "open_app", appId: "app-editor" })}
          >
            New file
          </button>
        </div>
        <div className="file-row">
          <FileText size={20} color="#ee8fb7" />
          <span>Welcome.txt</span>
          <small>Just now</small>
        </div>
      </div>
    </div>
  );
}
function ShopView({
  onAction,
  apps,
}: {
  onAction: (intent: RuntimeIntent) => void;
  apps: RuntimeSnapshot["apps"];
}) {
  const [query, setQuery] = useState("");
  const installed = apps.filter(
    (app) =>
      app.id !== "shop" && app.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="shop-view">
      <header>
        <Store size={28} />
        <div>
          <h2>App Shop</h2>
          <p>Find or create an application.</p>
        </div>
      </header>
      <div className="shop-search">
        <input
          className="shop-input"
          aria-label="Search apps"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search apps"
        />
        <button
          onClick={() =>
            query.trim() &&
            onAction({
              type: "install_app",
              app: {
                id: `app-${query.toLowerCase().replace(/\W+/g, "-")}`,
                name: query.trim(),
                description: `Imagine and explore ${query}`,
                icon: "sparkles",
              },
            })
          }
        >
          Install
        </button>
      </div>
      <section className="shop-results" aria-label="Installed apps">
        {installed.map((app) => (
          <p key={app.id}>
            <strong>{app.name}</strong>
            <span>{app.status}</span>
          </p>
        ))}
        {installed.length === 0 && (
          <p className="shop-empty">No matching installed apps.</p>
        )}
      </section>
    </div>
  );
}
function SurfaceView({
  surface,
  onAction,
  windowId,
}: {
  surface: RuntimeSnapshot["surfaces"][number];
  onAction: (intent: RuntimeIntent) => void;
  windowId: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const channel = useMemo(() => crypto.randomUUID(), [surface.id]);
  if (surface.status !== "ready")
    return (
      <div className="browser-empty">
        <span className="spinner" />
        <h2>Loading {surface.title}…</h2>
      </div>
    );
  if (surface.entry)
    return (
      <iframe
        key={surface.id}
        className="generated-entry"
        data-app-id={surface.appId}
        data-bridge-channel={channel}
        sandbox="allow-scripts allow-downloads allow-forms"
        title={surface.title}
        onPointerDown={() => onAction({ type: "focus_window", windowId })}
        onLoad={(event) =>
          event.currentTarget.contentWindow?.postMessage(
            {
              type: "vibeos:init",
              channel,
              theme: document.documentElement.dataset.theme ?? "dark",
            },
            "*",
          )
        }
        src={`${import.meta.env.VITE_VIBEOS_HTTP ?? "http://localhost:8787"}/generated/apps/${encodeURIComponent(surface.appId)}/${surface.entry.replace(/^\/+/, "")}`}
      />
    );
  const board = surface.content.board;
  const act = (action: RuntimeIntent) => {
    if (action.type === "run_action")
      return onAction({
        ...action,
        input: { ...values, ...(action.input ?? {}) },
      });
    if (action.type === "navigate_browser" && action.url === "{search}")
      return onAction({ ...action, url: values.search ?? "" });
    return onAction(action);
  };
  const submitField = (fieldId: string, submittedValue?: string) => {
    const value = submittedValue ?? values[fieldId] ?? "";
    if (value.trim())
      onAction({
        type: "navigate_browser",
        appId: surface.appId,
        url: value.trim(),
      });
  };
  return (
    <div className="surface-view">
      <div className="surface-copy">
        <h2>{surface.content.heading}</h2>
        <p>{surface.content.body}</p>
      </div>
      {board && (
        <div className="board-card">
          <div
            className="board-grid"
            style={{
              gridTemplateColumns: `repeat(${board.columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: board.columns * board.rows }, (_, index) => (
              <span
                key={index}
                className={index < (board.activePiece ? 4 : 0) ? "filled" : ""}
              />
            ))}
          </div>
          <aside>
            <strong>Score {board.score ?? 0}</strong>
            <span>Lines {board.lines ?? 0}</span>
            <span>Level {board.level ?? 1}</span>
            <small>Next: {board.nextPiece ?? "—"}</small>
          </aside>
        </div>
      )}
      {surface.content.fields?.map((field) => (
        <label key={field.id} className="surface-field">
          {field.label}
          <input
            className={
              /address|website/i.test(field.label) ? "address" : undefined
            }
            type={field.type ?? "text"}
            aria-label={field.label}
            placeholder={field.placeholder}
            defaultValue={field.value}
            onKeyDown={(event) => {
              if (event.key === "Enter")
                submitField(field.id, event.currentTarget.value);
            }}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.id]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      <div className="surface-actions">
        {surface.content.controls.map((control) => (
          <button key={control.id} onClick={() => act(control.action)}>
            {control.label}
          </button>
        ))}
        {(surface.content.links ?? []).map((link) => (
          <button
            key={link.id}
            onClick={() =>
              act({
                type: "open_surface",
                appId: surface.appId,
                route: link.route,
              })
            }
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>
  );
}
function PlaceholderView({ app }: { app: RuntimeSnapshot["apps"][number] }) {
  return (
    <div className="browser-empty">
      <h2>{app.name}</h2>
      <p>Loading application…</p>
    </div>
  );
}
function reduce(
  snapshot: RuntimeSnapshot,
  event: RuntimeEvent,
): RuntimeSnapshot {
  if (event.type === "snapshot") return event.snapshot;
  if (event.type === "world_changed") return snapshot;
  if (event.type === "window")
    return {
      ...snapshot,
      windows: [
        ...snapshot.windows.filter((w) => w.id !== event.window.id),
        event.window,
      ],
    };
  if (event.type === "surface")
    return {
      ...snapshot,
      surfaces: [
        ...snapshot.surfaces.filter((s) => s.id !== event.surface.id),
        event.surface,
      ],
    };
  if (event.type === "operation")
    return {
      ...snapshot,
      operations: [
        ...snapshot.operations.filter((o) => o.id !== event.operation.id),
        event.operation,
      ],
    };
  return snapshot;
}

createRoot(document.getElementById("root")!).render(<App />);
