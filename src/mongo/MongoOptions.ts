import { SplashdbStorageClientOptions } from '../StorageClient'

export interface MongoOptions extends SplashdbStorageClientOptions {
  debug?: boolean
  secure?: boolean
  secureKey?: string | Buffer
  secureCert?: string | Buffer
  port?: number
  adminPassword: string
  pdUrl: string
}
