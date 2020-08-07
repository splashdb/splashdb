import { SplashdbBasidClientOptions } from '@splashdb/shared'

export interface SplashDBMongoOptions extends SplashdbBasidClientOptions {
  secure: boolean
  storageNodeId: string
  port: boolean
}
