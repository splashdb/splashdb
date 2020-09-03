import repl from 'repl'
import { Context } from 'vm'
import { DatabaseSQL } from './Database'
import { argv } from 'yargs'
import path from 'path'

const dbpath = typeof argv.dbpath === 'string' ? argv.dbpath : './db'
const db = new DatabaseSQL(path.resolve(process.cwd(), dbpath))

repl.start({
  prompt: '> ',
  eval: async (
    cmd: string,
    context: Context,
    filename: string,
    callback
  ): Promise<void> => {
    try {
      const result = await db.query(cmd)
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
