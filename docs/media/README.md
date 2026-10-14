# Real terminal captures

These assets come from an **actual desktop screen recording** of OpenCode 2.0.28 in Tabby on Windows, captured on October 14, 2026. They replace the earlier fixture-rendered demo.

The recording uses real active OpenAI and OpenCode Console connections in a separate `Quota-Board-Demo` session. Its quotas and balances are historical readings from the time of capture. The theme, font, dialogs, and mouse pointer are the ones rendered on screen.

| Asset | Content |
| --- | --- |
| `walkthrough.mp4` | Original 32-second viewport recording, H.264, 1518×1272, 12 fps, no audio |
| `walkthrough.gif` | Looping version at 1280 pixels wide and 10 fps |
| `sidebar.png` | Expanded quota bar and collapsed Console balance |
| `sidebar-collapsed.png` | Compact percentage/countdown and credit summaries |
| `provider-visibility.png` | The actual provider hide/show selection dialog |
| `quota-modal.png` | The actual `/quota` popup |

## What the recording demonstrates

- Collapse and expand OpenAI's quota details.
- Open **…**, hide Console, and show it again.
- Type `/quota` and open the popup.
- Pin and unpin OpenAI.
- Refresh OpenAI's allowance.
- Hide and show OpenAI from its popup card.
- Close the popup and return to a compact sidebar.

The mouse clicks and keystrokes were automated against the real terminal window while FFmpeg recorded desktop pixels, including the cursor. The temporary terminal tab was closed afterward, the original window size restored, and the original quota preferences restored. No fixture host or redrawn terminal text is used in these assets.

## Reprocess the recording

Install FFmpeg and run from the project root:

```sh
pnpm docs:media
```

If FFmpeg isn't on `PATH`, specify its executable:

```powershell
$env:FFMPEG_PATH = 'C:\tools\ffmpeg\bin\ffmpeg.exe'
pnpm docs:media
```

```sh
FFMPEG_PATH=/path/to/ffmpeg pnpm docs:media
```

`scripts/process-recording.mjs` extracts stills at 1, 7, 16, and 30 seconds, crops them to the relevant UI, and makes a palette-optimized GIF. The MP4 keeps the full captured OpenCode viewport and includes typing `/quota`. Processing never alters the displayed values or replaces UI elements.

For a new recording, capture a separate real OpenCode session, replace the MP4, and adjust the extraction timestamps and crop rectangles to match the new viewport. Inspect the resulting stills and animation before publishing. Download the MP4 for native video uploads to Reddit or X, or use the PNGs for a motion-free preview.
