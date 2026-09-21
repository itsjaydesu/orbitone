import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseMidiFile } from '../lib/music'
import { midiFixture } from './midi-fixture'

describe('parseMidiFile', () => {
  it('removes source silence and leaves a half-second lead-in', async () => {
    const music = await parseMidiFile(midiFixture([
      { midi: 60, ticks: 960, durationTicks: 480 },
      { midi: 64, ticks: 1440, durationTicks: 480 },
    ]))
    expect(music.notes.map(({ midi, time, duration }) => ({ midi, time, duration }))).toEqual([
      { midi: 60, time: 0.5, duration: 0.5 },
      { midi: 64, time: 1, duration: 0.5 },
    ])
  })

  it('keeps pedal release and register-specific damper settling', async () => {
    const music = await parseMidiFile(midiFixture(
      [48, 60, 84].map(midi => ({ midi, ticks: 960, durationTicks: 480 })),
      [{ ticks: 240, value: 127 }, { ticks: 1920, value: 0 }],
    ))
    expect(music.pedalEvents).toEqual([{ time: 0, value: 127 }, { time: 1.5, value: 0 }])
    expect(music.notes.map(note => note.pedalSustained)).toEqual([true, true, true])
    expect(music.notes.map(note => note.duration)).toEqual([1.15, 1.08, 1.04])
  })

  it('caps an unreleased pedal at fifteen seconds', async () => {
    const music = await parseMidiFile(midiFixture(
      [{ midi: 60, ticks: 0, durationTicks: 480 }, { midi: 72, ticks: 48000, durationTicks: 480 }],
      [{ ticks: 0, value: 127 }],
    ))
    expect(music.notes[0]).toMatchObject({ time: 0.5, duration: 15, pedalSustained: true })
    expect(music.notes[1].duration).toBe(0.5)
  })

  it('keeps velocity dynamics and bounded output', async () => {
    const music = await parseMidiFile(midiFixture(
      [16, 48, 80, 112].map((velocity, index) => ({ midi: 60 + index, ticks: index * 480, durationTicks: 240, velocity })),
    ))
    const velocities = music.notes.map(note => note.velocity)
    expect(velocities[1] / velocities[0]).toBeCloseTo(3)
    expect(velocities[2] / velocities[0]).toBeCloseTo(5)
    expect(velocities[3] / velocities[0]).toBeCloseTo(7)
    expect(velocities.every(value => value > 0 && value <= 1)).toBe(true)
    expect(music.playbackGain).toBeGreaterThanOrEqual(1)
    const loud = await parseMidiFile(midiFixture([{ midi: 60, ticks: 0, durationTicks: 480, velocity: 127 }]))
    expect(loud.notes[0].velocity).toBe(1)
    const quiet = await parseMidiFile(midiFixture([{ midi: 60, ticks: 0, durationTicks: 480, velocity: 1 }]))
    expect(quiet.notes[0].velocity).toBeGreaterThan(1 / 127)
    expect(quiet.notes[0].velocity).toBeLessThanOrEqual(1)
  })

  it('returns an empty score without inventing notes', async () => {
    expect(await parseMidiFile(midiFixture([]))).toEqual({ notes: [], pedalEvents: [], bpm: 120, playbackGain: 1 })
  })

  it('integrates the tempo map before normalizing the lead-in', async () => {
    const music = await parseMidiFile(midiFixture(
      [0, 480, 960].map(ticks => ({ midi: 60, ticks, durationTicks: 480 })),
      [],
      [{ ticks: 0, bpm: 120 }, { ticks: 480, bpm: 60 }],
    ))
    expect(music.bpm).toBe(120)
    expect(music.notes.map(note => [note.time, note.duration])).toEqual([[0.5, 0.5], [1, 1], [2, 1]])
  })

  // These counts and pitch bounds come from the bundled MIDI events, before Orbitone parsing.
  it.each([
    ['pop-electronic/piano-man.mid', 5595, 26, 98, 120],
    ['classical-piano/beethoven-moonlight-sonata.mid', 1145, 29, 87, 50],
    ['classical-piano/bach-prelude-from-cello-suite.mid', 656, 36, 67, 120],
  ] as const)('parses bundled %s without losing notes', async (path, count, low, high, bpm) => {
    const bytes = await readFile(new URL(`../public/midi/${path}`, import.meta.url))
    const music = await parseMidiFile(new File([bytes], 'bundled.mid'))
    expect(music.notes).toHaveLength(count)
    expect(music.bpm).toBe(bpm)
    expect(Math.min(...music.notes.map(note => note.midi))).toBe(low)
    expect(Math.max(...music.notes.map(note => note.midi))).toBe(high)
    expect(music.notes[0].time).toBeCloseTo(0.5)
    expect(music.notes.every(note => note.duration > 0 && note.duration <= 15 && note.velocity > 0 && note.velocity <= 1)).toBe(true)
    expect(music.notes.map(note => note.time)).toEqual(music.notes.map(note => note.time).toSorted((a, b) => a - b))
  })
})
