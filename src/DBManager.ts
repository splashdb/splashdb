import { Database } from 'rippledb'
import { SplashDBServerOptions } from './Options'

export class DBManager {
  constructor(options: Required<SplashDBServerOptions>) {
    this.options = options
  }

  options: Required<SplashDBServerOptions>
}
