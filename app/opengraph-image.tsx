import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt
  = 'orbitone — a nostalgic 3D MIDI visualizer that turns MIDI files into a playable music box'

const RING_RADII = [150, 175, 200, 225, 250, 300, 325, 350, 375, 400]

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000000',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {RING_RADII.map(radius => (
          <div
            key={radius}
            style={{
              position: 'absolute',
              left: 600 - radius,
              top: 460 - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: '50%',
              border: '1.5px solid rgba(255, 255, 255, 0.22)',
            }}
          />
        ))}
        {[
          { x: 600, y: 110, s: 26, o: 1 },
          { x: 428, y: 152, s: 16, o: 0.85 },
          { x: 762, y: 168, s: 18, o: 0.9 },
          { x: 306, y: 262, s: 13, o: 0.6 },
          { x: 892, y: 286, s: 14, o: 0.65 },
          { x: 232, y: 396, s: 11, o: 0.4 },
          { x: 962, y: 420, s: 12, o: 0.45 },
        ].map(dot => (
          <div
            key={`${dot.x}-${dot.y}`}
            style={{
              position: 'absolute',
              left: dot.x - dot.s / 2,
              top: dot.y - dot.s / 2,
              width: dot.s,
              height: dot.s,
              borderRadius: '50%',
              background: '#ffffff',
              opacity: dot.o,
              boxShadow: `0 0 ${dot.s * 2.5}px rgba(255,255,255,${dot.o * 0.9})`,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 252,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: 84,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.96)',
              letterSpacing: '0.24em',
              marginLeft: '0.24em',
            }}
          >
            orbitone
          </div>
          <div
            style={{
              fontSize: 25,
              color: 'rgba(255, 255, 255, 0.5)',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginLeft: '0.3em',
            }}
          >
            a music box for midi
          </div>
        </div>
      </div>
    ),
    size,
  )
}
