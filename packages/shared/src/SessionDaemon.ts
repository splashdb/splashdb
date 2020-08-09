import * as http2 from 'http2'

type Http2SessionDaemonOption = {
  debug?: boolean
}

interface PDClientLike {
  getStorageUrl(): Promise<string>
  getStorageCa(): Promise<string | Buffer | void>
}

const defaultHttp2SessionDaemonOption: Http2SessionDaemonOption = {
  debug: false,
}

export class Http2SessionDaemon {
  options: Http2SessionDaemonOption
  connectingPromise!: Promise<void>
  connected: boolean
  destroyed: boolean
  connectError!: Error
  session!: http2.ClientHttp2Session
  authorization!: string
  pdClient: PDClientLike

  constructor(
    pdClient: PDClientLike,
    options = defaultHttp2SessionDaemonOption
  ) {
    this.pdClient = pdClient
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

    this.connectingPromise = new Promise(async (resolve, reject) => {
      let handled = false

      try {
        const uri = await this.pdClient.getStorageUrl()
        const ca = await this.pdClient.getStorageCa()
        this.session = http2.connect(uri, {
          ca: ca || undefined,
        })
      } catch (e) {}

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
              console.log(
                '[splash client] connect failed, reconnect after 5 seconds.'
              )
            }
            this.createSession()
          }, 5000)
          // Do not call reject() here to avoid unhandled rejection error
          resolve()
        }
      }
      this.session.once('connect', connectListener)
      this.session.once('error', errListener)
    })
  }

  updateAuthorization(option: { username: string; password: string }): void {
    this.authorization = `Basic ${Buffer.from(
      `${option.username}:${option.password}`
    ).toString('base64')}`
  }

  keepSession(): void {
    const timer = setInterval(() => {
      this.session.ping((err: Error | null): void => {
        if (err) {
          this.session.close()
        }
      })
    }, 5000)

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
