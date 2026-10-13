/** @jsxImportSource @opentui/solid */
import assert from "node:assert/strict"
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import type { ResolvedTheme } from "@opencode/theme/tui"
import { createRoot, createSignal, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import plugin from "../src/tui.js"

// Exercise the real OpenTUI components with a deterministic host and RPC fixture.
const fixture = { rows: [{ id: "test", name: "OpenAI", account: "Personal", providerIDs: ["openai"], status: "ready", updatedAt: Date.now(), quotas: [
  { kind: "percentage", label: "5h", remaining: 63 },
  { kind: "percentage", label: "weekly", remaining: 28, resetsAt: Date.now() + (6 * 24 + 8) * 60 * 60 * 1000 },
] }, { id: "console", name: "OpenCode Console", account: "Default", providerIDs: ["opencode"], status: "ready", updatedAt: Date.now(), quotas: [
  { kind: "credit", label: "credits", remaining: 49.61, currency: "USD" },
] }], refreshing: false }
const slots = new Map<string, any>()
const commands = new Map<string, any>()
const commandModes = new Map<string, string>()
let dialogOptions: any
let updated: any
let cleanup: any
let stopRoot!: () => void
let dialogOpened = 0
const [modal, setModal] = createSignal<(() => any) | undefined>()
// Use the SDK's actual theme type. A made-up `theme.status` previously hid a runtime crash.
const textTheme: Pick<ResolvedTheme["text"], "base" | "muted" | "feedback"> = {
  base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#888888"),
  feedback: {
    success: { base: RGBA.fromHex("#00cc88"), muted: RGBA.fromHex("#00cc88") },
    warning: { base: RGBA.fromHex("#ffcc00"), muted: RGBA.fromHex("#ffcc00") },
    error: { base: RGBA.fromHex("#ff4444"), muted: RGBA.fromHex("#ff4444") },
    info: { base: RGBA.fromHex("#4488ff"), muted: RGBA.fromHex("#4488ff") },
  },
}
const host: any = {
  options: {}, location: { directory: "D:/fixture" },
  client: { rpc: () => ({ snapshot: async () => fixture, refresh: async () => fixture, events: { on: (_: string, cb: any) => { updated = cb; return () => {} } } }) },
  data: { on: () => () => {}, location: { default: () => ({ directory: "D:/fixture" }) } },
  theme: { text: textTheme, surface: () => ({ text: textTheme, border: { base: RGBA.fromHex("#555555") } }) },
  // Simulate existing persisted preferences, before the visibility controls existed.
  storage: { store: () => { const [state, set] = createStore({ expanded: [], pinned: [], showUnavailable: false, collapsed: false }); return [state, async (fn: any) => set(produce(fn))] } },
  keymap: { layer: (factory: any) => { const layer = factory(); for (const c of layer.commands) { commands.set(c.id ?? c.bind, c); commandModes.set(c.id ?? c.bind, layer.mode ?? "base") } } },
  ui: {
    toast: { show() {} }, dialog: {
      select: async () => { dialogOpened++; return "test" },
      set: (options: any) => { dialogOptions = options },
      show: (render: () => any) => setModal(() => render),
      clear: () => setModal(undefined),
    }, model: { current: () => ({ providerID: "openai" }) },
    slot: (claim: any) => { slots.set(claim.append, claim.render); return () => {} },
    router: { navigate: () => assert.fail("Quota must not navigate away from the conversation"), register: () => assert.fail("Quota must not register a page") },
  },
}
createRoot(dispose => { stopRoot = dispose; cleanup = plugin.setup!(host) })
await Promise.resolve()
const ui = await testRender(() => <box flexDirection="column"><Show when={modal()} fallback={slots.get("sidebar.content")()}>{render => render()()}</Show></box>, { width: 34, height: 30 })
async function clickText(text: string) {
  const lines = ui.captureCharFrame().split("\n")
  const y = lines.findIndex(line => line.includes(text))
  assert.ok(y >= 0, `Missing clickable text: ${text}`)
  await ui.mockMouse.click(lines[y].indexOf(text), y)
  await ui.renderOnce()
}
try {
  await ui.renderOnce()
  assert.match(ui.captureCharFrame(), /Quota Board/)
  assert.match(ui.captureCharFrame(), /█+░+ 28% left/)
  assert.doesNotMatch(ui.captureCharFrame(), /open dashboard|updated just now/)
  await clickText("OpenAI")
  assert.doesNotMatch(ui.captureCharFrame(), /█/)
  assert.match(ui.captureCharFrame(), /OpenAI ▸ 28% · 6d 8h/)
  await clickText("OpenAI")
  assert.match(ui.captureCharFrame(), /█+░+ 28% left/)
  await clickText("Quota Board")
  assert.doesNotMatch(ui.captureCharFrame(), /OpenAI|█/)
  await clickText("Quota Board")
  const lines = ui.captureCharFrame().split("\n")
  const menuY = lines.findIndex(line => line.includes("…"))
  const menuX = lines[menuY].indexOf("…")
  await ui.mockMouse.pressDown(menuX, menuY)
  assert.equal(dialogOpened, 0, "Opening on press would let the release dismiss the new dialog")
  await ui.mockMouse.release(menuX, menuY)
  assert.equal(dialogOpened, 1, "The provider menu opens once the click is released")
  await ui.renderOnce()
  assert.doesNotMatch(ui.captureCharFrame(), /OpenAI/)
  await commands.get("opencode-quota-board.visibility").run()
  await ui.renderOnce()
  assert.match(ui.captureCharFrame(), /OpenAI/)
  // V2 only exposes global layers in prompt mode; base-mode commands disappear.
  assert.equal(commandModes.get("opencode-quota-board.open"), "global")
  assert.equal(commands.get("opencode-quota-board.open").slash.name, "quota")
  ui.resize(80, 40)
  commands.get("opencode-quota-board.open").run()
  assert.deepEqual(dialogOptions, { size: "large", centered: true })
  await ui.renderOnce()
  assert.match(ui.captureCharFrame(), /Personal/)
  assert.match(ui.captureCharFrame(), /63% left/)
  assert.match(ui.captureCharFrame(), /28% left/)
  assert.match(ui.captureCharFrame(), /Available credits\s+\$49\.61/)
  assert.match(ui.captureCharFrame(), /r  Refresh all/)
  assert.match(ui.captureCharFrame(), /u  Show unavailable/)
  const meterLines = ui.captureCharFrame().split("\n").filter(line => line.includes("━"))
  assert.ok(meterLines.length >= 2)
  assert.ok(meterLines.every(line => line.trim().startsWith("│") && line.trim().endsWith("│")), "Meters must stay inside their card borders")
  assert.doesNotMatch(ui.captureCharFrame(), /rurefresh|esc back|\[Refresh\]/)
  if (process.env.QUOTA_TEST_FRAME) console.log(ui.captureCharFrame())
  await clickText("Shown in sidebar")
  assert.match(ui.captureCharFrame(), /Hidden from sidebar/)
  ui.resize(42, 24)
  await ui.renderOnce()
  assert.match(ui.captureCharFrame(), /Quota Board/)
  assert.match(ui.captureCharFrame(), /Refresh all/)
  ui.resize(80, 40)
  updated({ location: host.location, data: { ...fixture, rows: [{ ...fixture.rows[0], quotas: [{ kind: "percentage", label: "weekly", remaining: 10 }] }] } })
  await ui.renderOnce()
  assert.match(ui.captureCharFrame(), /10% left/)
  updated({ location: host.location, data: { ...fixture, rows: [{ ...fixture.rows[0], status: "stale", detail: "usage request timed out" }] } })
  await ui.renderOnce()
  assert.match(ui.captureCharFrame(), /STALE/)
  assert.match(ui.captureCharFrame(), /28% left/)
  commands.get("escape").run()
  await ui.renderOnce()
  assert.equal(modal(), undefined)
  assert.doesNotMatch(ui.captureCharFrame(), /OpenAI/)
  console.log("PASS: sidebar interactions, centered modal, credit/percentage cards, hide/show, narrow layout, stale updates, and Escape close")
} finally { ui.renderer.destroy(); (await cleanup)?.(); stopRoot() }
