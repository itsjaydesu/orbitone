import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'

const fontSans = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-custom',
  display: 'swap',
})

const fontMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono-custom',
  display: 'swap',
})

const siteUrl
  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://orbitone.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'orbitone',
  description:
    'A nostalgic 3D MIDI visualizer that turns MIDI files into a playable music box.',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'orbitone',
    description:
      'A nostalgic 3D MIDI visualizer that turns MIDI files into a playable music box.',
    url: '/',
    siteName: 'orbitone',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'orbitone',
    description:
      'A nostalgic 3D MIDI visualizer that turns MIDI files into a playable music box.',
    creator: '@itsjaydesu',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
