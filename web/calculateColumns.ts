type SplashUIColumnType = string

export type SplashUIColumn = {
  key: string
  type: SplashUIColumnType
  width?: number
  show: boolean
}

export function calculateColumns(data: any[]): SplashUIColumn[] {
  const columns: SplashUIColumn[] = []
  for (const item of data) {
    for (const entry of Object.entries(item)) {
      const [key, value] = entry
      if (columns.find((column) => column.key === key)) {
        continue
      }
      let valueType: SplashUIColumnType = typeof value
      if (valueType === 'object') {
        if (value instanceof Array) {
          valueType = 'array'
        }
      }
      columns.push({
        key,
        type: valueType,
        show: true,
      })
    }
  }
  return columns
}
