/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { Board, type Snapshot, type Row } from "./rpc.js"
import { age, amount, bar, resetLabel, summary } from "./format.js"

export default Plugin.define({
  id: "opencode-quota-board.tui",
  setup(ctx) {
    const rpc = ctx.client.rpc(Board)
    const [snapshot, setSnapshot] = createSignal<Snapshot>({ rows: [], refreshing: true })
    const [problem, setProblem] = createSignal("")
    const [now, setNow] = createSignal(Date.now())
    const [prefs, updatePrefs] = ctx.storage.store("preferences", {
      initial: { closedProviders: [] as string[], hiddenProviders: [] as string[], pinned: [] as string[], showUnavailable: false, collapsed: false },
    })
    let disposed = false
    let busy = false
    const location = () => ctx.location ?? ctx.data.location.default()
    const selected = () => ctx.ui.model.current()?.providerID
    const ordered = () => [...snapshot().rows].sort((a, b) => {
      const rank = (row: Row) => row.providerIDs.includes(selected() ?? "") ? 0 : prefs.pinned.includes(row.id) ? 1 : 2
      return rank(a) - rank(b) || a.name.localeCompare(b.name)
    })
    const active = () => ordered().find(row => row.providerIDs.includes(selected() ?? ""))
    const muted = () => ctx.theme.text.muted
    const save = (mutation: Parameters<typeof updatePrefs>[0]) => { void updatePrefs(mutation).catch(() => ctx.ui.toast.show({ message: "Could not save quota preferences", variant: "error" })) }
    const toggle = (key: "closedProviders" | "hiddenProviders" | "pinned", id: string) => save(d => { const values = d[key] ?? []; d[key] = values.includes(id) ? values.filter(x => x !== id) : [...values, id] })
    const hidden = (id: string) => (prefs.hiddenProviders ?? []).includes(id)
    const closed = (id: string) => (prefs.closedProviders ?? []).includes(id)
    const sidebarRows = () => ordered().filter(r => !hidden(r.id) && (prefs.showUnavailable || r.status !== "unsupported"))
    const manageVisibility = async () => {
      const id = await ctx.ui.dialog.select({
        title: "Sidebar providers · select to show/hide",
        options: ordered().map(row => ({ title: `${hidden(row.id) ? "○" : "●"} ${row.name}`, value: row.id, description: hidden(row.id) ? "Hidden — select to show" : "Visible — select to hide" })),
      })
      if (id) toggle("hiddenProviders", id)
    }
    const accept = (value: Snapshot) => { if (!disposed) { setSnapshot(value); setProblem("") } }
    const sync = async (manual = false, id?: string) => {
      if (busy || disposed) return
      busy = true
      try {
        const options = { location: location() }
        accept(manual ? await rpc.refresh({ id }, options) : await rpc.snapshot({}, options))
      } catch {
        if (!disposed) setProblem("Quota service unavailable. Enable the server plugin in opencode.json and retry.")
      } finally { busy = false }
    }
    const stopUpdates = rpc.events.on("updated", event => {
      if (event.location.directory === location()?.directory) accept(event.data)
    })
    const stopReconnect = ctx.data.on("server.connected", () => { void sync() })
    const timer = setInterval(() => { setNow(Date.now()); void sync() }, 30_000)
    void sync()

    const Quotas = (props: { row: Row; compact?: boolean }) => <box flexDirection="column" paddingLeft={2}>
      <For each={props.row.quotas}>{q => <box flexDirection="column">
        <Show when={q.kind === "percentage"} fallback={<text fg={muted()}>{q.label}: <span style={{ fg: ctx.theme.text.base }}>{amount(q)} left</span></text>}>
          <text fg={muted()}>{`${q.label}${q.resetsAt ? ` · ${resetLabel(q.resetsAt, now())}` : ""}`}</text>
          <text fg={ctx.theme.text.feedback[q.remaining <= 20 ? "error" : q.remaining <= 50 ? "warning" : "success"].base}>{`${bar(q.remaining, props.compact ? 12 : 24)} ${amount(q)} left`}</text>
        </Show>
      </box>}</For>
      <Show when={props.row.status === "loading"}><text fg={muted()}>Loading…</text></Show>
      <Show when={props.row.detail}><text fg={muted()}>{props.compact && !props.row.quotas.length ? "Unavailable" : props.row.detail}</text></Show>
      <Show when={!props.compact || props.row.status === "stale"}><text fg={muted()}>{props.row.status === "stale" ? "STALE · " : ""}{age(props.row.updatedAt, now())}</text></Show>
    </box>

    const Sidebar = () => <box flexDirection="column" marginTop={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={ctx.theme.text.base} onMouseDown={() => save(d => { d.collapsed = !d.collapsed })}><b>{prefs.collapsed ? "▸" : "▾"} Quota Board</b></text>
        <text fg={muted()} onMouseUp={event => { event.stopPropagation(); void manageVisibility() }}>…</text>
      </box>
      <Show when={!prefs.collapsed}>
        <Show when={problem() || snapshot().error}><text paddingLeft={2} fg={muted()}>{problem() || snapshot().error}</text></Show>
        <For each={sidebarRows()}>{row => <box flexDirection="column" paddingLeft={2}>
          <text fg={ctx.theme.text.base} onMouseUp={event => { event.stopPropagation(); toggle("closedProviders", row.id) }}>
            <span style={{ fg: row.status === "ready" ? ctx.theme.text.feedback.success.base : row.status === "stale" ? ctx.theme.text.feedback.warning.base : row.status === "error" ? ctx.theme.text.feedback.error.base : muted() }}>●</span>
            {` ${row.name} `}<span style={{ fg: muted() }}>{closed(row.id) ? "▸" : "▾"}</span>
            <Show when={closed(row.id)}><span style={{ fg: muted() }}>{` ${summary(row, true, now())}`}</span></Show>
          </text>
          <Show when={!closed(row.id)}><Quotas row={row} compact /></Show>
        </box>}</For>
        <Show when={!snapshot().rows.length}><text paddingLeft={2} fg={muted()}>{snapshot().refreshing ? "Loading accounts…" : "No connected provider accounts"}</text></Show>
      </Show>
    </box>
    const QuotaModal = () => {
      const dimensions = useTerminalDimensions()
      const theme = ctx.theme.surface("dialog")
      const rows = () => ordered().filter(r => prefs.showUnavailable || r.status !== "unsupported")
      const color = (percent: number) => theme.text.feedback[percent <= 20 ? "error" : percent <= 50 ? "warning" : "success"].base
      const label = (value: string) => ({ "1w": "Weekly", "5h": "5-hour window", weekly: "Weekly", monthly: "Monthly", credits: "Available credits" }[value] ?? value)
      const Meter = (props: { remaining: number }) => {
        return <box height={1} flexDirection="row">
          <box width={`${Math.max(0, Math.min(100, props.remaining))}%`} minWidth={0} height={1} overflow="hidden" flexShrink={0}>
            <text width="100%" fg={color(props.remaining)} wrapMode="none">{"━".repeat(200)}</text>
          </box>
          <box width={`${100 - Math.max(0, Math.min(100, props.remaining))}%`} minWidth={0} height={1} overflow="hidden" flexShrink={0}>
            <text width="100%" fg={theme.text.muted} wrapMode="none">{"─".repeat(200)}</text>
          </box>
        </box>
      }
      ctx.keymap.layer(() => ({ mode: "global", commands: [
        { bind: "escape", run: () => ctx.ui.dialog.clear() },
        { bind: "r", run: () => sync(true) },
        { bind: "u", run: () => save(d => { d.showUnavailable = !d.showUnavailable }) },
      ] }))
      return <box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text.base}><b>Quota Board</b></text>
          <text fg={theme.text.muted} onMouseUp={event => { event.stopPropagation(); ctx.ui.dialog.clear() }}>{"esc  ×"}</text>
        </box>
        <text fg={theme.text.muted}>{snapshot().refreshing ? "Refreshing provider allowances…" : `${snapshot().rows.length} connected accounts · live provider allowances`}</text>
        <Show when={problem() || snapshot().error}><text fg={theme.text.feedback.warning.base}>{problem() || snapshot().error}</text></Show>
        <scrollbox height={Math.min(Math.max(3, rows().reduce((height, row) => height + 8 + row.quotas.length * 3, 0)), Math.max(4, dimensions().height - 12))}>
          <For each={rows()}>{row => <box flexDirection="column" border borderStyle="rounded" borderColor={theme.border.base} paddingX={1} marginBottom={1} flexShrink={0}>
            <box flexDirection="row" justifyContent="space-between" gap={1}>
              <text fg={theme.text.base}><b>{row.name}</b></text>
              <text fg={row.status === "stale" ? theme.text.feedback.warning.base : theme.text.muted}>{row.status === "stale" ? "STALE" : row.providerIDs.includes(selected() ?? "") ? "CURRENT" : ""}</text>
            </box>
            <text fg={theme.text.muted}>{row.account || "Active connection"}</text>
            <box flexDirection="column" marginTop={1} gap={1}>
              <For each={row.quotas}>{quota => <box flexDirection="column">
                <box flexDirection="row" justifyContent="space-between" gap={1}>
                  <text fg={theme.text.base}>{label(quota.label)}</text>
                  <text fg={quota.kind === "percentage" ? color(quota.remaining) : theme.text.feedback.success.base}><b>{quota.kind === "percentage" ? `${amount(quota)} left` : amount(quota)}</b></text>
                </box>
                <Show when={quota.kind === "percentage"}><Meter remaining={quota.remaining} /></Show>
                <Show when={quota.resetsAt}><text fg={theme.text.muted}>{resetLabel(quota.resetsAt, now())}</text></Show>
              </box>}</For>
              <Show when={row.status === "loading"}><text fg={theme.text.muted}>Fetching allowances…</text></Show>
              <Show when={row.detail}><text fg={theme.text.feedback.warning.base}>{row.detail}</text></Show>
            </box>
            <text fg={theme.text.muted} marginTop={1}>{age(row.updatedAt, now())}</text>
            <box flexDirection="row" gap={2} flexWrap="wrap">
              <text fg={theme.text.muted} onMouseUp={() => toggle("hiddenProviders", row.id)}>{hidden(row.id) ? "○ Hidden from sidebar" : "● Shown in sidebar"}</text>
              <text fg={theme.text.muted} onMouseUp={() => toggle("pinned", row.id)}>{prefs.pinned.includes(row.id) ? "◆ Pinned" : "◇ Pin"}</text>
              <text fg={theme.text.muted} onMouseUp={() => void sync(true, row.id)}>↻ Refresh</text>
            </box>
          </box>}</For>
          <Show when={!rows().length}><text fg={theme.text.muted}>{snapshot().rows.length ? "No visible accounts. Press u to show unavailable providers." : "Connect a provider to see its allowance here."}</text></Show>
        </scrollbox>
        <box flexDirection="row" gap={3} flexWrap="wrap">
          <text fg={theme.text.base} onMouseUp={() => void sync(true)}>{"r  Refresh all"}</text>
          <text fg={theme.text.muted} onMouseUp={() => save(d => { d.showUnavailable = !d.showUnavailable })}>{`u  ${prefs.showUnavailable ? "Hide" : "Show"} unavailable`}</text>
        </box>
      </box>
    }
    function open() {
      ctx.ui.dialog.set({ size: "large", centered: true })
      ctx.ui.dialog.show(QuotaModal)
      void sync()
    }
    ctx.keymap.layer(() => ({ mode: "global", commands: [
      { id: "opencode-quota-board.open", title: "Open Quota Board", group: "Quota Board", palette: true, slash: { name: "quota" }, run: open },
      { id: "opencode-quota-board.refresh", title: "Refresh provider quotas", group: "Quota Board", palette: true, run: () => sync(true) },
      { id: "opencode-quota-board.visibility", title: "Show/hide sidebar providers", group: "Quota Board", palette: true, run: manageVisibility },
    ] }))
    const stopSidebar = ctx.ui.slot({ append: "sidebar.content", render: Sidebar })
    const stopFooter = ctx.ui.slot({ append: "prompt.footer.status", render: () => <Show when={active()}>{row => <text fg={muted()} onMouseUp={event => { event.stopPropagation(); open() }}>{`${row().name} · ${summary(row())}${row().status === "stale" ? " · stale" : ""}`}</text>}</Show> })
    return () => { disposed = true; clearInterval(timer); stopUpdates(); stopReconnect(); stopSidebar(); stopFooter() }
  },
})
