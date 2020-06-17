import http2, { ClientHttp2Session } from 'http2'
import { BootBuffer } from 'bootbuffer'
import varint from 'varint'

type SplashDBIteratorResult = {
  key: Buffer
  value: Buffer
}

type SplashdbClientOptions = {
  ca?: string | Buffer
  uri: string
}

export class SplashdbClient {
  constructor(options: SplashdbClientOptions) {
    this.options = { ca: '', ...options }
    const url = new URL(this.options.uri)
    this.updateAuthorization(url)
    this.db = url.pathname.substr(1)

    this.createSession()
  }

  options: Required<SplashdbClientOptions>
  authorization: string
  db: string
  session: ClientHttp2Session
  connectingPromise: Promise<void>
  connected = false
  destroyed = false
  connectError: Error

  createSession(): void {
    this.session = http2.connect(this.options.uri, {
      ca: this.options.ca || undefined,
    })
    this.connectingPromise = new Promise((resolve, reject) => {
      let handled = false
      const connectListener = (): void => {
        if (!handled) {
          this.session.removeListener('error', errListener)
          handled = true
          this.connected = true
          delete this.connectingPromise
          delete this.connectError
          this.keepSession()
          resolve()
        }
      }
      const errListener = (err: Error): void => {
        if (!handled) {
          this.session.removeListener('connect', connectListener)
          handled = true
          this.connected = false
          delete this.connectingPromise
          this.connectError = err
          reject(err)
        }
      }
      this.session.once('connect', connectListener)
      this.session.once('error', errListener)
    })
  }

  keepSession(): void {
    this.session.once('close', () => {
      if (!this.destroyed) {
        this.createSession()
      }
    })
  }

  updateAuthorization(option: { username: string; password: string }): void {
    this.authorization = `Basic ${Buffer.from(
      `${option.username}:${option.password}`
    ).toString('base64')}`
  }

  async ok(): Promise<void> {
    if (this.connectingPromise) {
      await this.connectingPromise
    }
    if (!this.connected) {
      throw this.connectError
    }
  }

  async request(
    method: 'get' | 'put' | 'del',
    requestBuffer: Buffer
  ): Promise<Uint8Array> {
    await this.ok()
    return await new Promise((resolve, reject) => {
      let handled = false
      const cache: Buffer[] = []

      const req = this.session.request({
        // GET / DELETE methods cannot use req.write
        ':method': 'POST',
        authorization: this.authorization,
        'x-splashdb-version': '1.0',
        'x-splashdb-db': this.db,
        'x-splashdb-method': method,
      })

      req.on('response', (headers, flags) => {
        const status = headers[':status']
        if (status !== 200) {
          handled = true
          if (status === 404) {
            return resolve(null)
          }
          reject(new Error(`HTTP_ERROR_${headers[':status']}`))
        }
        if (method === 'put' || method === 'del') {
          handled = true
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
      'x-splashdb-db': this.db,
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
          promise.resolve({ value: result, done: false })
        } else {
          cache.push(result)
        }
        chunkReadBytes += bbLength
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
              req.end()
            }
          },
          next: (): Promise<IteratorResult<SplashDBIteratorResult>> => {
            // if (!started) {
            //   started = true
            //   req.write(payload)
            //   return new Promise((resolve, reject) => {
            //     queue.push({ resolve, reject })
            //   })
            // }
            const result = cache.shift()
            if (result) {
              return Promise.resolve({ value: result, done: false })
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
    this.destroyed = true
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
