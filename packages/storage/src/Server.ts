import * as http2 from 'http2'
import varint from 'varint'
import { BootBuffer } from 'bootbuffer'
import { SplashDBServerOptions } from './Options'
import { DBManager } from './DBManager'
import { Http2ServerIterator, Http2StreamIterator } from '@splashdb/shared'
import { Database } from 'rippledb'

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
      const method = headers['x-splashdb-method']
      const dbname = headers['x-splashdb-db']

      if (headers[':method'] === 'GET') {
        stream.respond({
          ':status': 200,
        })
        // console.log(`time=${Date.now()} renderHtml=true`)
        return
      }

      // console.log(`time=${Date.now()} method=${method} dbname=${dbname}`)

      if (typeof method !== 'string' || typeof dbname !== 'string') {
        stream.respond({
          ':status': 400,
        })
        return
      }

      const db = this.dbManager.getDB(dbname)

      if (method === 'iterator') {
        this.handleIterator(db, stream)
      } else {
        const params = await this.parseTotalParams(stream)
        if (params) {
          switch (method) {
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
              if (this.options.debug) {
                console.log(
                  `[server] unknown method ${method}, payload: `,
                  params
                )
              }
              break
          }
        }
      }
    } catch (e) {
      console.log(e.message)
    } finally {
      stream.end()
      stream.close()
    }
  }

  async parseTotalParams(
    stream: http2.ServerHttp2Stream
  ): Promise<{ [x: string]: string } | void> {
    try {
      const cache: ArrayBuffer[] = []
      for await (const { chunk } of new Http2StreamIterator(
        stream
      ).iterator()) {
        if (typeof chunk === 'string') {
          cache.push(new TextEncoder().encode(chunk))
        } else {
          cache.push(chunk)
        }
      }
      const totalLength = cache.reduce((total, chunk) => {
        total += chunk.byteLength
        return total
      }, 0)
      const reqdata = new Uint8Array(totalLength)
      let prevChunkSize = 0
      for (const chunk of cache) {
        reqdata.set(new Uint8Array(chunk), prevChunkSize)
        prevChunkSize += chunk.byteLength
      }

      const params: { [x: string]: any } = {}
      for await (const entry of BootBuffer.read(Buffer.from(reqdata))) {
        params[entry.key] = entry.value
      }
      return params
    } catch (e) {
      console.log('parse total params fail: ', e.message)
    }
  }

  async handleIterator(
    db: Database,
    stream: http2.ServerHttp2Stream
  ): Promise<void> {
    let iteratorCreated = false
    let streamWrite = false
    for await (const { chunk } of new Http2StreamIterator(stream).iterator()) {
      if (iteratorCreated) {
        break
      }
      const params: { [x: string]: any } = {}
      for (const entry of BootBuffer.readSync(
        typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      )) {
        params[entry.key] = entry.value
      }

      const iterator = db.iterator(params)
      iteratorCreated = true
      for await (const result of iterator) {
        const bb = new BootBuffer()
        bb.add('key', Buffer.from(result.key))
        bb.add('value', Buffer.from(result.value))
        // debug
        // format: <Buffer bbLength(varint) bb(Buffer) >
        stream.write(Buffer.from(varint.encode(bb.buffer.length)))
        stream.write(bb.buffer)
        streamWrite = true
      }
      break
    }

    if (!streamWrite) stream.write(Buffer.alloc(0))
    stream.end()
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
