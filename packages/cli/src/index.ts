import { SplashdbClient } from '@splashdb/client'
import { argv } from 'yargs'
import path from 'path'
import fs from 'fs'

async function main(): Promise<void> {
  console.log(argv)
  const command = argv._[0]
  if (!command) {
    console.log('commands: dump, restore')
    return
  }

  if (!process.env.SPLASHDB_URI) {
    throw new Error('env SPLASHDB_URI is required.')
  }

  let ca = undefined
  if (process.env.SPLASHDB_SECURE_CERT) {
    ca = await fs.promises.readFile(process.env.SPLASHDB_SECURE_CERT, 'utf8')
  }
  const db = new SplashdbClient({
    uri: process.env.SPLASHDB_URI,
    ca,
  })

  if (command === 'dump') {
    const dumpPath = argv._[1]
    if (!dumpPath) {
      console.log('no dump path')
      return
    }

    const dumpPathAbsolute = path.resolve(process.cwd(), dumpPath)
    await fs.promises.mkdir(dumpPathAbsolute, { recursive: true })

    let index = 0
    for await (const entry of db.iterator()) {
      await fs.promises.writeFile(
        path.resolve(dumpPathAbsolute, `./${index}.json`),
        JSON.stringify([entry.key, entry.value])
      )
      index++
    }
    console.log(`dump success`)
  } else if (command === 'restore') {
    const dumpPath = argv._[1]
    if (!dumpPath) {
      console.log('no dump path')
      return
    }

    const dumpPathAbsolute = path.resolve(process.cwd(), dumpPath)

    let index = 0
    while (true) {
      try {
        const content = await fs.promises.readFile(
          path.resolve(dumpPathAbsolute, `./${index}.json`),
          'utf8'
        )
        const json = JSON.parse(content)
        await db.put(Buffer.from(json[0].data), Buffer.from(json[1].data))
        index++
      } catch (e) {
        if (e.message.startsWith('ENOENT:')) {
          console.log(`restore success, total: ${index + 1}`)
        } else {
          console.log(`Restore failed, current:${index + 1}, err: `, e)
        }
        break
      }
    }
  } else {
    console.log(`unknown command: ${command}`)
  }

  process.exit(0)
}

main()
