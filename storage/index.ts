import fs from 'fs'
import path from 'path'
import { StorageServer } from './StorageServer'
import { StorageOptions } from './StorageOptions'

export async function main(): Promise<void> {
  const {
    DEBUG = 'false',
    SPLASHDB_SECURE = 'false',
    SPLASHDB_STORAGE_PORT = '8080',
    SPLASHDB_SECURE_KEY = '/run/secrets/splashdb-privkey.pem',
    SPLASHDB_SECURE_CERT = '/run/secrets/splashdb-cert.pem',
    SPLASHDB_DBPATH = '/data/db',
  } = process.env

  const options: StorageOptions = {
    debug: DEBUG === 'true',
    secure: SPLASHDB_SECURE === 'true',
    dbpath: path.resolve(process.cwd(), SPLASHDB_DBPATH),
    port: parseInt(SPLASHDB_STORAGE_PORT || '8080'),
  }
  if (options.secure) {
    options.secureKey = await fs.promises.readFile(SPLASHDB_SECURE_KEY)
    options.secureCert = await fs.promises.readFile(SPLASHDB_SECURE_CERT)
  }

  new StorageServer(options)
}

main()
