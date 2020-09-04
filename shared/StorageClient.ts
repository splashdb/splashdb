import BSON from 'bson'
import varint from 'varint'
import { Http2SessionDaemon, Http2ResponseIterator } from './'

type SplashDBIteratorResult = {
  key: Buffer
  value: Buffer
}

type IteratorQueue = {
  resolve: (
    result:
      | IteratorYieldResult<SplashDBIteratorResult>
      | IteratorReturnResult<any>
  ) => void
  reject: (reason?: any) => void
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

  async get(db: string, key: string | Buffer): Promise<Uint8Array | void> {
    const result = await this.request(
      db,
      'get',
      BSON.serialize({
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
      BSON.serialize({
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
      BSON.serialize({
        key,
      })
    )
    return
  }

  async *iterator(
    db: string,
    iteratorOption: { start?: string | Buffer; reverse?: boolean } = {}
  ): AsyncIterableIterator<SplashDBIteratorResult> {
    if (this.sessionDaemon.session.connecting) {
      await this.sessionDaemon.ok()
    }
    const cache: (SplashDBIteratorResult | Error)[] = []
    const queue: IteratorQueue[] = []

    let ended = false

    const req = this.sessionDaemon.session.request({
      // GET / DELETE methods cannot use req.write
      ':method': 'POST',
      'x-splashdb-version': '1.0',
      'x-splashdb-db': db,
      'x-splashdb-method': 'iterator',
    })

    const stopIterator = (e?: Error): void => {
      if (ended) return
      // stop request with error
      ended = true
      req.close()

      if (this.options.debug) {
        console.log(`stopIterator`, e ? `ERROR: ${e.message}` : 'without error')
      }
      if (e) {
        if (isBrokenError(e)) {
          this.sessionDaemon.session.close()
        }

        if (this.options.debug) {
          console.log(
            `[splash client] read response failed, stop iterator`,
            e.message
          )
        }
      }

      const promise = queue.shift()
      if (promise) {
        if (e) {
          promise.reject(e)
        } else {
          promise.resolve({ value: undefined, done: true })
        }
      } else {
        if (e) cache.push(e)
      }
    }

    /**
     * ServerHttp2Stream buffer the write data, so client
     * sometime will not receive a complete data
     * format stream response. Client should cache stream data.
     *
     * 1. put new buffer at end of cachedBuffer
     *
     * 2. try to read varint value:
     * if varint value read success, then we can known nextData length,
     * else if faild, wait for next buffer
     *
     * 3. calcurate endPosition by varint value
     * if nextData endPosition is smaller then current cachedBuffer size
     *   try to read nextData
     * else if nextData endPosition is bigger, then wait for next buffer
     *
     * 3. read data:
     * if read failed, stop iterator.
     * else if `endPosition` > `cachedBufferSize`, data has not ready,
     * update `cachedBuffer` and wait for next buffer
     *
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
        if (cachedBufferReadSize > cachedBufferSize) {
          stopIterator(
            new Error(
              'Assert failed: readSize could not bigger then bufferSize'
            )
          )
          break
        }
        if (cachedBufferReadSize === cachedBufferSize) {
          cachedBuffer = Buffer.alloc(0)
          break
        }
        let nextDataSize = 0
        try {
          nextDataSize = varint.decode(cachedBuffer, cachedBufferReadSize)
        } catch (e) {
          // only keep unread buffer
          cachedBuffer = cachedBuffer.slice(cachedBufferReadSize)
          break
        }

        const endPosition =
          cachedBufferReadSize + varint.decode.bytes + nextDataSize

        if (endPosition > cachedBufferSize) {
          // only keep unread buffer
          cachedBuffer = cachedBuffer.slice(cachedBufferReadSize)
          break
        }

        cachedBufferReadSize += varint.decode.bytes
        const nextDataBuffer = cachedBuffer.slice(
          cachedBufferReadSize,
          endPosition
        )
        cachedBufferReadSize += nextDataSize

        try {
          const result1 = BSON.deserialize(nextDataBuffer)
          const result: SplashDBIteratorResult = {
            key: Buffer.from(Object.values(result1.key)),
            value: Buffer.from(Object.values(result1.value)),
          }
          const promise = queue.shift()
          if (promise) {
            promise.resolve({ value: result, done: false })
          } else {
            cache.push(result)
          }
        } catch (e) {
          stopIterator(e)
          break
        }
      }
    }

    req.once('response', (headers) => {
      const status = headers[':status']
      if (status !== 200) {
        const error = new Error(`HTTP_ERROR_${headers[':status']}`)
        stopIterator(error)
      }
    })

    req.on('data', async (chunk) => {
      if (ended) {
        console.warn('WARNING: receive data after end.')
        return
      }
      readCached(Buffer.from(chunk))
    })

    req.once('error', (e) => {
      stopIterator(e)
    })

    req.once('end', () => {
      'req once end'
      stopIterator()
    })

    req.write(BSON.serialize(iteratorOption))
    req.end()

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
            queueMicrotask(stopIterator)
            const value = cache.shift()
            if (value instanceof Error) {
              return Promise.reject(value)
            }
            return Promise.resolve({ done: true, value })
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
