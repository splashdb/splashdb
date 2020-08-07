import http2 from 'http2'
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
  server!: http2.Http2SecureServer | http2.Http2Server

  async start(): Promise<void> {
    this.server = this.options.secure
      ? http2.createSecureServer()
      : http2.createSecureServer()

    this.server.listen(this.options.port)
  }
}
