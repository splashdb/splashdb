import { SplashDBMongoOptions } from './SplashDBMongoOptions'

export class PDClient {
  constructor(options: SplashDBMongoOptions) {
    this.options = options
  }

  options: SplashDBMongoOptions

  /**
   * get an avilable storage url so mongoclient can (re)connect it
   */
  async getStorageUrl(): Promise<string> {
    // TODO get address from pd cluster
    return this.options.pdUrl
  }

  async getStorageCa(): Promise<string | Buffer | void> {
    // TODO get address from pd cluster
    return
  }
}
