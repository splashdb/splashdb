import { Select } from 'node-sql-parser'
import { Database, IteratorOptions } from 'node-level'
import { Result } from './result'

export async function select(db: Database, ast: Select): Promise<Result[]> {
  const option = new IteratorOptions()
  let table = ''
  if (ast.from !== null && ast.from.length > 0) {
    const from = ast.from[0]
    table = Reflect.get(from, 'table')
  }
  const result: Result[] = []
  if (!table) return result
  option.start = table
  for await (const entry of db.iterator(option)) {
    try {
      const schema = JSON.parse(`${entry.value}`)
      result.push(schema)
    } catch (e) {
      result.push({ failed: true })
    }
  }

  return result
}
