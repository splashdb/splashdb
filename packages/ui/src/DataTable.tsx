import React from 'react'

export function DataTable(props: {}) {
  const [columnSetting, setColumnSetting] = React.useState()

  return (
    <div>
      <table>
        <thead></thead>
        <tbody></tbody>
      </table>
    </div>
  )
}
