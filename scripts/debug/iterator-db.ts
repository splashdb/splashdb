import path from 'path'
import { Database } from 'rippledb'

const dbname = './.db/accounts'

async function main(): Promise<void> {
  const db = new Database(path.resolve(process.cwd(), dbname))
  for await (const entry of db.iterator()) {
    console.log(new TextDecoder().decode(entry.key))
  }
  console.log('finish')
}

main()
