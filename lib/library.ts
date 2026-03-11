export interface MidiLibraryItem {
  artist: string;
  durationLabel: string;
  fileName: string;
  id: string;
  title: string;
  url: string;
}

export const MIDI_LIBRARY: MidiLibraryItem[] = [
  {
    id: 'theme-song-to-2008',
    title: 'Theme Song to 2008',
    artist: 'Unknown Artist',
    durationLabel: '3:28',
    fileName: 'theme-song-to-2008.midi',
    url: '/midi/theme-song-to-2008.midi',
  },
  {
    id: 'darude-sandstorm',
    title: 'Sandstorm',
    artist: 'Darude',
    durationLabel: '5:38',
    fileName: 'darude-sandstorm.mid',
    url: '/midi/darude-sandstorm.mid',
  },
  {
    id: 'succession-theme',
    title: 'Succession Theme',
    artist: 'Nicholas Britell',
    durationLabel: '1:28',
    fileName: 'succession-theme.mid',
    url: '/midi/succession-theme.mid',
  },
];
