import { SplashDBServerOptions } from './Options'
import { DBManager } from './DBManager'

export class AuthManager {
  constructor(options: Required<SplashDBServerOptions>, dbmanager: DBManager) {
    this.options = options
    this.dbmanager = dbmanager
  }

  options: Required<SplashDBServerOptions>
  dbmanager: DBManager

  async can(
    authorization: string,
    method: string,
    dbname: string
  ): Promise<boolean> {
    if (!authorization) return false
    return true
  }
}
