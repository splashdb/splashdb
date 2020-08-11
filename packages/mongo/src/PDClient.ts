import * as http2 from 'http2'
import { AuthorityProvider } from '@splashdb/shared'
import { SplashDBMongoOptions } from './SplashDBMongoOptions'

export class PDClient implements AuthorityProvider {
  constructor(options: SplashDBMongoOptions) {
    this.options = options
  }

  options: SplashDBMongoOptions

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
