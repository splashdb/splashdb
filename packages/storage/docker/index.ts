import fs from 'fs'
import path from 'path'
import { SplashDBServer, SplashDBServerOptions } from '../src'

export async function main(): Promise<void> {
  const secure = process.env.SPLASHDB_SECURE === 'true'
  const debug = process.env.DEBUG === 'true'
  const port = parseInt(process.env.SPLASHDB_PORT || '8080')
  const secureKeyFile =
    process.env.SPLASHDB_SECURE_KEY || '/run/secrets/splashdb-privkey.pem'
  const secureCertFile =
    process.env.SPLASHDB_SECURE_CERT || '/run/secrets/splashdb-cert.pem'

  const options: SplashDBServerOptions = {
    debug,
    secure,
    dbpath: process.env.SPLASHDB_DBPATH
      ? path.resolve(process.cwd(), process.env.SPLASHDB_DBPATH)
      : '/data/db',
    port,
  }
  if (options.secure) {
    options.secureKey = await fs.promises.readFile(secureKeyFile)
    options.secureCert = await fs.promises.readFile(secureCertFile)
  }

  console.log('[server] Splashdb starting...')
  new SplashDBServer(options)
}

main()
