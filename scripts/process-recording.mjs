// Crop and encode an actual desktop recording; no UI or sample data is generated.
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const directory = fileURLToPath(new URL("../docs/media/", import.meta.url))
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg"
const source = join(directory, "walkthrough.mp4")

function convert(args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`FFmpeg exited with status ${result.status}`)
}

// Coordinates refer to the 1518x1272 OpenCode viewport in the original recording.
// Keep native pixel resolution for text; only trim unused surrounding space.
const stills = [
  { name: "sidebar.png", second: 1, crop: "462:164:1056:220" },
  { name: "sidebar-collapsed.png", second: 30, crop: "462:110:1056:220" },
  { name: "provider-visibility.png", second: 7, crop: "1110:345:408:220" },
  { name: "quota-modal.png", second: 16, crop: "696:846:411:295" },
]
for (const still of stills) {
  convert(["-ss", String(still.second), "-i", source, "-vf", `crop=${still.crop}`, "-frames:v", "1", join(directory, still.name)])
}

convert([
  "-i", source,
  "-filter_complex", "[0:v]fps=10,scale=1280:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
  "-loop", "0", join(directory, "walkthrough.gif"),
])
console.log("Updated four real screenshots and the GIF from walkthrough.mp4.")
