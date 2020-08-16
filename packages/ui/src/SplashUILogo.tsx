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
        fontFamily: 'fantasy',
        fontWeight: 500,
        width: 100,
        textAlign: 'center',
      }}
    >
      SplashUI
    </div>
  )
}
