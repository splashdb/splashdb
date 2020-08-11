import * as http2 from 'http2'

type Http2ResponseIteratorResult = {
  chunk: string | Buffer
}

export class Http2ResponseIterator {
  constructor(stream: http2.ClientHttp2Stream) {
    this.stream = stream
    this.cache = []
    this.queue = []
    this.ended = false
    this.onResponse = this.onResponse.bind(this)
    this.onError = this.onError.bind(this)
    this.onData = this.onData.bind(this)
    this.onEnd = this.onEnd.bind(this)
    this.stream.on('response', this.onResponse)
    this.stream.on('error', this.onError)
    this.stream.on('data', this.onData)
    this.stream.on('end', this.onEnd)
  }

  ended: boolean
  cache: Http2ResponseIteratorResult[]
  queue: {
    resolve: (
      result:
        | IteratorYieldResult<Http2ResponseIteratorResult>
        | IteratorReturnResult<any>
    ) => void
    reject: (e: Error) => void
  }[]
  stream: http2.ClientHttp2Stream
  iteratorInstance!: AsyncIterable<Http2ResponseIteratorResult>

  onEnd(): void {
    this.ended = true
    this.stream.off('data', this.onData)
    this.stream.off('end', this.onEnd)
    const q = this.queue.shift()
    if (q) {
      q.resolve({ value: undefined, done: true })
    }
  }

  onError(reson?: any): void {
    this.ended = true
    const q = this.queue.shift()
    if (q) {
      q.reject(reson)
    }
  }

  onResponse(headers: http2.IncomingHttpHeaders, flags?: number): void {
    const status = headers[':status']
    if (typeof status === 'number') {
      if (status !== 200) {
        this.ended = true
        const q = this.queue.shift()
        if (q) {
          if (status === 404) {
            q.resolve({ done: true, value: undefined })
          } else {
            q.reject(new Error(`HTTP_ERROR_${headers[':status']}`))
          }
        }
      }
    }
  }

  onData(chunk: string | Buffer): void {
    const value = {
      chunk,
    }
    const q = this.queue.shift()
    if (q) {
      q.resolve({ value, done: false })
      return
    }
    this.cache.push(value)
  }

  async *iterator(): AsyncIterableIterator<Http2ResponseIteratorResult> {
    if (!this.iteratorInstance) {
      const iteratorInstance: AsyncIterable<Http2ResponseIteratorResult> = {
        [Symbol.asyncIterator]: () => {
          return {
            return: async (): Promise<
              IteratorResult<Http2ResponseIteratorResult>
            > => {
              try {
                const value = this.cache.shift()
                return Promise.resolve({ done: true, value })
              } catch (e) {
                return Promise.resolve({ done: true, value: undefined })
              } finally {
                if (!this.ended) {
                  this.ended = true
                  this.stream.off('data', this.onData)
                  this.stream.off('end', this.onEnd)
                }
              }
            },
            next: (): Promise<IteratorResult<Http2ResponseIteratorResult>> => {
              const result = this.cache.shift()
              if (result) {
                if (result instanceof Error) {
                  return Promise.reject(Error)
                } else {
                  return Promise.resolve({ value: result, done: false })
                }
              } else if (this.ended) {
                return Promise.resolve({ value: undefined, done: true })
              } else {
                return new Promise((resolve, reject) => {
                  this.queue.push({ resolve, reject })
                })
              }
            },
          }
        },
      }
      this.iteratorInstance = iteratorInstance
    }
    yield* this.iteratorInstance
  }
}
