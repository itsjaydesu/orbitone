import { Midi } from '@tonejs/midi'

interface FixtureNote {
  midi: number
  ticks: number
  durationTicks: number
  velocity?: number
}

export function midiFixture(
  notes: FixtureNote[] = [{ midi: 60, ticks: 960, durationTicks: 480 }],
  pedals: { ticks: number, value: number }[] = [],
  tempos = [{ ticks: 0, bpm: 120 }],
) {
  const midi = new Midi()
  midi.header.tempos = tempos
  midi.header.update()
  const track = midi.addTrack()
  for (const note of notes) {
    track.addNote({ ...note, velocity: (note.velocity ?? 100) / 127 })
  }
  for (const pedal of pedals) {
    track.addCC({ number: 64, ticks: pedal.ticks, value: pedal.value / 127 })
  }
  const bytes = Uint8Array.from(midi.toArray())
  const file = new File([bytes], 'fixture.mid', { type: 'audio/midi' })
  // JSDOM lacks Blob.arrayBuffer; use its own realm for the external parser.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => Uint8Array.from(bytes).buffer })
  return file
}
