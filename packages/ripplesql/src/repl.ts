import repl from 'repl'
import { Parser } from 'node-sql-parser'
import { Context } from 'vm'
import { Database } from 'node-level'
import { argv } from 'yargs'
import path from 'path'
import { select } from './select'
import { Result } from './result'

const parser = new Parser()
const dbpath = typeof argv.dbpath === 'string' ? argv.dbpath : './db'
const db = new Database(path.resolve(process.cwd(), dbpath))

repl.start({
  prompt: '> ',
  eval: async (
    cmd: string,
    context: Context,
    filename: string,
    callback
  ): Promise<void> => {
    try {
      const ast = parser.astify(cmd)
      console.log(JSON.stringify(ast, null, 2))
      let result: Result[] = []

      if (Array.isArray(ast)) {
      } else {
        if (ast.type === 'select') {
          result = await select(db, ast)
        }
      }
      if (result.length === 0) {
        callback(null, '0 record listed.')
      } else {
        console.table(result)
        callback(null, `${result.length} records listed.`)
      }
    } catch (e) {
      callback(e, null)
    }
  },
})
