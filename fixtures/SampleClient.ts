import http2 from 'http2'
import fs from 'fs'
import path from 'path'
import { BootBuffer } from 'bootbuffer'
import varint from 'varint'

type SplashDBIteratorResult = {
  key: Buffer
  value: Buffer
}

function isBrokenError(e: Error): boolean {
  if (e.message.indexOf('ETIMEDOUT') > -1) return true
  if (e.message.indexOf('GOAWAY') > -1) return true
  return false
}

export class SplashdbSampleClient {
  constructor(options?: { db: string; debug: boolean }) {
    this.options = { db: 'system', debug: true, ...options }
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
        console.log('connected')
        resolve()
      })

      this.session.once('error', (err) => {
        reject(err)
      })
    })
  }

  options: { db: string; debug: boolean }
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
      const stream = this.session.request({
        // GET / DELETE methods cannot use req.write
        ':method': 'POST',
        authorization: this.authorization,
        'x-splashdb-version': '1.0',
        'x-splashdb-db': this.options.db,
        'x-splashdb-method': method,
      })

      stream.on('response', (headers, flags) => {
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
          // console.timeEnd(`[client] ${method} request`)
          resolve()
        }
      })

      stream.on('data', (chunk) => {
        console.log(chunk)
        if (handled) return
        if (typeof chunk === 'string') {
          cache.push(Buffer.from(chunk))
        } else {
          cache.push(chunk)
        }
      })

      stream.once('end', () => {
        console.log('request stream end')
        if (handled) return
        // console.timeEnd(`[client] ${method} request`)
        const totalLength = cache.reduce((total, chunk) => {
          total += chunk.byteLength
          return total
        }, 0)
        const result = new Uint8Array(totalLength)
        let prevChunkSize = 0
        for (const chunk of cache) {
          result.set(chunk, prevChunkSize)
          prevChunkSize += chunk.byteLength
        }
        handled = true
        resolve(result)
        stream.close()
      })

      stream.write(requestBuffer)
      stream.end()
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
    // const debug = this.options.debug
    if (this.session.connecting) {
      await this.ok()
    }
    type SplashDBIterator = { value: SplashDBIteratorResult; done: boolean }
    const cache: (SplashDBIteratorResult | Error)[] = []
    const queue: {
      resolve: (ite: SplashDBIterator) => void
      reject: (reason?: any) => void
    }[] = []
    let ended = false

    /**
     * ISSUE #2 https://github.com/splashdb/client/issues/2
     * ServerHttp2Stream buffer the write data, so client
     * sometime will not receive a complete BootBuffer
     * format stream response. Client should cache stream data.
     */
    let cachedBuffer = Buffer.alloc(0)

    const readCached = (newBuf: Buffer): void => {
      if (cachedBuffer.length === 0) {
        cachedBuffer = newBuf
      } else {
        cachedBuffer = Buffer.concat([cachedBuffer, newBuf])
      }

      const cachedBufferSize = cachedBuffer.length
      // read cached buffer from zero every time
      // and after read, shift the part have read
      let cachedBufferReadSize = 0
      while (true) {
        if (cachedBufferReadSize >= cachedBufferSize) {
          cachedBuffer = Buffer.alloc(0)
          break
        }
        let bbSize = 0
        try {
          bbSize = varint.decode(cachedBuffer, cachedBufferReadSize)
        } catch (e) {
          // varint broken because uncomplete response
          // handle at next time
          cachedBuffer = cachedBuffer.slice(cachedBufferReadSize)
          break
        }
        const endPosition = cachedBufferReadSize + bbSize + varint.decode.bytes
        if (endPosition > cachedBufferSize) {
          // uncomplete response
          // handle at next time
          cachedBuffer = cachedBuffer.slice(cachedBufferReadSize)
          break
        }
        cachedBufferReadSize += varint.decode.bytes
        const bbBuf = cachedBuffer.slice(cachedBufferReadSize, endPosition)
        cachedBufferReadSize += bbSize

        const result = {} as SplashDBIteratorResult
        try {
          for (const entry of BootBuffer.readSync(bbBuf)) {
            result[entry.key] = entry.value
          }
        } catch (e) {
          if (this.options.debug) {
            console.log(
              `[splash client] bbbuffer read failed, so result may be empty`,
              e.message
            )
          }
          // stop request with error
          ended = true
          req.end()
          if (queue.length > 0) {
            const promise = queue.shift()
            promise.reject(e)
          } else {
            cache.push(e)
          }
          return
        }

        // read success
        if (queue.length > 0) {
          const promise = queue.shift()
          promise.resolve({ value: result, done: false })
        } else {
          cache.push(result)
        }
      }
    }

    const req = this.session.request({
      // GET / DELETE methods cannot use req.write
      ':method': 'POST',
      authorization: this.authorization,
      'x-splashdb-version': '1.0',
      'x-splashdb-db': this.options.db,
      'x-splashdb-method': 'iterator',
    })

    req.once('response', (headers, flags) => {
      const status = headers[':status']
      if (status !== 200) {
        const error = new Error(`HTTP_ERROR_${headers[':status']}`)

        ended = true
        req.end()
        if (queue.length > 0) {
          const promise = queue.shift()
          promise.reject(error)
        } else {
          cache.push(error)
        }
      }
    })

    req.on('data', async (chunk) => {
      if (ended) return
      readCached(Buffer.from(chunk))
    })

    req.once('error', (e) => {
      if (isBrokenError(e)) {
        this.session.close()
      }
      ended = true
      req.end()
      if (queue.length > 0) {
        const promise = queue.shift()
        promise.reject(e)
      } else {
        cache.push(e)
      }
    })

    req.once('end', () => {
      ended = true
      if (queue.length > 0) {
        const promise = queue.shift()
        promise.resolve({ done: true, value: undefined })
      }
      req.close()
    })

    const payload = this.buildPayload(iteratorOption)
    req.write(payload)

    const reqReadIterator: AsyncIterable<SplashDBIteratorResult> = {
      [Symbol.asyncIterator]() {
        return {
          return: async (): Promise<IteratorResult<SplashDBIteratorResult>> => {
            try {
              const value = cache.shift()
              return Promise.resolve({ done: true, value })
            } catch (e) {
              return Promise.resolve({ done: true, value: e })
            } finally {
              if (!ended) {
                ended = true
                req.end()
              }
            }
          },
          next: (): Promise<IteratorResult<SplashDBIteratorResult>> => {
            const result = cache.shift()
            if (result) {
              if (result instanceof Error) {
                return Promise.reject(Error)
              } else {
                return Promise.resolve({ value: result, done: false })
              }
            } else if (ended) {
              return Promise.resolve({ value: undefined, done: true })
            } else {
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
    console.log('closing...')

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
