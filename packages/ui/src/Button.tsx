import React from 'react'
import { Play as IconRun } from 'react-feather'

export function Button(props: {
  loading?: boolean
  shape?: 'round' | 'circle'
  onClick?: () => void
}): React.ReactElement {
  const { onClick, loading = false, shape = 'round' } = props
  const borderRadius = React.useMemo(() => {
    if (shape === 'round') return 4
    if (shape === 'circle') return 32
  }, [shape])

  const width = React.useMemo(() => {
    if (shape === 'round') return undefined
    if (shape === 'circle') return 32
  }, [shape])

  return (
    <button
      onClick={onClick}
      style={{
        outline: 0,
        width,
        height: 32,
        borderWidth: 0,
        borderRadius,
        backgroundColor: '#fff',
        boxShadow: '0 0 1px rgba(0,0,0,0.6)',
      }}
    >
      {loading ? (
        '...'
      ) : (
        <div style={{ paddingLeft: 2, paddingTop: 2 }}>
          <IconRun size={18}></IconRun>
        </div>
      )}
    </button>
  )
}
