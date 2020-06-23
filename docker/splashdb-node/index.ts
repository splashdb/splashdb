import fs from 'fs'
import { SplashDBServer, SplashDBServerOptions } from '../../src'

export default async function main(): Promise<() => Promise<void>> {
  const debug = process.env.DEBUG === 'true'
  const options: SplashDBServerOptions = {
    debug,
    secure: !!process.env.SPLASHDB_SECURE,
    dbpath: '/data/db',
    adminPassword: fs.readFileSync(
      '/run/secrets/splashdb-admin-password',
      'utf8'
    ),
    port: process.env.SPLASHDB_PORT
      ? parseInt(process.env.SPLASHDB_PORT)
      : 8443,
  }
  if (options.secure) {
    options.secureKey = fs.readFileSync('/run/secrets/splashdb-privkey.pem')
    options.secureCert = fs.readFileSync('/run/secrets/splashdb-cert.pem')
  }

  const server = new SplashDBServer(options)
  console.log('[server] Splashdb starting...')

  return async (): Promise<void> => {
    await server.destroy()
  }
}

main()
