import http2 from 'http2'
import varint from 'varint'
import crypto from 'crypto'
import { BootBuffer } from 'bootbuffer'
import { SplashDBServerOptions } from './Options'
import { AuthManager } from './AuthManager'
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
      adminPassword: crypto.randomBytes(40).toString('hex'),
      ...options,
    }
    this.dbManager = new DBManager(this.options)
    this.authManager = new AuthManager(this.options, this.dbManager)
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

    server.on('stream', async (stream, headers) => {
      const authorization = headers.authorization
      const method = headers['x-splashdb-method']
      const dbname = headers['x-splashdb-db']
      if (headers[':method'] === 'GET') {
        stream.respond({
          ':status': 200,
        })
        stream.end('Splashdb')
        stream.close()
        return
      }
      if (typeof method !== 'string' || typeof dbname !== 'string') {
        stream.respond({
          ':status': 400,
        })
        stream.end('Bad Request')
        stream.close()
        return
      }
      if (!(await this.authManager.can(authorization, method, dbname))) {
        stream.respond({
          ':status': 403,
        })
        stream.end('Forbidden')
        stream.close()
        return
      }

      const db = this.dbManager.getDB(dbname)

      // console.log(`[server] ${method}`)
      if (method === 'iterator') {
        let iterator: AsyncIterableIterator<Buffer>
        let end = false
        let started = false
        // console.log('[server] start iterator')
        stream.once('data', async (chunk) => {
          // console.log(`[server] iterator on data`)
          if (started) return
          started = true
          const params: { [x: string]: any } = {}
          for (const entry of BootBuffer.readSync(
            typeof chunk === 'string' ? Buffer.from(chunk) : chunk
          )) {
            params[entry.key] = entry.value
          }
          // eslint-disable-next-line
          // @ts-ignore
          iterator = db.iterator(params)
          while (true) {
            if (end) {
              break
            }
            try {
              const next = await iterator.next()
              if (!end && next.done) {
                end = true
                // console.log('[server] reach end of db.iterator')
                stream.write(Buffer.alloc(0))
                stream.end()
                return
              }
              if (!end && !next.done) {
                // console.log('[server] push result to cilent')
                const bb = new BootBuffer()
                bb.add('key', Buffer.from(next.value.key))
                bb.add('value', Buffer.from(next.value.value))
                // debug
                // format: <Buffer bbLength(varint) bb(Buffer) >
                stream.write(Buffer.from(varint.encode(bb.buffer.length)))
                stream.write(bb.buffer)
              }
            } catch (e) {
              if (this.options.debug) {
                console.log(`[server]`, e)
              }
            }
          }
        })

        stream.on('end', () => {
          // console.log('[server] iterator request end')
          if (end) return
          end = true
          stream.write(Buffer.alloc(0))
          stream.end()
        })

        // console.log('[server] end of scope')
      } else {
        const cache: ArrayBuffer[] = []

        stream.on('data', (chunk) => {
          if (typeof chunk === 'string') {
            cache.push(new TextEncoder().encode(chunk))
          } else {
            cache.push(chunk)
          }
        })
        stream.on('end', async () => {
          const totalLength = cache.reduce((total, chunk) => {
            total += chunk.byteLength
            return total
          }, 0)
          const reqdata = new Uint8Array(totalLength)
          let prevChunkSize = 0
          for (const chunk of cache) {
            reqdata.set(new Uint8Array(chunk), prevChunkSize)
            prevChunkSize = chunk.byteLength
          }

          const params: { [x: string]: any } = {}
          for await (const entry of BootBuffer.read(Buffer.from(reqdata))) {
            params[entry.key] = entry.value
          }
          // console.log(method, params)

          if (method === 'get') {
            const result = await db.get(params.key)
            // console.log(`[server] get success`)
            if (!result) {
              stream.respond({
                ':status': 404,
              })
            } else {
              stream.write(result)
            }
          } else if (method === 'put') {
            // console.log(`[server] put success`)
            await db.put(params.key, params.value)
            stream.write(Buffer.alloc(0))
          } else if (method === 'del') {
            await db.del(params.key)
            stream.write(Buffer.alloc(0))
          } else {
            if (this.options.debug) {
              console.log(
                `[server] unknown method ${method}, payload: `,
                params
              )
            }
          }

          stream.end()
        })
      }
    })

    server.listen(this.options.port)
    if (this.options.debug) {
      console.log(`[server] listen on port ${this.options.port}`)
    }
    this.server = server
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
