import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Generated at request/build time so the link preview on LinkedIn/Twitter/etc.
// shows real branding instead of a blank card.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#dc2626',
              borderRadius: 20,
            }}
          >
            <svg width="52" height="52" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: 'white' }}>
            Ghana News Hub
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#a1a1aa' }}>
          Latest news from Ghana&apos;s leading sources
        </div>
      </div>
    ),
    { ...size }
  )
}
