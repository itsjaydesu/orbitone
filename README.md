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

## License

[MIT](LICENSE)

## Author

**itsjaydesu** — [GitHub](https://github.com/itsjaydesu) · [X](https://x.com/itsjaydesu) · [Website](https://itsjaydesu.com)
