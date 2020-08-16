import React from 'react'
import { SplashUIColumn } from './calculateColumns'

function TableCell(props: {
  as?: 'th' | 'td'
  style?: any
  children: any
}): React.ReactElement {
  const { as: Component = 'td', style, ...restProps } = props

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
    ></Component>
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
                  if (!cellData) return <td key={key}></td>
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
