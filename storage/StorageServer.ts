import * as http2 from 'http2'
import BSON from 'bson'
import varint from 'varint'
import { Http2ServerIterator, readBody } from '../shared'
import { StorageOptions } from './StorageOptions'
import { StorageDBManager } from './StorageDBManager'

export class StorageServer {
  constructor(options?: StorageOptions) {
    this.options = {
      debug: false,
      secure: false,
      port: 8443,
      secureCert: '',
      secureKey: '',
      dbpath: '/data/db',
      ...options,
    }
    this.dbManager = new StorageDBManager(this.options)
    console.log('[server] Splashdb starting...')
    this.start()
  }

  options: Required<StorageOptions>
  dbManager: StorageDBManager

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

    for await (const { stream, headers } of new Http2ServerIterator(
      server
    ).iterator()) {
      this.handleStream(stream, headers)
    }

    console.error(new Error('Server broken'))
  }

  async handleStream(
    stream: http2.ServerHttp2Stream,
    headers: http2.IncomingHttpHeaders
  ): Promise<void> {
    try {
      const dbmethod = headers['x-splashdb-method'] as string
      const dbname = headers['x-splashdb-db'] as string

      if (headers[':method'] === 'GET') {
        stream.respond({ ':status': 404 })
        return
      }

      if (
        !['iterator', 'get', 'put', 'del'].includes(dbmethod) ||
        typeof dbname !== 'string'
      ) {
        stream.respond({ ':status': 400 })
        return
      }

      const body = await readBody(stream)
      if (body.length < 5) {
        stream.respond({ ':status': 400 })
        return
      }
      const params = BSON.deserialize(Buffer.from(body))
      const db = this.dbManager.getDB(dbname)
      switch (dbmethod) {
        case 'iterator':
          let iteratorStreamWrite = false
          let error = null
          let count = 0
          for await (const result of db.iterator(params)) {
            count++
            try {
              const resultBuf = BSON.serialize(result)
              stream.write(Buffer.from(varint.encode(resultBuf.length)))
              stream.write(resultBuf)
              iteratorStreamWrite = true
            } catch (e) {
              error = e
              break
            }
          }
          console.log(
            `iterator ${dbname} ${count} result`,
            error ? `(with error ${error.message})` : ''
          )

          if (!iteratorStreamWrite) stream.write(Buffer.alloc(0))
          break
        case 'get':
          const result = await db.get(params.key)

          if (!result) {
            console.log(`get ${dbname} null`)
            stream.respond({
              ':status': 404,
            })
          } else {
            console.log(`get ${dbname} ${params.key}`)
            stream.write(result)
          }
          break
        case 'put':
          console.log(`put ${dbname}`, params.key)
          await db.put(params.key, params.value.buffer)
          stream.write(Buffer.alloc(0))
          break
        case 'del':
          console.log(`del ${dbname} ${params.key}`)
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
