import {
  Http2SecureServer,
  Http2Server,
  createSecureServer,
  createServer,
} from 'http2'
import { SplashDBMongoOptions } from './SplashDBMongoOptions'
import { SplashdbClient } from '@splashdb/shared'

export class SplashDBMongoServer {
  constructor(options: SplashDBMongoOptions) {
    this.options = options
    this.client = new SplashdbClient(options)
    this.start()
  }

  options: SplashDBMongoOptions
  client: SplashdbClient
  server!: Http2SecureServer | Http2Server

  async start(): Promise<void> {
    this.server = this.options.secure ? createSecureServer() : createServer()

    this.server.listen(this.options.port)
  }
}
