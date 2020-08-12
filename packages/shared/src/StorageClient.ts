import { BootBuffer } from 'bootbuffer'
import varint from 'varint'
import { Http2SessionDaemon } from './Http2SessionDaemon'
import { Http2ResponseIterator } from './Http2ResponseIterator'

type SplashDBIteratorResult = {
  key: Buffer
  value: Buffer
}

export type SplashdbStorageClientOptions = {
  debug?: boolean
}

function isBrokenError(e: Error): boolean {
  if (e.message.indexOf('ETIMEDOUT') > -1) return true
  if (e.message.indexOf('GOAWAY') > -1) return true
  return false
}

export class SplashdbStorageClient {
  constructor(
    sessionDaemon: Http2SessionDaemon,
    options: SplashdbStorageClientOptions
  ) {
    this.sessionDaemon = sessionDaemon
    this.options = { debug: false, ...options }
  }

  sessionDaemon: Http2SessionDaemon
  options: Required<SplashdbStorageClientOptions>

  async request(
    db: string,
    method: 'get' | 'put' | 'del',
    requestBuffer: Buffer
  ): Promise<Uint8Array | void> {
    await this.sessionDaemon.ok()
    const cache: Buffer[] = []

    const req = this.sessionDaemon.session.request({
      // GET / DELETE methods cannot use req.write
      ':method': 'POST',
      'x-splashdb-version': '1.0',
      'x-splashdb-db': db,
      'x-splashdb-method': method,
    })

    req.write(requestBuffer)
    req.end()

    try {
      for await (const data of new Http2ResponseIterator(req).iterator()) {
        const chunk =
          typeof data.chunk === 'string' ? Buffer.from(data.chunk) : data.chunk
        cache.push(chunk)
      }

      const totalLength = cache.reduce((total, chunk) => {
        total += chunk.byteLength
        return total
      }, 0)
      if (totalLength === 0) {
        return
      }
      const result = new Uint8Array(totalLength)
      let prevChunkSize = 0
      for (const chunk of cache) {
        result.set(chunk, prevChunkSize)
        prevChunkSize += chunk.byteLength
      }
      return result
    } catch (e) {
      if (isBrokenError(e)) {
        this.sessionDaemon.session.close()
      }
      throw e
    } finally {
      req.close()
    }
  }

  buildPayload(params: {
    [x: string]: Buffer | Uint8Array | string | number | boolean | void
  }): Buffer {
    const bb = new BootBuffer()
    for (const key in params) {
      bb.add(key, params[key])
    }

    return bb.buffer
  }

  async get(db: string, key: string | Buffer): Promise<Uint8Array | void> {
    const result = await this.request(
      db,
      'get',
      this.buildPayload({
        key,
      })
    )
    return result
  }

  async put(
    db: string,
    key: string | Buffer,
    value: string | Buffer
  ): Promise<void> {
    await this.request(
      db,
      'put',
      this.buildPayload({
        key,
        value,
      })
    )
    return
  }

  async del(db: string, key: string | Buffer): Promise<void> {
    await this.request(
      db,
      'del',
      this.buildPayload({
        key,
      })
    )
    return
  }

  async *iterator(
    db: string,
    iteratorOption: { start?: string | Buffer; reverse?: boolean } = {}
  ): AsyncIterableIterator<SplashDBIteratorResult> {
    // const debug = this.options.debug
    if (this.sessionDaemon.session.connecting) {
      await this.sessionDaemon.ok()
    }
    const cache: (SplashDBIteratorResult | Error)[] = []
    const queue: {
      resolve: (
        result:
          | IteratorYieldResult<SplashDBIteratorResult>
          | IteratorReturnResult<any>
      ) => void
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
            if (entry.key === 'key') {
              result.key = entry.value as Buffer
            } else if (entry.key === 'value') {
              result.value = entry.value as Buffer
            }
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
          const promise = queue.shift()
          if (promise) {
            promise.reject(e)
          } else {
            cache.push(e)
          }
          return
        }

        // read success
        const promise = queue.shift()
        if (promise) {
          promise.resolve({ value: result, done: false })
        } else {
          cache.push(result)
        }
      }
    }

    const req = this.sessionDaemon.session.request({
      // GET / DELETE methods cannot use req.write
      ':method': 'POST',
      'x-splashdb-version': '1.0',
      'x-splashdb-db': db,
      'x-splashdb-method': 'iterator',
    })

    req.once('response', (headers, flags) => {
      const status = headers[':status']
      if (status !== 200) {
        const error = new Error(`HTTP_ERROR_${headers[':status']}`)

        ended = true
        req.end()
        const promise = queue.shift()
        if (promise) {
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
        this.sessionDaemon.session.close()
      }
      ended = true
      req.end()
      const promise = queue.shift()
      if (promise) {
        promise.reject(e)
      } else {
        cache.push(e)
      }
    })

    req.once('end', () => {
      ended = true
      const promise = queue.shift()
      if (promise) {
        promise.resolve({ done: true, value: undefined })
      }
      req.close()
    })

    const payload = this.buildPayload(iteratorOption)
    req.write(payload)

    // Here did not use for...await...of because this iterator
    // could be broken by SplashdbStorageClient.iterator()
    // caller function, then `req` should be end()
    //
    // Another solution is use hook-able iterator like Rippledb.
    // @see https://github.com/heineiuo/rippledb/blob/master/src/IteratorHelper.ts
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
}
