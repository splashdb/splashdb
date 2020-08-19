import React from 'react'

export function SplashUILogo(): React.ReactElement {
  return (
    <div
      style={{
        touchAction: 'none',
        cursor: 'default',
        userSelect: 'none',
        height: 40,
        lineHeight: '40px',
        fontFamily: 'sans-serif',
        fontStyle: 'italic',
        fontWeight: 800,
        width: 100,
        // letterSpacing: 1,
        textAlign: 'center',
      }}
    >
      Splash
      <span style={{ fontWeight: 200 }}>UI</span>
    </div>
  )
}
