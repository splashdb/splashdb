import http2 from 'http2'
import { SplashDBServerOptions } from './Options'
import crypto from 'crypto'
import { AuthManager } from './AuthManager'
import { DBManager } from './DBManager'

export class SplashDBServer {
  constructor(options?: SplashDBServerOptions) {
    this.options = {
      secure: false,
      port: 8443,
      secureCert: '',
      secureKey: '',
      adminPassword: crypto.randomBytes(40).toString('hex'),
      ...options,
    }
    this.dbManager = new DBManager(this.options)
    this.authManager = new AuthManager(this.options)
    this.start()
  }

  options: Required<SplashDBServerOptions>
  authManager: AuthManager
  dbManager: DBManager

  server: http2.Http2Server | http2.Http2SecureServer

  start = (): void => {
    const server = this.options.secure
      ? http2.createSecureServer({
          key: this.options.secureKey,
          cert: this.options.secureCert,
        })
      : http2.createServer()

    server.on('error', (err) => console.error(err))

    server.on('session', (session) => {
      // console.log('[server] new session', session)
    })

    server.on('stream', (stream, headers) => {
      const authorization = headers.authorization
      const method = headers['x-splashdb-method']
      // console.log('[server] stream', { authorization, method })
      // stream.respond({
      //   'content-type': 'application/octet-stream',
      //   ':status': 200,
      // })
      stream.write(new TextEncoder().encode('i love u'))
      stream.end()
    })

    server.listen(this.options.port)
    console.log(`[server] listen on port ${this.options.port}`)
    this.server = server
  }

  destroy = async (): Promise<void> => {
    this.server.removeAllListeners()
    this.server.close()
    return
  }
}
