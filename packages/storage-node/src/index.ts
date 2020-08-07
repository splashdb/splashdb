import fs from 'fs'
import { SplashDBServer, SplashDBServerOptions } from '@splashdb/storage'

export default async function main(): Promise<void> {
  const debug = process.env.DEBUG === 'true'
  const options: SplashDBServerOptions = {
    debug,
    secure: process.env.SPLASHDB_SECURE === 'true',
    dbpath: '/data/db',
    adminPassword: await fs.promises.readFile(
      '/run/secrets/splashdb-admin-password',
      'utf8'
    ),
    port: process.env.SPLASHDB_PORT
      ? parseInt(process.env.SPLASHDB_PORT)
      : 8443,
  }
  if (options.secure) {
    options.secureKey = await fs.promises.readFile(
      '/run/secrets/splashdb-privkey.pem'
    )
    options.secureCert = await fs.promises.readFile(
      '/run/secrets/splashdb-cert.pem'
    )
  }

  console.log('[server] Splashdb starting...')
  new SplashDBServer(options)
}

main()
