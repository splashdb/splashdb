import { SplashDBServerOptions } from './Options'

export class AuthManager {
  constructor(options: Required<SplashDBServerOptions>) {
    this.options = options
  }

  options: Required<SplashDBServerOptions>
}
