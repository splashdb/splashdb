import http2 from 'http2'
import fs from 'fs'
import path from 'path'
import { BootBuffer } from 'bootbuffer'
import { stream } from 'event-iterator'
import IteratorHelper from '../src/IteratorHelper'

export class SplashdbSampleClient {
  constructor(options?: { db: string }) {
    this.options = { db: 'system', ...options }
    this.authorization = 'Basic YWRtaW46YWRtaW4='
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

      console.time(`[client] ${method} request`)
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
            console.timeEnd(`[client] ${method} request`)
            return resolve(null)
          }
          reject(new Error(`HTTP_ERROR_${headers[':status']}`))
        }
        if (method === 'put' || method === 'del') {
          handled = true
          console.log(`[client] ${method} get response`)
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
  ): AsyncIterableIterator<{
    key: Uint8Array
    value: Uint8Array
  }> {
    if (this.session.connecting) {
      await this.ok()
    }
    const req = this.session.request({
      // GET / DELETE methods cannot use req.write
      ':method': 'POST',
      authorization: this.authorization,
      'x-splashdb-version': '1.0',
      'x-splashdb-db': this.options.db,
      'x-splashdb-method': 'iterator',
    })

    const payload = this.buildPayload(iteratorOption)

    console.log(`[client] iterator start`)
    process.nextTick(() => {
      req.write(payload)
      console.log('[client] req write')
    })

    const iterator = stream.call(req) as AsyncIterableIterator<Buffer>
    const callbackIterator = IteratorHelper.wrap(iterator, () => {
      req.end()
    })

    for await (const chunk of callbackIterator) {
      /* Asynchronously iterate over buffer chunks read from file. */
      const result = {} as { key: Buffer; value: Buffer }
      for await (const param of BootBuffer.read(chunk)) {
        result[param.key] = param.value
      }
      yield result
    }
  }

  async destroy(): Promise<void> {
    await new Promise((resolve) => {
      this.session.close(() => {
        resolve()
      })
    })
  }
}
