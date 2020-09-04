import * as http2 from 'http2'
import { Http2ServerIterator, Http2StreamIterator, readBody } from '../shared'
import BSON from 'bson'
import { MongoOptions } from './MongoOptions'
import { MongoAuthManager } from './MongoAuthManager'
import { MongoCommandHandler } from './MongoCommandHandler'

export class MongoServer {
  constructor(options: MongoOptions) {
    this.options = {
      secure: false,
      ...options,
    }
    this.handler = new MongoCommandHandler(options)
    this.authManager = new MongoAuthManager(this.options, this.handler)
    console.log('[server] Splashdb starting...')
    this.start()
  }

  authManager: MongoAuthManager
  options: MongoOptions
  handler: MongoCommandHandler
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
    try {
      const body = await readBody(stream)
      const params = BSON.deserialize(Buffer.from(body))
      const authorization = headers.authorization as string
      const dbname = headers['x-splashdb-db'] as string

      if (!(await this.authManager.can(authorization, params, dbname))) {
        stream.respond({
          ':status': 403,
        })
        stream.end('Forbidden')
        return
      }

      try {
        const result = await this.handler.runCommand(dbname, params)
        stream.write(BSON.serialize(result))
      } catch (e) {
        stream.write(BSON.serialize({ ok: 0 }))
      } finally {
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
