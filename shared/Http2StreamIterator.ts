import { ServerHttp2Stream } from 'http2'

type Http2StreamIteratorResult = {
  chunk: string | Buffer
}

export class Http2StreamIterator {
  constructor(stream: ServerHttp2Stream) {
    this.stream = stream
    this.cache = []
    this.queue = []
    this.ended = false
    this.onData = this.onData.bind(this)
    this.onEnd = this.onEnd.bind(this)
    this.stream.on('data', this.onData)
    this.stream.on('end', this.onEnd)
  }

  ended: boolean
  cache: Http2StreamIteratorResult[]
  queue: {
    resolve: (
      result:
        | IteratorYieldResult<Http2StreamIteratorResult>
        | IteratorReturnResult<any>
    ) => void
    reject: (e: Error) => void
  }[]
  stream: ServerHttp2Stream
  iteratorInstance!: AsyncIterable<Http2StreamIteratorResult>

  onEnd(): void {
    this.ended = true
    this.stream.off('data', this.onData)
    this.stream.off('end', this.onEnd)
    const q = this.queue.shift()
    if (q) {
      q.resolve({ value: undefined, done: true })
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
                return Promise.resolve({ done: true, value: undefined })
              } finally {
                if (!this.ended) {
                  this.ended = true
                  this.stream.off('data', this.onData)
                  this.stream.off('end', this.onEnd)
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
