import { SplashdbStorageClientOptions } from '@splashdb/shared'

export interface SplashDBMongoOptions extends SplashdbStorageClientOptions {
  debug?: boolean
  secure?: boolean
  secureKey?: string | Buffer
  secureCert?: string | Buffer
  port?: number
  adminPassword: string
  pdUrl: string
}
