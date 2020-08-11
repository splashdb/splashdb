import * as http2 from 'http2'

type Http2SessionDaemonOption = {
  debug?: boolean
  reconnectInterval?: number
}

const defaultHttp2SessionDaemonOption: Required<Http2SessionDaemonOption> = {
  debug: false,
  reconnectInterval: 5000,
}

export interface AuthorityProvider {
  getAuthority: () => Promise<string | URL>
  getOptions: () => Promise<
    void | http2.ClientSessionOptions | http2.SecureClientSessionOptions
  >
}

export class Http2SessionDaemon {
  options: Required<Http2SessionDaemonOption>
  connectingPromise!: Promise<void>
  connected: boolean
  destroyed: boolean
  connectError!: Error
  session!: http2.ClientHttp2Session
  authProvider: AuthorityProvider

  constructor(
    authProvider: AuthorityProvider,
    options: Http2SessionDaemonOption = {}
  ) {
    this.authProvider = authProvider
    this.options = {
      ...defaultHttp2SessionDaemonOption,
      ...options,
    }
    this.destroyed = false
    this.connected = false
    this.createSession()
  }

  createSession(): void {
    if (this.destroyed) {
      return
    }

    this.connectingPromise = new Promise(async (resolve) => {
      let handled = false

      const connectListener = (): void => {
        if (!handled) {
          this.session.removeListener('error', errListener)
          handled = true
          this.connected = true
          delete this.connectingPromise
          delete this.connectError
          this.keepSession()
          if (this.options.debug) {
            console.log('[splash client] connected.')
          }
          resolve()
        }
      }

      // Only listen connection fail
      const errListener = (err: Error): void => {
        if (!handled) {
          this.session.removeListener('connect', connectListener)
          handled = true
          this.connected = false
          delete this.connectingPromise
          this.connectError = err
          setTimeout(() => {
            if (this.options.debug) {
              console.log('Connect failed, reconnect after 5 seconds.')
            }
            this.createSession()
          }, this.options.reconnectInterval)
          // Do not call reject() here to avoid unhandled rejection error
          resolve()
        }
      }

      try {
        const [uri, options] = await Promise.all([
          this.authProvider.getAuthority(),
          this.authProvider.getOptions(),
        ])
        this.session = http2.connect(uri, options || {})
      } catch (e) {
        errListener(e)
        return
      }

      this.session.once('connect', connectListener)
      this.session.once('error', errListener)
    })
  }

  keepSession(): void {
    const timer = setInterval(() => {
      this.session.ping((err: Error | null): void => {
        if (err) {
          this.session.close()
        }
      })
    }, this.options.reconnectInterval - 10)

    this.session.once('close', () => {
      clearInterval(timer)
      if (this.options.debug && !this.destroyed) {
        console.log('[splash client] lost connection, reconnect immeditly')
      }
      this.session.removeAllListeners()
      this.createSession()
    })
    this.session.once('error', () => {
      if (this.options.debug) {
        console.log(`[splashdb client] session received an error event`)
      }
      this.session.close()
    })
    this.session.once('goaway', () => {
      console.log(`[splashdb client] session received a goaway event`)
      this.session.close()
    })
  }

  // a safe way to get session.
  async getSession(): Promise<http2.ClientHttp2Session> {
    await this.ok()
    return this.session
  }

  async ok(): Promise<void> {
    if (this.connectingPromise) {
      await this.connectingPromise
    }
    if (this.connectError) {
      throw this.connectError
    }
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
