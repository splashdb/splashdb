import { Http2Server, ServerHttp2Stream, IncomingHttpHeaders } from 'http2'

type Http2ServerIteratorResult = {
  stream: ServerHttp2Stream
  headers: IncomingHttpHeaders
  flags: number
}

export class Http2ServerIterator {
  constructor(server: Http2Server) {
    this.server = server
    this.cache = []
    this.queue = []
    this.ended = false
    this.onStream = this.onStream.bind(this)
    this.server.on('stream', this.onStream)
  }

  ended: boolean
  cache: Http2ServerIteratorResult[]
  queue: {
    resolve: (
      result:
        | IteratorYieldResult<Http2ServerIteratorResult>
        | IteratorReturnResult<any>
    ) => void
    reject: (e: Error) => void
  }[]
  server: Http2Server
  iteratorInstance!: AsyncIterable<Http2ServerIteratorResult>

  onStream(
    stream: ServerHttp2Stream,
    headers: IncomingHttpHeaders,
    flags: number
  ): void {
    const value = {
      stream,
      headers,
      flags,
    }
    const q = this.queue.shift()
    if (q) {
      q.resolve({ value, done: false })
      return
    }
    this.cache.push(value)
  }

  async *iterator(): AsyncIterableIterator<Http2ServerIteratorResult> {
    if (!this.iteratorInstance) {
      const iteratorInstance: AsyncIterable<Http2ServerIteratorResult> = {
        [Symbol.asyncIterator]: () => {
          return {
            return: async (): Promise<
              IteratorResult<Http2ServerIteratorResult>
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
            next: (): Promise<IteratorResult<Http2ServerIteratorResult>> => {
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
