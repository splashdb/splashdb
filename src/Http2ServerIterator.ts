import http2 from 'http2'

type Http2StreamIteratorResult = {
  stream: http2.ServerHttp2Stream
  headers: http2.IncomingHttpHeaders
  flags: number
}

export class Http2ServerIterator {
  constructor(server: http2.Http2Server) {
    this.server = server
    this.cache = []
    this.queue = []
    this.ended = false
    this.onStream = this.onStream.bind(this)
    this.server.on('stream', this.onStream)
  }

  ended: boolean
  cache: Http2StreamIteratorResult[]
  queue: {
    resolve: (result: {
      value: Http2StreamIteratorResult
      done: boolean
    }) => void
    reject: (e: Error) => void
  }[]
  server: http2.Http2Server
  iteratorInstance: AsyncIterable<Http2StreamIteratorResult>

  onStream(
    stream: http2.ServerHttp2Stream,
    headers: http2.IncomingHttpHeaders,
    flags: number
  ): void {
    const value = {
      stream,
      headers,
      flags,
    }
    if (this.queue.length > 0) {
      const q = this.queue.shift()
      q.resolve({ value, done: false })
      return
    }
    this.cache.push(value)
  }

  async *iterator(): AsyncIterableIterator<Http2StreamIteratorResult> {
    if (!this.iteratorInstance) {
      const iteratorInstance: AsyncIterable<Http2StreamIteratorResult> = {
        [Symbol.asyncIterator]: () => {
          return {
            return: async (): Promise<
              IteratorResult<Http2StreamIteratorResult>
            > => {
              try {
                const value = this.cache.shift()
                return Promise.resolve({ done: true, value })
              } catch (e) {
                return Promise.resolve({ done: true, value: e })
              } finally {
                if (!this.ended) {
                  this.ended = true
                  this.server.off('stream', this.onStream)
                }
              }
            },
            next: (): Promise<IteratorResult<Http2StreamIteratorResult>> => {
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