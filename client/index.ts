import * as http2 from 'http2'
import * as BSON from 'bson'
import {
  MongoCommandFindOption,
  MongoCommandFindOutput,
  MongoCommandInsertOption,
  MongoCommandInsertOutput,
  MongoCommandOption,
  MongoCommandOutput,
  MongoCommandFindAndModifyOption,
  MongoCommandFindAndModifyOutput,
  MongoCommandDeleteOption,
  MongoCommandDeleteOutput,
  MongoCommandUpdateOption,
  MongoCommandUpdateOutput,
} from '../MongoTypes'
import {
  Http2ResponseIterator,
  AuthorityProvider,
  Http2SessionDaemon,
} from '../shared'

type SplashdbClientOptions = {
  ca?: string | Buffer
  debug?: boolean
}

const defaultOptions = {
  debug: false,
}

function isBrokenError(e: Error): boolean {
  if (e.message.indexOf('ETIMEDOUT') > -1) return true
  if (e.message.indexOf('GOAWAY') > -1) return true
  return false
}

export class SplashdbClient {
  options: SplashdbClientOptions
  sessionDaemon: Http2SessionDaemon
  basicAuth: string
  authProvider: AuthorityProvider
  db: string
  connected: boolean
  destroyed: boolean

  constructor(uri: string, options?: SplashdbClientOptions) {
    this.options = { ...defaultOptions, ...options }

    const url = new URL(uri)
    const authorization = Buffer.from(
      `${url.username}:${url.password}`
    ).toString('base64')
    let db = url.pathname.substr(1)
    if (db.indexOf('/') > -1) {
      throw new Error('Invalid db name')
    } else if (db === '') {
      db = 'system'
    }

    this.basicAuth = `Basic ${authorization}`
    this.db = db
    this.connected = false
    this.destroyed = false

    this.authProvider = {
      getAuthority: async (): Promise<string> => {
        return uri
      },
      getOptions: async (): Promise<
        http2.ServerOptions | http2.SecureServerOptions
      > => {
        if (this.options.ca) return { ca: this.options.ca }
        return {}
      },
    }

    this.sessionDaemon = new Http2SessionDaemon(this.authProvider, this.options)
  }

  async request(
    protocol: 'mongo' | 'sql' | 'ripple',
    requestBuffer: Buffer
  ): Promise<Buffer | void> {
    if (protocol !== 'mongo') {
      throw new Error('Splashdb client only support mongo protocol yet.')
    }

    const session = await this.sessionDaemon.getSession()
    const cache: Buffer[] = []

    const req = session.request({
      // GET / DELETE methods cannot use req.write
      authorization: this.basicAuth,
      ':method': 'POST',
      'x-splashdb-protocol': protocol,
      'x-splashdb-version': '1.0',
      'x-splashdb-db': this.db,
    })

    req.write(requestBuffer)
    req.end()

    try {
      for await (const data of new Http2ResponseIterator(req).iterator()) {
        const { chunk } = data
        if (typeof chunk === 'string') {
          cache.push(Buffer.from(chunk))
        } else {
          cache.push(chunk)
        }
      }
    } catch (e) {
      if (isBrokenError(e)) {
        session.close()
      }
      throw e
    }

    const totalLength = cache.reduce(
      (total, chunk) => total + chunk.byteLength,
      0
    )
    const result = new Uint8Array(totalLength)
    let prevChunkSize = 0
    for (const chunk of cache) {
      result.set(chunk, prevChunkSize)
      prevChunkSize += chunk.byteLength
    }
    req.close()
    return Buffer.from(result)
  }

  async runCommand<T>(
    option: MongoCommandFindOption<T>
  ): Promise<MongoCommandFindOutput<T>>

  async runCommand<T>(
    option: MongoCommandInsertOption<T>
  ): Promise<MongoCommandInsertOutput>

  async runCommand<T>(
    option: MongoCommandFindAndModifyOption<T>
  ): Promise<MongoCommandFindAndModifyOutput<T>>

  async runCommand<T>(
    option: MongoCommandDeleteOption
  ): Promise<MongoCommandDeleteOutput>

  async runCommand<T>(
    option: MongoCommandUpdateOption<T>
  ): Promise<MongoCommandUpdateOutput<T>>

  async runCommand<T>(
    option: MongoCommandOption<T>
  ): Promise<MongoCommandOutput<T>> {
    const result = await this.request('mongo', BSON.serialize(option))
    if (!result) return { ok: 0, n: 0 }
    if (result.length < 5) return { ok: 0, n: 0 }
    const parsed = BSON.deserialize(result)
    if ('find' in option) {
      return {
        n: parsed.n,
        ok: parsed.ok,
        cursor: {
          toArray: async (): Promise<(T & { _id: string })[]> => {
            if (parsed.ok === 0 || parsed.n === 0) return []
            const obj = BSON.deserialize(parsed._data.buffer)
            return Object.values(obj)
          },
        },
      }
    }
    return parsed
  }

  async destroy(): Promise<void> {
    await this.sessionDaemon.destroy()
  }
}
