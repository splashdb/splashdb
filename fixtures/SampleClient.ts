import http2 from 'http2'
import fs from 'fs'
import path from 'path'
import { BootBuffer } from 'bootbuffer'
import varint from 'varint'

type SplashDBIteratorResult = {
  key: Buffer
  value: Buffer
}

export class SplashdbSampleClient {
  constructor(options?: { db: string }) {
    this.options = { db: 'system', ...options }
    this.authorization =
      'Basic YWRtaW46MThkMGMwNGU0NjM5YjBhNGNlOGVkYTk1MzcxM2M5NzAxMDcyMWM0YTMxNDA4ZTYzMzJjODM1NmQ4ZWJmZWVmNWE4N2VjNGJlNDIyNDM3NzU='
    const ca = fs.readFileSync(
      path.resolve(process.cwd(), process.env.SPLASHDB_SECURE_CERT)
    )
    this.session = http2.connect('https://localhost:8443', {
      ca,
    })

    this.connectingPromise = new Promise((resolve, reject) => {
      this.session.once('connect', () => {
        resolve()
      })

      this.session.once('error', (err) => {
        console.error('SplashdbSampleClientGotError: ', err)
        reject(err)
      })
    })
  }

  options: { db: string }
  authorization: string
  session: http2.ClientHttp2Session
  connectingPromise: Promise<void>

  async ok(): Promise<void> {
    await this.connectingPromise
  }

  /**
   * In real-world Splashdb Client, request method could
   * return AsyncIterableIterator for better performance.
   */
  async request(method: string, requestBuffer: Buffer): Promise<Uint8Array> {
    if (this.session.connecting) {
      await this.ok()
    }
    return await new Promise((resolve, reject) => {
      let handled = false
      const cache: Buffer[] = []

      // console.time(`[client] ${method} request`)
      const req = this.session.request({
        // GET / DELETE methods cannot use req.write
        ':method': 'POST',
        authorization: this.authorization,
        'x-splashdb-version': '1.0',
        'x-splashdb-db': this.options.db,
        'x-splashdb-method': method,
      })

      req.on('response', (headers, flags) => {
        const status = headers[':status']
        if (status !== 200) {
          handled = true
          if (status === 404) {
            // console.timeEnd(`[client] ${method} request`)
            return resolve(null)
          }
          reject(new Error(`HTTP_ERROR_${headers[':status']}`))
        }
        if (method === 'put' || method === 'del') {
          handled = true
          // console.log(`[client] ${method} get response`)
          console.timeEnd(`[client] ${method} request`)
          resolve()
        }
      })

      req.on('data', (chunk) => {
        if (handled) return
        if (typeof chunk === 'string') {
          cache.push(Buffer.from(chunk))
        } else {
          cache.push(chunk)
        }
      })

      req.once('end', () => {
        if (handled) return
        console.timeEnd(`[client] ${method} request`)
        const totalLength = cache.reduce((total, chunk) => {
          total += chunk.byteLength
          return total
        }, 0)
        const result = new Uint8Array(totalLength)
        let prevChunkSize = 0
        for (const chunk of cache) {
          result.set(chunk, prevChunkSize)
          prevChunkSize = chunk.byteLength
        }
        handled = true
        resolve(result)
        req.close()
      })

      req.write(requestBuffer)
      req.end()
    })
  }

  buildPayload(params: {
    [x: string]: Buffer | Uint8Array | string | number | boolean
  }): Buffer {
    const bb = new BootBuffer()
    for (const key in params) {
      bb.add(key, params[key])
    }

    return bb.buffer
  }

  async get(key: string | Buffer): Promise<Uint8Array> {
    const result = await this.request(
      'get',
      this.buildPayload({
        key,
      })
    )
    return result
  }

  async put(key: string | Buffer, value: string | Buffer): Promise<void> {
    await this.request(
      'put',
      this.buildPayload({
        key,
        value,
      })
    )
    return
  }

  async del(key: string | Buffer): Promise<void> {
    await this.request(
      'del',
      this.buildPayload({
        key,
      })
    )
    return
  }

