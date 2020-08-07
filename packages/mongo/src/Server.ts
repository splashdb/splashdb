import http2 from 'http2'
import { SplashDBMongoOptions } from './SplashDBMongoOptions'
import { SplashdbClient } from '@splashdb/shared'

export class SplashDBMongoServer {
  constructor(options: SplashDBMongoOptions) {
    this.client = new SplashdbClient(options)
  }

  client: SplashdbClient
}
