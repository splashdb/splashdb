import path from 'path'
import { DBRepairer } from 'rippledb'

const dbname = './.db/system'

async function main(): Promise<void> {
  const repairer = new DBRepairer(path.resolve(process.cwd(), dbname))
  await repairer.run()
  console.log('repair finish')
}

main()
