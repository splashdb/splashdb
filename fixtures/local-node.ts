import fs from 'fs'
import path from 'path'
import { SplashDBServer, SplashDBServerOptions } from '../src'

export default async function localNode(): Promise<() => Promise<void>> {
  const secure =
    !!process.env.SPLASHDB_SECURE_KEY && !!process.env.SPLASHDB_SECURE_CERT
  const options: SplashDBServerOptions = {
    debug: true,
    adminPassword: process.env.SPLASHDB_ADMIN_PASSWORD,
    secure,
  }
  if (secure) {
    options.secureKey = fs.readFileSync(
      path.resolve(process.cwd(), process.env.SPLASHDB_SECURE_KEY)
    )
    options.secureCert = fs.readFileSync(
      path.resolve(process.cwd(), process.env.SPLASHDB_SECURE_CERT)
    )
    options.dbpath = path.resolve(process.cwd(), process.env.SPLASHDB_DBPATH)
  }
  try {
    fs.unlinkSync(options.dbpath)
  } catch (e) {}
  const server = new SplashDBServer(options)

  return async (): Promise<void> => {
    await server.destroy()
  }
}
