# README media

These assets show the **actual Quota Board components rendered by OpenTUI**, using a deterministic demo host and sample data. They are not screenshots of a live connected OpenCode session. Terminal frames and chapter captions are added for presentation.

| Asset | Content |
| --- | --- |
| `sidebar.png` | Expanded and collapsed sidebar comparison |
| `quota-modal.png` | `/quota` popup with percentage and credit cards |
| `walkthrough.gif` | 18.5-second loop: expanded → collapsed → popup → hide provider → close |

## Regenerate

From the project root, with pnpm dependencies installed and Bun available:

```sh
pnpm docs:media
```

The script imports `src/tui.tsx`, supplies fixture RPC data, invokes the registered `/quota` command, and clicks the real rendered controls. It captures OpenTUI's text/color cells and uses `@napi-rs/canvas` and `gifenc` to create PNG/GIF assets. Assertions check the key states before output is written. No live account data or credentials are used.

The script looks for Cascadia Mono on Windows, DejaVu Sans Mono on Linux, or Menlo on macOS. You can specify a monospace font explicitly:

```powershell
$env:QUOTA_DOCS_FONT = 'C:\path\to\YourMonoFont.ttf'
pnpm docs:media
```

```sh
QUOTA_DOCS_FONT=/path/to/YourMonoFont.ttf pnpm docs:media
```

Segoe UI Symbol supplies extra glyphs when available on Windows. Output can vary slightly with the selected font and platform.

Edit the sample accounts and chapter captions in `scripts/render-media.jsx` to change the walkthrough. Keep the sample-data caption visible and inspect both PNGs after regenerating. The still images provide an alternative to the looping animation.
