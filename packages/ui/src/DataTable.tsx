import React from 'react'
import { SplashUIColumn } from './calculateColumns'

const defaultChildren = (
  <pre
    style={{
      backgroundColor: '#f2f2f2',
      display: 'inline-block',
      borderRadius: 4,
      fontStyle: 'italic',
      paddingLeft: 4,
      margin: 0,
      paddingRight: 4,
    }}
  >
    &lt;empty&gt;
  </pre>
)

function TableCell(props: {
  as?: 'th' | 'td'
  style?: any
  children?: any
}): React.ReactElement {
  const {
    as: Component = 'td',
    style,
    children = defaultChildren,
    ...restProps
  } = props

  const cellStyle = {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ddd',
    padding: 4,
    textAlign: 'left',
    fontFamily: 'monospace',
  }
  return (
    <Component
      style={{
        ...cellStyle,
        ...style,
      }}
      {...restProps}
    >
      {children}
    </Component>
  )
}

export function DataTable(props: {
  width: number
  height: number
  columns: SplashUIColumn[]
  data: any[]
}): React.ReactElement {
  const { columns, data, width, height } = props

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#fcfcfc',
      }}
    >
      <table
        style={{
          borderCollapse: 'collapse',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => {
              const { key, type } = column
              return (
                <TableCell as="th" key={key}>
                  {key}
                </TableCell>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((record) => {
            return (
              <tr key={record._id}>
                {columns.map((column) => {
                  const { key, type } = column
                  const cellData = record[key]
                  if (!cellData) return <TableCell key={key}></TableCell>
                  if (type === 'object' || type === 'array') {
                    return (
                      <TableCell key={key}>
                        {JSON.stringify(cellData)}
                      </TableCell>
                    )
                  }
                  return <TableCell key={key}>{cellData}</TableCell>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
