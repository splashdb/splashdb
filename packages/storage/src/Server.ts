import * as http2 from 'http2'
import BSON from 'bson'
import varint from 'varint'
import { Http2ServerIterator, readBody } from '@splashdb/shared'
import { SplashDBServerOptions } from './Options'
import { DBManager } from './DBManager'

export class SplashDBServer {
  constructor(options?: SplashDBServerOptions) {
    this.options = {
      debug: false,
      secure: false,
      port: 8443,
      secureCert: '',
      secureKey: '',
      dbpath: '/data/db',
      ...options,
    }
    this.dbManager = new DBManager(this.options)
    console.log('[server] Splashdb starting...')
    this.start()
  }

  options: Required<SplashDBServerOptions>
  dbManager: DBManager

  server!: http2.Http2Server | http2.Http2SecureServer

  start = async (): Promise<void> => {
    const server = this.options.secure
      ? http2.createSecureServer({
          key: this.options.secureKey,
          cert: this.options.secureCert,
        })
      : http2.createServer()

    this.server = server

    server.on('error', (err) => console.error(err))

    server.on('session', (session) => {
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

    server.listen(this.options.port)
    console.log(`[server] listen on port ${this.options.port}`)

    for await (const { stream, headers, flags } of new Http2ServerIterator(
      server
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
      const dbmethod = headers['x-splashdb-method']
      const dbname = headers['x-splashdb-db']
      console.log(`time=${Date.now()} dbmethod=${dbmethod} dbname=${dbname}`)

      if (headers[':method'] === 'GET') {
        console.log('GET is not allowed')
        stream.respond({ ':status': 200 })
        return
      }

      if (typeof dbmethod !== 'string' || typeof dbname !== 'string') {
        console.log('dbmethod and dbname is required')
        stream.respond({ ':status': 400 })
        return
      }

      const body = await readBody(stream)
      const db = this.dbManager.getDB(dbname)
      const params = body.length >= 5 ? BSON.deserialize(Buffer.from(body)) : {}
      console.log('params', params)
      switch (dbmethod) {
        case 'iterator':
          let iteratorStreamWrite = false
          console.log('iterator start')
          for await (const result of db.iterator(params)) {
            console.log(result)
            try {
              const resultBuf = BSON.serialize(result)
              stream.write(Buffer.from(varint.encode(resultBuf.length)))
              stream.write(resultBuf)
              iteratorStreamWrite = true
            } catch (e) {
              break
            }
          }

          if (!iteratorStreamWrite) stream.write(Buffer.alloc(0))
          break
        case 'get':
          const result = await db.get(params.key)
          // console.log(`[server] get success`)
          if (!result) {
            stream.respond({
              ':status': 404,
            })
          } else {
            stream.write(result)
          }
          break
        case 'put':
          await db.put(params.key, params.value)
          stream.write(Buffer.alloc(0))
          break
        case 'del':
          await db.del(params.key)
          stream.write(Buffer.alloc(0))
          break
        default:
          stream.write(Buffer.alloc(0))
          if (this.options.debug) {
            console.log(
              `[server] unknown dbmethod ${dbmethod}, payload: `,
              params
            )
          }
          break
      }
    } catch (e) {
      console.log('error', e.message)
    } finally {
      stream.end()
      stream.close()
    }
  }

  async destroy(): Promise<void> {
    await this.dbManager.destroy()
    await new Promise((resolve) => {
      let resolved = false
      this.server.removeAllListeners()
      this.server.close(() => {
        if (!resolved) {
          resolved = true
          this.server.unref()
          resolve()
        }
      })
    })
  }
}
