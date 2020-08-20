import fs from 'fs'
import { SplashDBMongoServer, SplashDBMongoOptions } from '../src'

export async function main(): Promise<void> {
  const {
    DEBUG = 'false',
    SPLASHDB_SECURE = 'false',
    SPLASHDB_PD_URL = '/run/secrets/splashdb-pd-url',
    SPLASHDB_MONGO_PASSWORD = '/run/secrets/splashdb-admin-password',
    SPLASHDB_MONGO_KEY = '/run/secrets/splashdb-privkey.pem',
    SPLASHDB_MONGO_CERT = '/run/secrets/splashdb-cert.pem',
    SPLASHDB_PORT = '8543',
  } = process.env

  const options: SplashDBMongoOptions = {
    debug: DEBUG === 'true',
    pdUrl: await fs.promises.readFile(SPLASHDB_PD_URL, 'utf8'),
    secure: SPLASHDB_SECURE === 'true',
    adminPassword: await fs.promises.readFile(SPLASHDB_MONGO_PASSWORD, 'utf8'),
    port: parseInt(SPLASHDB_PORT),
  }
  if (options.secure) {
    options.secureKey = await fs.promises.readFile(SPLASHDB_MONGO_KEY)
    options.secureCert = await fs.promises.readFile(SPLASHDB_MONGO_CERT)
  }

  new SplashDBMongoServer(options)
}

main()
