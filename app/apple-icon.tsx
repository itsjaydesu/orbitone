import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
        }}
      >
        {[46, 60, 74].map(radius => (
          <div
            key={radius}
            style={{
              position: 'absolute',
              left: 90 - radius,
              top: 96 - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: '50%',
              border: '3px solid rgba(255, 255, 255, 0.4)',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 90 - 11,
            top: 36 - 11,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 0 28px rgba(255,255,255,0.95)',
          }}
        />
      </div>
    ),
    size,
  )
}
