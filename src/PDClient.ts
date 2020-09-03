import * as http2 from 'http2'
import { AuthorityProvider } from './shared'

type PDClientOptions = {
  pdUrl: string
}

export class PDClient implements AuthorityProvider {
  constructor(options: PDClientOptions) {
    this.options = options
  }

  options: PDClientOptions

  /**
   * get an avilable storage url so mongoclient can (re)connect it
   */
  async getAuthority(): Promise<string> {
    // TODO get address from pd cluster
    return this.options.pdUrl
  }

  async getOptions(): Promise<http2.ServerOptions> {
    // TODO get address from pd cluster
    return {}
  }
}
