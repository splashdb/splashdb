import * as http2 from 'http2'
import { Http2ServerIterator, Http2StreamIterator } from '@splashdb/shared'
import BSON from 'bson'
import { SplashDBMongoOptions } from './SplashDBMongoOptions'
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

    this.server.on('session', async (session) => {
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
    const authorization = headers.authorization
    const dbname = headers['x-splashdb-db']
    const command = headers['x-splashdb-mongo-command'] as string

    if (typeof command !== 'string' || typeof dbname !== 'string') {
      stream.respond({
        ':status': 400,
      })
      stream.end('Bad request')
      stream.close()
      return
    }

    if (!(await this.authManager.can(authorization, command, dbname))) {
      stream.respond({
        ':status': 403,
      })
      stream.end('Forbidden')
      stream.close()
      return
    } else {
      console.log('auth check ✓')
    }

    const caches: Buffer[] = []
    for await (const data of new Http2StreamIterator(stream).iterator()) {
      if (typeof data.chunk === 'string') {
        caches.push(Buffer.from(data.chunk))
      } else {
        caches.push(data.chunk)
      }
    }
    const requestBody = Buffer.concat(caches)
    console.log('requests body ✓')
    console.log(`command: ${command}`)

    try {
      if (command === 'query') {
        const params = BSON.deserialize(requestBody)
        console.log(`params: `, params)
        const result = await this.client.find(dbname, params)
        console.log(`result ✓`)
        if (result) {
          stream.write(BSON.serialize(result))
        }
        stream.end()
      }
    } catch (e) {
      stream.respond({
        ':status': 500,
      })
      stream.end('InternalServerError')
    } finally {
      stream.close()
    }
  }
}
