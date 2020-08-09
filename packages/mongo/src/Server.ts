import * as http2 from 'http2'
import { SplashDBMongoOptions } from './SplashDBMongoOptions'
import { Http2ServerIterator } from '@splashdb/shared'
import { AuthManager } from './AuthManager'
import { SplashdbClientMogno } from './SplashDBMongoClient'

export class SplashDBMongoServer {
  constructor(options: SplashDBMongoOptions) {
    this.options = {
      secure: false,
      ...options,
    }
    this.client = new SplashdbClientMogno(options)
    this.authManager = new AuthManager(this.options, this.client)
    this.start()
  }

  authManager: AuthManager
  options: SplashDBMongoOptions
  client: SplashdbClientMogno
  server!: http2.Http2SecureServer | http2.Http2Server

  async start(): Promise<void> {
    this.server = this.options.secure
      ? http2.createSecureServer()
      : http2.createServer()
    this.server.on('error', (err) => console.error(err))

    this.server.on('session', (session) => {
      // if (!(await this.authManager.can(authorization, method, dbname))) {
      //   stream.respond({
      //     ':status': 403,
      //   })
      //   stream.end('Forbidden')
      //   stream.close()
      //   return
      // }

      console.log(session.socket.localAddress)
      console.log(session.socket.remoteAddress)

      if (this.options.debug) {
        console.log(`[server] new session`)
      }

      session.on('error', (e) => {
        if (this.options.debug) {
          console.log(`[splashdb] session emit error`, e)
        }
        session.close()
      })
      session.on('goaway', (e) => {
        if (this.options.debug) {
          console.log(`[splashdb] session emit goaway`, e)
        }
        session.close()
      })
    })
    this.server.listen(this.options.port)

    for await (const { stream, headers, flags } of new Http2ServerIterator(
      this.server
    ).iterator()) {
      this.handleStream(stream, headers, flags)
    }

    console.error(new Error('Server broken'))
  }

  async handleStream(
    stream: http2.ServerHttp2Stream,
    headers: http2.IncomingHttpHeaders,
    flags: number
  ): Promise<void> {
    // TODO check authority
    return
  }
}
