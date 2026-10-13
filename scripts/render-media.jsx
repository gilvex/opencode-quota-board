/** @jsxImportSource @opentui/solid */
// Capture the real plugin components in an OpenTUI host with deterministic sample data.
// Run with `pnpm docs:media`. No provider connections or credentials are used.
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { createCanvas, GlobalFonts } from "@napi-rs/canvas"
import { GIFEncoder, quantize, applyPalette } from "gifenc"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createRoot, createSignal, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import plugin from "../src/tui.tsx"

const output = fileURLToPath(new URL("../docs/media/", import.meta.url))
await mkdir(output, { recursive: true })
const font = [process.env.QUOTA_DOCS_FONT, "C:/Windows/Fonts/CascadiaMono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/System/Library/Fonts/Menlo.ttc"].find(path => path && existsSync(path))
assert.ok(font, "Set QUOTA_DOCS_FONT to a monospace TTF font path")
GlobalFonts.registerFromPath(font, "QuotaMono")
if (existsSync("C:/Windows/Fonts/seguisym.ttf")) GlobalFonts.registerFromPath("C:/Windows/Fonts/seguisym.ttf", "QuotaSymbols")

const originalNow = Date.now
const now = Date.UTC(2030, 0, 1, 12)
Date.now = () => now
const sample = { refreshing: false, rows: [
  { id: "openai", name: "OpenAI", account: "Personal", providerIDs: ["openai"], status: "ready", updatedAt: now, quotas: [
    { kind: "percentage", label: "1w", remaining: 98, resetsAt: now + (6 * 24 + 8) * 3_600_000 },
  ] },
  { id: "console", name: "OpenCode Console", account: "Workspace", providerIDs: ["opencode"], status: "ready", updatedAt: now, quotas: [
    { kind: "credit", label: "credits", remaining: 42.5, currency: "USD" },
  ] },
] }
const rgb = RGBA.fromHex
const feedback = Object.fromEntries(Object.entries({ success: "#95d5a0", warning: "#eac17a", error: "#ef8997", info: "#8bbaf3" }).map(([key, color]) => [key, { base: rgb(color), muted: rgb(color) }]))
const tokens = { text: { base: rgb("#e6edf3"), muted: rgb("#94a3b8"), feedback }, border: { base: rgb("#354457") } }
const slots = new Map()
const commands = new Map()
const [modal, setModal] = createSignal()
let cleanup, disposeRoot
const host = {
  options: {}, location: { directory: "quota-board-demo" },
  client: { rpc: () => ({ snapshot: async () => sample, refresh: async () => sample, events: { on: () => () => {} } }) },
  data: { on: () => () => {}, location: { default: () => host.location } },
  theme: { ...tokens, surface: () => tokens },
  storage: { store: (_, options) => {
    const [state, set] = createStore(options.initial)
    return [state, async mutation => set(produce(mutation))]
  } },
  keymap: { layer: factory => { for (const command of factory().commands) commands.set(command.id ?? command.bind, command) } },
  ui: {
    toast: { show() {} }, model: { current: () => ({ providerID: "openai" }) },
    slot: claim => { slots.set(claim.append, claim.render); return () => {} },
    dialog: { set() {}, show: render => setModal(() => render), clear: () => setModal(undefined), select: async () => undefined },
  },
}
createRoot(dispose => { disposeRoot = dispose; cleanup = plugin.setup(host) })
await Promise.resolve()
const ui = await testRender(() => <box backgroundColor="#131a23" flexDirection="column"><Show when={modal()} fallback={slots.get("sidebar.content")()}>{render => render()()}</Show></box>, { width: 44, height: 18 })
async function capture() {
  await ui.flush()
  const frame = ui.captureSpans()
  const last = frame.lines.findLastIndex(line => line.spans.some(span => span.text.trim()))
  const rows = Math.min(frame.rows, last + 3)
  return { ...frame, rows, lines: frame.lines.slice(0, rows) }
}
async function click(text) {
  const lines = ui.captureCharFrame().split("\n")
  const y = lines.findIndex(line => line.includes(text))
  assert.ok(y >= 0, `Missing demo control: ${text}`)
  await ui.mockMouse.click(lines[y].indexOf(text), y)
  await ui.flush()
}