  async *iterator(
    iteratorOption: { start?: string | Buffer; reverse?: boolean } = {}
  ): AsyncIterableIterator<SplashDBIteratorResult> {
    if (this.session.connecting) {
      await this.ok()
    }
    type SplashDBIterator = { value: SplashDBIteratorResult; done: boolean }
    const cache: SplashDBIteratorResult[] = []
    const queue: {
      resolve: (ite: SplashDBIterator) => void
      reject: (reason?: any) => void
    }[] = []
    let ended = false
    // let started = false

    const req = this.session.request({
      // GET / DELETE methods cannot use req.write
      ':method': 'POST',
      authorization: this.authorization,
      'x-splashdb-version': '1.0',
      'x-splashdb-db': this.options.db,
      'x-splashdb-method': 'iterator',
    })

    req.on('response', (headers, flags) => {
      const status = headers[':status']
      if (status !== 200) {
        throw new Error(`HTTP_ERROR_${headers[':status']}`)
      }
    })

    req.on('data', async (chunk) => {
      if (ended) return
      // console.log(chunk)
      const chunkBuf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk

      let chunkReadBytes = 0
      const chunkSize = chunkBuf.length
      while (true) {
        if (chunkReadBytes >= chunkSize) break
        const bbLength = varint.decode(chunkBuf, chunkReadBytes)
        chunkReadBytes += varint.decode.bytes
        const bbBuf = chunkBuf.slice(chunkReadBytes, chunkReadBytes + bbLength)
        const result = {} as SplashDBIteratorResult
        for await (const entry of BootBuffer.read(bbBuf)) {
          result[entry.key] = entry.value
        }
        if (queue.length > 0) {
          const promise = queue.shift()
          // console.log('[client] got data, shift queue, set done: false')
          promise.resolve({ value: result, done: false })
        } else {
          // console.log('[client] got data, add to cache')
          cache.push(result)
        }
        chunkReadBytes += bbLength
      }
    })

    req.once('end', () => {
      ended = true
      // console.log('[client] req end')
      if (queue.length > 0) {
        const promise = queue.shift()
        // console.log('[client] req end clean queue', queue.length)
        promise.resolve({ done: true, value: undefined })
      } else {
        // console.log(`[client] queue is empty`)
      }
      req.close()
    })

    const payload = this.buildPayload(iteratorOption)
    req.write(payload)

    const reqReadIterator: AsyncIterable<SplashDBIteratorResult> = {
      [Symbol.asyncIterator]() {
        return {
          return: async (): Promise<IteratorResult<SplashDBIteratorResult>> => {
            // console.log(`[client] return called`)
            try {
              const value = cache.shift()
              return Promise.resolve({ done: true, value })
            } catch (e) {
              return Promise.resolve({ done: true, value: e })
            } finally {
              req.end()
            }
          },
          next: (): Promise<IteratorResult<SplashDBIteratorResult>> => {
            // console.log(`[client] next called`)
            // if (!started) {
            //   console.log(`[client] next called not started`)
            //   started = true
            //   console.log(`[client] next called at first next()`)
            //   req.write(payload)
            //   console.log(`[client] next called add to queue  `)
            //   return new Promise((resolve, reject) => {
            //     queue.push({ resolve, reject })
            //   })
            // }
            const result = cache.shift()
            if (result) {
              // console.log(`[client] next called resolve result`)

              return Promise.resolve({ value: result, done: false })
            } else if (ended) {
              // console.log(`[client] next called return done`)
              return Promise.resolve({ value: undefined, done: true })
            } else {
              // console.log(`[client] next called add to queue`)

              return new Promise((resolve, reject) => {
                queue.push({ resolve, reject })
              })
            }
          },
        }
      },
    }

    yield* reqReadIterator
  }

  async destroy(): Promise<void> {
    await new Promise((resolve) => {
      let resolved = false
      this.session.close(() => {
        if (!resolved) {
          resolved = true
          resolve()
        }
      })
    })
  }
}
