import { Database, IteratorOptions } from 'node-level'

export interface TableSchema {
  tableName: string
}

export const kTableNameForTables = '_tables'

export async function createTable(
  db: Database,
  schema: TableSchema
): Promise<void> {
  db.put(`${kTableNameForTables}/${schema.tableName}`, JSON.stringify(schema))
}

export async function showTables(db: Database): Promise<void> {
  const option = new IteratorOptions()
  option.start = kTableNameForTables
  const result = []
  for await (const entry of db.iterator(option)) {
    const schema = JSON.parse(`${entry.value}`)
    result.push(schema)
  }
  if (result.length > 0) {
    console.table(result)
  }
}
