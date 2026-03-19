# orbitone

A cinematic 3D MIDI visualizer that maps notes to a concentric grand staff with orbiting notation and live audio playback.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Three.js](https://img.shields.io/badge/Three.js-0.183-black?logo=three.js)
![Tone.js](https://img.shields.io/badge/Tone.js-15-black)
![License](https://img.shields.io/badge/License-MIT-blue)

## What it does

Orbitone renders MIDI files as an interactive 3D visualization. Notes orbit around a concentric grand staff, preserving sustain duration and velocity for a faithful visual representation of the performance. Audio is synthesized in real-time using a sampled piano.

**Features:**

- Upload any `.mid` / `.midi` file or pick from the built-in library
- Real-time piano synthesis via Tone.js
- Multiple camera angles with a customizable camera lab
- Adjustable BPM, volume, and MIDI roll overlay
- Fullscreen mode
- Keyboard shortcuts for all controls

## Getting started

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/itsjaydesu/orbitone.git
cd orbitone
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Keyboard shortcuts

| Key     | Action                   |
| ------- | ------------------------ |
| `Space` | Play / Stop              |
| `F`     | Toggle fullscreen        |
| `S`     | Toggle settings panel    |
| `C`     | Cycle camera view        |
| `M`     | Toggle MIDI roll overlay |
| `L`     | Open MIDI library        |
| `U`     | Upload a MIDI file       |
| `I`     | About / Info             |
| `Esc`   | Close any open panel     |

## Tech stack

- **[Next.js](https://nextjs.org/)** — React framework
- **[Three.js](https://threejs.org/) / [React Three Fiber](https://r3f.docs.pmnd.rs/)** — 3D rendering
- **[Tone.js](https://tonejs.github.io/)** — Audio synthesis and MIDI playback
- **[@tonejs/midi](https://github.com/Tonejs/Midi)** — MIDI file parsing
- **[Tailwind CSS](https://tailwindcss.com/)** — Styling
- **[Motion](https://motion.dev/)** — Animations
- **[Lucide](https://lucide.dev/)** — Icons

## Project structure

```
app/
  layout.tsx          Root layout
  page.tsx            Main page (controls, UI chrome, state)
  globals.css         Global styles and neumorphic design system
components/
  Visualizer.tsx      3D scene — staff, notes, bloom, camera
  CameraLab.tsx       Camera preset editor
hooks/
  useMusic.ts         Audio engine — load MIDI, play/stop, seek
  use-mobile.ts       Mobile viewport detection
lib/
  camera-presets.ts   Camera position definitions and persistence
  library.ts          Built-in MIDI library entries
  music.ts            MIDI parsing and note scheduling
  utils.ts            Tailwind class merge utility
public/
  midi/               Built-in MIDI files
```

## Scripts

| Command         | Description            |
| --------------- | ---------------------- |
| `npm run dev`   | Start dev server       |
| `npm run build` | Production build       |
| `npm start`     | Serve production build |
| `npm run lint`  | Run ESLint             |
| `npm run clean` | Clear `.next` cache    |
| `npm run export:save` | Copy the latest browser-downloaded export into `video-output/` |
| `npm run export:library` | Export the built-in MIDI library one file at a time |

## Video export process

All generated videos now live under `video-output/` in the project root. That directory is gitignored so long-running export runs do not dirty the repository.

### Export defaults

- A normal UI load now defaults to `mp4` export format.
- A normal UI load now defaults to `Cycle 10s` camera export mode.
- The unattended batch exporter forces those same settings for every file so the output is consistent.

### Single export capture

The in-browser export still downloads through the browser first. To copy the latest downloaded Orbitone export into the repo output folder:

```bash
pnpm export:save
```

Useful variants:

```bash
pnpm export:save -- --output miras-theme.mp4
pnpm export:save -- --output-dir /absolute/output/path
```

If no custom path is provided, the file is copied into `video-output/`.

### Unattended library export

The batch exporter drives the real app in a browser. It does not synthesize videos server-side by itself, so it needs a reachable Orbitone app URL.

Typical usage against an existing server:

```bash
pnpm export:library -- --base-url https://zedbock.tail1ff0.ts.net:8048/ --headless
```

What it does:

- Walks `public/midi/` recursively.
- Exports one MIDI at a time, in sorted order.
- Mirrors the MIDI folder structure into `video-output/`.
  - Example: `public/midi/classical-piano/bach-prelude-from-cello-suite.mid`
  - becomes `video-output/classical-piano/bach-prelude-from-cello-suite.mp4`
- Skips files that already exist, so rerunning resumes from the remaining library items.
- Writes a summary JSON file to `video-output/batch-export-summary-*.json` when the run exits.

Useful flags:

```bash
pnpm export:library -- --base-url https://zedbock.tail1ff0.ts.net:8048/ --match miras-theme --limit 1 --force --headless
```

- `--base-url`: Orbitone server URL to drive.
- `--match`: only export files whose relative MIDI path contains this substring.
- `--limit`: stop after N matched files.
- `--force`: regenerate outputs even if the `.mp4` already exists.
- `--fail-fast`: stop on the first export failure instead of continuing.
- `--headless`: run the browser without showing a window.
- `--chrome`: explicit Chrome / Chromium executable path.
- `--output-dir`: alternate output root instead of `video-output/`.
- `--midi-root`: alternate source MIDI directory instead of `public/midi/`.

If Chrome is not auto-detected, set `PLAYWRIGHT_CHROME_EXECUTABLE` or pass `--chrome`.

### Operational notes

- The batch exporter uses a real browser and the real UI export path.
- The app exposes an automation mode for the batch runner so it can disable the random startup track and drive exports without manual clicks.
- Progress is logged every 30 seconds.
- The runner treats 20 minutes without progress as a stall.
- Stopping with `Ctrl-C` is safe. Rerunning without `--force` resumes because completed outputs are skipped.

### Performance expectations

The bottleneck is the browser-side frame render loop plus the upload / mux path, not just raw server CPU. Full-library runs are therefore much slower than the source track durations suggest.

Observed during real runs against the Tailscale server:

- `classical-piano/bach-prelude-from-cello-suite.mid` took `1h 22m 36s`
- `film-tv-anime/star-wars-theme.mid` took `58m 48s`

Expect a full 116-file library sweep to be a very long unattended run.

## License

[MIT](LICENSE)

## Author

**itsjaydesu** — [GitHub](https://github.com/itsjaydesu) · [X](https://x.com/itsjaydesu) · [Website](https://itsjaydesu.com)
