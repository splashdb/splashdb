import fs from 'fs'
import { SplashDBMongoServer, SplashDBMongoOptions } from '@splashdb/mongo'

export async function main(): Promise<void> {
  const debug = process.env.DEBUG === 'true'
  const options: SplashDBMongoOptions = {
    debug,
    pdUrl: await fs.promises.readFile(
      process.env.SPLASHDB_PD_URL || '/run/secrets/splashdb-pd-url',
      'utf8'
    ),
    secure: process.env.SPLASHDB_SECURE === 'true',
    adminPassword: await fs.promises.readFile(
      process.env.SPLASHDB_MONGO_PASSWORD ||
        '/run/secrets/splashdb-admin-password',
      'utf8'
    ),
    port: process.env.SPLASHDB_PORT
      ? parseInt(process.env.SPLASHDB_PORT)
      : 8543,
  }
  if (options.secure) {
    options.secureKey = await fs.promises.readFile(
      process.env.SPLASHDB_MONGO_KEY || '/run/secrets/splashdb-privkey.pem'
    )
    options.secureCert = await fs.promises.readFile(
      process.env.SPLASHDB_MONGO_CERT || '/run/secrets/splashdb-cert.pem'
    )
  }

  console.log('[server] Splashdb starting...')
  new SplashDBMongoServer(options)
}

main()
