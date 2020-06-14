import fs from 'fs'
import path from 'path'
import { SplashDBServer, SplashDBServerOptions } from '../src'

export default async function localNode(): Promise<() => void> {
  const secure =
    !!process.env.SPLASHDB_SECURE_KEY && !!process.env.SPLASHDB_SECURE_CERT
  const options: SplashDBServerOptions = {
    secure,
  }
  if (secure) {
    options.secureKey = fs.readFileSync(
      path.resolve(process.cwd(), process.env.SPLASHDB_SECURE_KEY)
    )
    options.secureCert = fs.readFileSync(
      path.resolve(process.cwd(), process.env.SPLASHDB_SECURE_CERT)
    )
  }
  const server = new SplashDBServer(options)

  return (): void => {
    server.destroy()
  }
}
