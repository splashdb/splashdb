import BSON from 'bson'
import { MongoCommandOption } from '../MongoTypes'
import { MongoOptions } from './MongoOptions'
import { MongoCommandHandler } from './MongoCommandHandler'

type SplashRoleName = 'admin' | 'read' | 'readWrite'

type SplashAuthData = {
  user: string
  password: string
}

export class MongoAuthManager {
  constructor(
    options: Pick<MongoOptions, 'adminPassword'>,
    handler: MongoCommandHandler
  ) {
    this.db = 'system'
    this.handler = handler
    this.options = options
    this.roleCache = new Map<string, SplashRoleName>()
  }

  db: string
  handler: MongoCommandHandler
  options: Pick<MongoOptions, 'adminPassword' | 'debug'>
  roleCache: Map<string, SplashRoleName>

  async can(
    authorization: string,
    commandOption: MongoCommandOption<{}>,
    dbname = this.db
  ): Promise<boolean> {
    try {
      if (!authorization) return false
      if (typeof commandOption !== 'object') return false
      const roleCacheId = `${authorization}:${dbname}`

      if (!this.roleCache.has(roleCacheId)) {
        const parsedAuthorization = this.parseAuthorization(authorization)
        if (this.options.debug) {
          console.log(
            'authed as ',
            parsedAuthorization ? parsedAuthorization.user : 'guest'
          )
        }
        if (!parsedAuthorization) {
          return false
        }
        if (parsedAuthorization.user === 'admin') {
          if (parsedAuthorization.password === this.options.adminPassword) {
            this.roleCache.set(roleCacheId, 'admin')
            return true
          } else {
            return false
          }
        }
        const record = await this.handler.basicClient.get(
          this.db,
          `user/${dbname}/${parsedAuthorization.user}`
        )

        if (!record) return false
        const result = BSON.deserialize(Buffer.from(record))
        if (result.password !== parsedAuthorization.password) return false
        const { role } = result
        this.roleCache.set(roleCacheId, role)
      }

      const role = this.roleCache.get(roleCacheId)
      if (!role) return false
      if (role === 'admin') return true
      if (role === 'read' && !('find' in commandOption)) {
        return false
      }
      return true
    } catch (e) {
      if (this.options.debug) console.error(e)
      return false
    }
  }

  parseAuthorization(authorization: string): SplashAuthData | void {
    try {
      const hex = authorization.substr('Basic '.length)
      const [user, password] = Buffer.from(hex, 'base64').toString().split(':')
      if (!!user && !!password) {
        return { user, password }
      }
    } catch (e) {}
  }
}
