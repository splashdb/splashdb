import http2 from 'http2'
import fs from 'fs'
import path from 'path'

export class SplashdbSampleClient {
  constructor() {
    this.authorization = 'Basic YWRtaW46YWRtaW4='
    const ca = fs.readFileSync(
      path.resolve(process.cwd(), process.env.SPLASHDB_SECURE_CERT)
    )
    this.session = http2.connect('https://localhost:8443', {
      ca,
    })

    this.connectingPromise = new Promise((resolve, reject) => {
      this.session.once('connect', () => {
        console.log('connected to server')
        resolve()
      })

      this.session.once('error', (err) => {
        console.error('SplashdbSampleClientGotError: ', err)
        reject(err)
      })
    })
  }

  authorization: string
  session: http2.ClientHttp2Session
  connectingPromise: Promise<void>

  async ok(): Promise<void> {
    await this.connectingPromise
    console.log('[client] ok')
  }

  async get(key: string | Uint8Array): Promise<Uint8Array> {
    return await new Promise((resolve, reject) => {
      let handled = false
      if (this.session.connecting) {
        handled = true
        return reject(new Error('NOT_CONNECTED'))
      }
      const cache: ArrayBuffer[] = []

      console.time('[client] request')
      const req = this.session.request({
        // GET / DELETE methods cannot write data
        ':method': 'POST',
        authorization: this.authorization,
        'x-splashdb-method': 'get',
      })

      req.on('response', (headers, flags) => {
        if (headers[':status'] !== 200) {
          handled = true
          reject(new Error(`HTTP_ERROR_${headers[':status']}`))
        }
      })

      req.on('data', (chunk) => {
        if (handled) return
        // console.log('[client] typeof chunk', typeof chunk, chunk)
        if (typeof chunk === 'string') {
          cache.push(new TextEncoder().encode(chunk))
        } else {
          cache.push(chunk)
        }
      })

      req.once('end', () => {
        if (handled) return
        console.timeEnd('[client] request')
        // console.log('[client] client end')
        const totalLength = cache.reduce((total, chunk) => {
          total += chunk.byteLength
          return total
        }, 0)
        const result = new Uint8Array(totalLength)
        let prevChunkSize = 0
        for (const chunk of cache) {
          result.set(new Uint8Array(chunk), prevChunkSize)
          prevChunkSize = chunk.byteLength
        }
        handled = true
        resolve(result)
      })

      req.write(typeof key === 'string' ? new TextEncoder().encode(key) : key)
      req.end()
    })
  }

  async put(key: string | Uint8Array): Promise<void> {
    return
  }

  async del(key: string | Uint8Array): Promise<void> {
    return
  }

  async *iterator(): AsyncIterableIterator<{
    key: Uint8Array
    value: Uint8Array
  }> {
    yield { key: new Uint8Array(), value: new Uint8Array() }
  }

  destroy(): void {
    this.session.close()
  }
}
