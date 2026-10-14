<div align="center">

# Quota Board

### Know what's left. Keep building.

Provider quotas, reset countdowns, and credit balances — right inside OpenCode.

![OpenCode V2](https://img.shields.io/badge/OpenCode-V2-95d5a0?style=flat-square&labelColor=131a23)
[![npm version](https://img.shields.io/npm/v/opencode-quota-board?style=flat-square&labelColor=131a23&color=95d5a0)](https://www.npmjs.com/package/opencode-quota-board)
![Early release](https://img.shields.io/badge/status-early_release-eac17a?style=flat-square&labelColor=131a23)
![pnpm](https://img.shields.io/badge/package_manager-pnpm-8bbaf3?style=flat-square&labelColor=131a23)

[See it in action](#see-it-in-action) · [Install](#install) · [Controls](#controls) · [Providers](#supported-providers)

![Expanded and collapsed Quota Board sidebars, showing 98% remaining, a 6d 8h reset countdown, and a $42.50 Console balance](https://raw.githubusercontent.com/gilvex/opencode-quota-board/main/docs/media/sidebar.png)

</div>

## Less guessing. More coding.

- **At a glance.** Colored quota bars and balances in a compact, tree-style sidebar.
- **Small when you need it.** Collapse an account to `OpenAI ▸ 98% · 6d 8h` or `OpenCode Console ▸ $42.50`.
- **One command away.** `/quota` opens a centered, scrollable popup over your conversation.
- **Your providers, your order.** Hide individual accounts, pin favorites, and keep your current provider first.
- **Already connected? You're ready.** Uses OpenCode V2's active connections, including Console sign-in.
- **Refresh without losing context.** Last-known values remain visible as **STALE** when a provider request fails.

## See it in action

**Expand → collapse → `/quota` → hide a provider → Esc.**

![Animated walkthrough of the actual Quota Board components: quota bars, compact summaries, the quota popup, and provider visibility controls](https://raw.githubusercontent.com/gilvex/opencode-quota-board/main/docs/media/walkthrough.gif)

*An 18.5-second looping demo, captured from the plugin's OpenTUI components in a demo host. All balances and quotas are sample data. The surrounding frames and captions are presentation elements.*

Prefer still images? [Sidebar comparison](https://raw.githubusercontent.com/gilvex/opencode-quota-board/main/docs/media/sidebar.png) · [Quota popup](https://raw.githubusercontent.com/gilvex/opencode-quota-board/main/docs/media/quota-modal.png)

<details>
<summary><strong>A closer look at the quota popup</strong></summary>

![Quota popup showing a weekly OpenAI allowance, its reset countdown, Console credits, and refresh, pin, visibility, and close controls](https://raw.githubusercontent.com/gilvex/opencode-quota-board/main/docs/media/quota-modal.png)

Read the provider's individual windows, check its last update, refresh one account, or change what appears in the sidebar. **Esc** returns you to the conversation.

</details>

## Install

Requires **OpenCode V2**; tested with **2.0.28**.

Add the package to the `plugins` array in **both** global files:

- `~/.config/opencode/opencode.jsonc` — fetches provider allowances on the server.
- `~/.config/opencode/cli.json` — adds the sidebar, footer, and popup to the terminal.

```json
{
  "plugins": ["opencode-quota-board@0.1.0"]
}
```

Merge this entry into existing plugin lists. OpenCode installs the package for you. If you use `XDG_CONFIG_HOME`, use its `opencode` configuration directory instead. With a remote server, add the server entry to that machine's configuration.

Run `opencode reload`, restart the TUI, and open `/quota`. Connect providers with `/connect` if needed.

### Install from a local checkout

For development, you can load the source directory directly instead of using the npm package.

You need [OpenCode V2](https://opencode.ai/v2/docs/), [pnpm](https://pnpm.io/installation), and a local copy of this project. [Bun](https://bun.sh/) is also needed for UI tests and media generation.

### 1. Install dependencies

Clone the repository and install its dependencies:

```sh
git clone https://github.com/gilvex/opencode-quota-board.git
cd opencode-quota-board
pnpm install
```

### 2. Enable both halves

Add the project directory to **both** global configurations. Merge the entries into your existing plugin lists.

**Server — `~/.config/opencode/opencode.jsonc`**

```jsonc
{
  "plugins": [
    "file:///D:/Pleroma/Projects/opencode-quota-board"
  ]
}
```

**Terminal UI — `~/.config/opencode/cli.json`**

```json
{
  "plugins": [
    "file:///D:/Pleroma/Projects/opencode-quota-board"
  ]
}
```

Replace the example with your own absolute directory URL. On macOS/Linux, for example: `file:///home/you/projects/opencode-quota-board`. If you use `XDG_CONFIG_HOME`, the configuration directory follows that setting.

The **server plugin** fetches allowances; the **TUI plugin** displays them. For a remote OpenCode server, install the server plugin on that machine too, using its own local path.

### 3. Reload and open

```sh
opencode reload
```

Restart the TUI, then run:

```text
/quota
```

Connect accounts with `/connect` if you haven't already. For Console credits and Go limits, choose **OpenCode Console account**.

<details>
<summary>Coming from opencode-usage-left?</summary>

Replace its CLI plugin entry with Quota Board to avoid duplicate panels. Console now uses the active V2 connection; browser cookies and the old `opencode-usage-left.json` credentials file are not used.

</details>

## Controls

| Where | Action | Result |
| --- | --- | --- |
| Anywhere | `/quota` | Open the quota popup |
| Sidebar | Click **Quota Board** | Collapse or expand the whole section |
| Sidebar | Click a **provider name** | Toggle bars and the compact summary |
| Sidebar | Click **…** | Choose which providers appear |
| Popup | **r** / **Refresh all** | Refresh all accounts |
| Popup | **↻ Refresh** | Refresh one account |
| Popup | **Shown / Hidden in sidebar** | Toggle that account's sidebar visibility |
| Popup | **◇ Pin / ◆ Pinned** | Prioritize or unpin an account |
| Popup | **u** | Show or hide unsupported providers |
| Popup | **Esc** / close control | Close the popup |
| Prompt footer | Click the quota summary | Open the popup |

**What does “pinned” mean?** The selected provider always comes first, then pinned providers, then the rest. Pinning controls ordering; visibility is a separate setting. Collapse, pin, and visibility preferences survive restarts.

### Reading the numbers

```text
OpenAI ▸ 98% · 6d 8h
         │       └── time until this window resets
         └────────── allowance remaining, not used
```

- Expanded labels such as **1w** describe the quota window. **6d 8h** is its remaining reset time.
- If a provider reports several percentage windows, its compact summary shows the one with the **lowest remaining percentage**, alongside that window's countdown.
- Credit accounts show a balance, such as **$42.50**, without an invented percentage bar.
- **STALE** means the latest refresh failed and you're seeing the last successful reading.
- After a reset deadline passes, the countdown says **reset pending refresh** until fresh provider data arrives.

## Supported providers

| Provider | What Quota Board reads |
| --- | --- |
| **OpenAI** | OAuth subscription windows and reset times |
| **Anthropic** | OAuth 5-hour / weekly windows, plus extra usage when returned |
| **OpenCode Console** | Prepaid balance or available invoiced credit; active Go / Go Plus windows |
| **OpenRouter** | The current API key's remaining spending allowance |
| **Z.AI Coding Plan** | Token-plan allowance and reset time |
| **Synthetic** | Rolling 5-hour and weekly quotas |
| **MiniMax Token Plan** | Available 5-hour and weekly plan windows |

Availability depends on the connected account, its plan, and the provider's response. OpenAI and Anthropic subscription usage requires OAuth. OpenRouter's key allowance is **not** an account-wide balance.

<details>
<summary><strong>How Console authentication works</strong></summary>

Quota Board resolves the active V2 OAuth/API-key connection and queries `/api/billing/status` and `/api/go/status` on that connection's Console server. OAuth workspace metadata supplies `x-org-id`; OpenCode handles token refresh.

One **OpenCode Console** entry combines readable credits and active Go/Go Plus windows. Billing and subscription permissions are independent, so readable data can still appear when the other endpoint denies access. No subscription is a valid state.

No browser cookies, HTML scraping, or separate credentials file are needed. These status endpoints are used by the current Console frontend, but are not part of its documented public API contract.

</details>

## Refresh behavior

Accounts update independently. A failed request retains that account's previous values and doesn't hide other accounts. Requests are deduplicated within a location, and errors use retry backoff, including provider `Retry-After` headers. Manual refresh respects that backoff too.

The default polling interval is **60 seconds**. To customize it, replace the **server** plugin entry with:

```jsonc
{
  "plugins": [{
    "package": "file:///D:/Pleroma/Projects/opencode-quota-board",
    "options": {
      "refreshIntervalSeconds": 60,
      "requestTimeoutMs": 10000
    }
  }]
}
```

| Option | Default | Range |
| --- | --- | --- |
| `refreshIntervalSeconds` | `60` | `15–3600` seconds |
| `requestTimeoutMs` | `10000` | `1000–60000` milliseconds |

Polling pauses after two minutes without client activity. Terminals at the same location share requests; different project locations have separate schedulers. Account changes invalidate cached readings, and in-flight requests are cancelled on unload or account invalidation.

## Good to know

- These are **provider-reported account allowances**, not session token counts or session spend.
- Only each integration's active connection is queried. Credentials are resolved through OpenCode, not read from V1 `auth.json`.
- Quota Board persists UI preferences, not credentials or quota snapshots.
- Some provider endpoints are private and can change. Reset deadlines do not themselves guarantee replenishment.
- This preview focuses on current allowances. Historical charts, notifications, and automatic account switching are not included.

<details>
<summary><strong>Troubleshooting</strong></summary>

**No sidebar or `/quota` command?** Check the CLI plugin entry and restart the TUI. Local-directory loading requires the root `tui.tsx` shim included in this project.

**“Quota service unavailable”?** Check the server plugin entry, run `opencode reload`, and confirm the server can access its project directory.

**A provider is missing?** Check `/connect`, the sidebar's **…** menu, and **u** in the popup for unsupported accounts.

**A balance or quota is stale?** Open `/quota` to read the provider's error detail. Retry after the provider's backoff period. Other accounts can continue to update.

**Console billing isn't readable?** The active workspace role or service key may lack billing permissions. Readable subscription limits can still appear independently.

</details>

## Development

```sh
pnpm typecheck
pnpm test
pnpm test:ui
```

The UI smoke test uses **Bun and the real OpenTUI renderer**, including mouse interactions, compact summaries, popup controls, narrow layouts, and stale updates.

### Rebuild the visuals

```sh
pnpm docs:media
```

This renders the current plugin with deterministic sample data and generates the README's two PNGs and animated GIF. It uses no provider connections. See [the media guide](docs/media/README.md) for font setup and capture details.

### Under the hood

```text
Active V2 connections
        ↓
Server adapters → usage cache + refresh scheduler
        ↓
Validated RPC snapshots + update events
        ↓
Sidebar · prompt summary · /quota popup
```

| File | Responsibility |
| --- | --- |
| [`src/index.ts`](src/index.ts) | Server entrypoint and integration discovery |
| [`src/service.ts`](src/service.ts) | Refresh lifecycle, cache, backoff, cancellation |
| [`src/adapters.ts`](src/adapters.ts) | Provider requests and parsers |
| [`src/console.ts`](src/console.ts) | Authenticated Console credits and subscription meters |
| [`src/rpc.ts`](src/rpc.ts) | Validated snapshots and events |
| [`src/tui.tsx`](src/tui.tsx) | Sidebar, footer, popup, commands, preferences |
| [`src/format.ts`](src/format.ts) | Quota labels, bars, countdowns, summaries |
| [`scripts/render-media.jsx`](scripts/render-media.jsx) | Reproducible documentation captures |

Root `index.ts` and `tui.tsx` shims support OpenCode's local-directory discovery. The package exports point to the same implementations.

---

Built for **OpenCode V2**, with provider adapters adapted from **opencode-usage-left**. MIT licensed.
