import { Database, IteratorOptions } from 'node-level'
import { Parser, Select } from 'node-sql-parser'
import { Result } from './result'
import { TableSchema, kTableNameForTables } from './tables'

const parser = new Parser()

export class DatabaseSQL {
  constructor(dbpath: string) {
    this._db = new Database(dbpath)
  }

  public async query(cmd: string): Promise<Result[]> {
    try {
      const ast = parser.astify(cmd)
      console.log(JSON.stringify(ast, null, 2))
      let result: Result[] = []

      if (Array.isArray(ast)) {
      } else {
        if (ast.type === 'select') {
          result = await this.select(ast)
        }
      }
      return result
    } catch (e) {
      throw e
    }
  }

  private async select(ast: Select): Promise<Result[]> {
    const option = new IteratorOptions()
    let table = ''
    if (ast.from !== null && ast.from.length > 0) {
      const from = ast.from[0]
      table = Reflect.get(from, 'table')
    }
    const result: Result[] = []
    if (!table) return result
    option.start = table
    for await (const entry of this._db.iterator(option)) {
      try {
        const schema = JSON.parse(`${entry.value}`)
        result.push(schema)
      } catch (e) {
        result.push({ failed: true })
      }
    }
    return result
  }

  private async createTable(schema: TableSchema): Promise<void> {
    this._db.put(
      `${kTableNameForTables}/${schema.tableName}`,
      JSON.stringify(schema)
    )
  }

  private async showTables(): Promise<Result[]> {
    const option = new IteratorOptions()
    option.start = kTableNameForTables
    const result = []
    for await (const entry of this._db.iterator(option)) {
      const schema = JSON.parse(`${entry.value}`)
      result.push(schema)
    }
    return result
  }

  _db: Database
}
