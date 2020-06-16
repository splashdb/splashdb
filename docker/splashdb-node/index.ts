import fs from 'fs'
import { SplashDBServer, SplashDBServerOptions } from '../../src'

export default async function localNode(): Promise<() => Promise<void>> {
  const options: SplashDBServerOptions = {
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

  return async (): Promise<void> => {
    await server.destroy()
  }
}