// Terminal cells retain the foreground/background colors from the actual renderer.
function terminal(ctx, frame, x, y, cell = 11, line = 22) {
  for (const [row, content] of frame.lines.entries()) {
    let col = 0
    for (const span of content.spans) {
      const color = rgba => { const [r, g, b, a] = rgba.toInts(); return `rgba(${r},${g},${b},${a / 255})` }
      ctx.fillStyle = color(span.bg)
      ctx.fillRect(x + col * cell, y + row * line, span.width * cell, line)
      ctx.fillStyle = color(span.fg)
      ctx.font = `${span.attributes & 1 ? "bold " : ""}18px QuotaMono, QuotaSymbols`
      // All demo glyphs occupy one terminal cell. Drawing individually preserves spacing.
      for (const [offset, char] of [...span.text].entries()) {
        if (char === "█") ctx.fillRect(x + (col + offset) * cell, y + row * line, cell, line)
        else ctx.fillText(char, x + (col + offset) * cell, y + row * line + 17)
      }
      col += span.width
    }
  }
}
function rounded(ctx, x, y, width, height, radius, fill) {
  ctx.fillStyle = fill
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill()
}
function text(ctx, value, x, y, size = 18, color = "#94a3b8") {
  ctx.font = `${size}px QuotaMono`; ctx.fillStyle = color; ctx.fillText(value, x, y)
}
function base(title, subtitle, height = 980) {
  const canvas = createCanvas(1120, height)
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#0b1018"; ctx.fillRect(0, 0, canvas.width, canvas.height)
  rounded(ctx, 32, 30, 8, 24, 4, "#95d5a0")
  text(ctx, "QUOTA BOARD / OPENCODE V2", 54, 49, 16, "#95d5a0")
  text(ctx, title, 32, 101, 30, "#e6edf3")
  text(ctx, subtitle, 32, 137, 16)
  text(ctx, "Actual plugin render / sample data / demo host", 32, height - 27, 14, "#718198")
  return { canvas, ctx }
}
function panel(ctx, frame, x, y, title) {
  const width = frame.cols * 11 + 32
  rounded(ctx, x, y, width, Math.max(12, frame.rows) * 22 + 66, 14, "#131a23")
  for (const [i, color] of ["#ef8997", "#eac17a", "#95d5a0"].entries()) {
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x + 21 + i * 18, y + 23, 4, 0, Math.PI * 2); ctx.fill()
  }
  text(ctx, title, x + 86, y + 28, 14)
  terminal(ctx, frame, x + 16, y + 48)
}

try {
  const expanded = await capture()
  assert.match(ui.captureCharFrame(), /98% left/)
  await click("OpenAI"); await click("OpenCode Console")
  const collapsed = await capture()
  assert.match(ui.captureCharFrame(), /98% · 6d 8h/)

  const sidebar = base("Big picture. Small footprint.", "Expand for quota bars. Collapse for the number and the countdown.", 580)
  panel(sidebar.ctx, expanded, 32, 177, "EXPANDED")
  panel(sidebar.ctx, collapsed, 572, 177, "COLLAPSED")
  await writeFile(`${output}/sidebar.png`, sidebar.canvas.toBuffer("image/png"))

  ui.resize(82, 38)
  commands.get("opencode-quota-board.open").run()
  const dashboard = await capture()
  assert.match(ui.captureCharFrame(), /Available credits\s+\$42\.50/)
  const popup = base("Your allowances, one command away.", "/quota opens the popup. Esc takes you straight back.")
  panel(popup.ctx, dashboard, 93, 177, "/quota")
  await writeFile(`${output}/quota-modal.png`, popup.canvas.toBuffer("image/png"))

  await click("Shown in sidebar")
  const hidden = await capture()
  assert.match(ui.captureCharFrame(), /Hidden from sidebar/)
  commands.get("escape").run()
  ui.resize(44, 18)
  const tidy = await capture()
  assert.doesNotMatch(ui.captureCharFrame(), /OpenAI/)

  // A chaptered recording of actual click/command state transitions, with readable holds.
  const scenes = [
    { title: "01 / Read the room", sub: "See remaining allowances without leaving your conversation.", frame: expanded, notes: ["LIVE QUOTA BARS", "98% remaining", "Reset in 6d 8h", "Credits alongside limits"], delay: 3500 },
    { title: "02 / Keep it compact", sub: "Click a provider name to collapse its details.", frame: collapsed, notes: ["JUST THE ESSENTIALS", "Percentage + countdown", "Balance, without clutter", "Click again to expand"], delay: 3500 },
    { title: "03 / Open /quota", sub: "Provider cards, full-width meters, and controls in one popup.", frame: dashboard, delay: 4500 },
    { title: "04 / Make it yours", sub: "Click Shown in sidebar to hide an account from the sidebar.", frame: hidden, delay: 3500 },
    { title: "05 / Back to your work", sub: "Press Esc. Your sidebar keeps the visibility choice.", frame: tidy, notes: ["YOUR SIDEBAR, YOUR WAY", "Hide individual providers", "Pin the ones you track", "Preferences survive restart"], delay: 3500 },
  ]
  const gif = GIFEncoder()
  for (const scene of scenes) {
    const { canvas, ctx } = base(scene.title, scene.sub)
    if (scene.notes) {
      scene.notes.forEach((note, index) => text(ctx, note, 40, 290 + index * 48, index ? 16 : 18, index ? "#94a3b8" : "#95d5a0"))
      panel(ctx, scene.frame, 572, 230, "SIDEBAR")
    } else panel(ctx, scene.frame, 93, 177, "/quota")
    // Progress markers make the short loop easy to follow without flashing transitions.
    scenes.forEach((_, i) => rounded(ctx, 32 + i * 46, 922, 34, 4, 2, i === scenes.indexOf(scene) ? "#95d5a0" : "#29374a"))
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const palette = quantize(data, 128)
    gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette, delay: scene.delay, repeat: 0 })
  }
  gif.finish()
  await writeFile(`${output}/walkthrough.gif`, gif.bytes())
  console.log("Generated sidebar.png, quota-modal.png, and walkthrough.gif from the plugin's OpenTUI renders.")
} finally {
  ui.renderer.destroy()
  await cleanup?.()
  disposeRoot()
  Date.now = originalNow
}
