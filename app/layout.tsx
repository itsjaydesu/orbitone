import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'orbitone',
  description: 'A cinematic 3D MIDI visualizer built around orbiting notation and live playback.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
