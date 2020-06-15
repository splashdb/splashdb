import http2 from 'http2'
import { SplashDBServerOptions } from './Options'
import crypto from 'crypto'
import { AuthManager } from './AuthManager'
import { DBManager } from './DBManager'
import { BootBuffer } from 'bootbuffer'

export class SplashDBServer {
  constructor(options?: SplashDBServerOptions) {
    this.options = {
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
      // console.log('[server] new session', session)
    })

    server.on('stream', async (stream, headers) => {
      const authorization = headers.authorization
      const method = headers['x-splashdb-method']
      const dbname = headers['x-splashdb-db']
      if (typeof method !== 'string' || typeof dbname !== 'string') {
        return stream.respond({
          ':status': 400,
        })
      }
      if (!(await this.authManager.can(authorization, method, dbname))) {
        return stream.respond({
          ':status': 403,
        })
      }

      const db = this.dbManager.getDB(dbname)

      console.log(`[server] ${method}`)
      if (method === 'iterator') {
        console.log('[server] start iterator')
        let iterator: AsyncIterableIterator<Buffer>
        let end = false
        let started = false
        stream.on('data', async (chunk) => {
          if (started) return
          started = true
          const params: { [x: string]: any } = {}
          for await (const entry of BootBuffer.read(
            typeof chunk === 'string' ? Buffer.from(chunk) : chunk
          )) {
            params[entry.key] = entry.value
          }
          // eslint-disable-next-line
          // @ts-ignore
          iterator = db.iterator(params)
          while (true) {
            const next = await iterator.next()
            if (!end && next.done) {
              end = true
              stream.write(Buffer.alloc(0))
              stream.end()
              return
            }
            if (!end && !next.done) {
              const bb = new BootBuffer()
              bb.add('key', next.value.key)
              bb.add('value', next.value.value)
              stream.write(bb.buffer)
            }
          }
        })

        stream.on('end', () => {
          if (end) return
          end = true
          stream.write(Buffer.alloc(0))
          stream.end()
        })
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
          }
          // console.log(`[server] ${method} success`)

          stream.end()
        })
      }
    })

    server.listen(this.options.port)
    // console.log(`[server] listen on port ${this.options.port}`)
    this.server = server
  }

  destroy = async (): Promise<void> => {
    await this.dbManager.destroy()
    await new Promise((resolve) => {
      this.server.removeAllListeners()
      this.server.close(() => {
        // console.log('[server] server close')
        resolve()
      })
    })
  }
}
