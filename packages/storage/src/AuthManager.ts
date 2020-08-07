import { SplashDBServerOptions } from './Options'
import { DBManager } from './DBManager'
import { BootBuffer } from 'bootbuffer'

type SplashRoleName = 'admin' | 'read' | 'readWrite'

type SplashRole = {
  db: string
  role: SplashRoleName
}

type SplashAuthData = {
  user: string
  password: string
}

const methodsRequireWritePermission = ['put', 'del', 'batch']

export class AuthManager {
  constructor(options: Required<SplashDBServerOptions>, dbmanager: DBManager) {
    this.options = options
    this.dbmanager = dbmanager
    this.roleCache = new Map<string, SplashRole>()
  }

  options: Required<SplashDBServerOptions>
  dbmanager: DBManager
  roleCache: Map<string, SplashRole>

  async can(
    authorization: string,
    method: string,
    dbname: string
  ): Promise<boolean> {
    try {
      if (!authorization) return false
      if (!this.roleCache.has(authorization)) {
        const parsedAuthorization = this.parseAuthorization(authorization)
        if (!parsedAuthorization) {
          return false
        }
        if (parsedAuthorization.user === 'admin') {
          if (parsedAuthorization.password === this.options.adminPassword) {
            this.roleCache.set(authorization, { role: 'admin', db: 'system' })
            return true
          } else {
            return false
          }
        }
        const db = this.dbmanager.getDB('system')
        if (!db) return false
        const record = await db.get(
          `/user/${dbname}/${parsedAuthorization.user}`
        )

        if (!record) return false
        const result: { [x: string]: any } = {}
        for await (const entry of BootBuffer.read(Buffer.from(record))) {
          result[entry.key] = entry.value
        }
        if (result.password !== parsedAuthorization.password) return false
        const { role } = result
        this.roleCache.set(authorization, { role, db: dbname })
      }

      const role = this.roleCache.get(authorization)
      if (!role) return false
      if (role.role === 'admin') return true
      if (dbname !== role.db) return false
      if (
        methodsRequireWritePermission.includes(method) &&
        role.role === 'read'
      ) {
        return false
      }
      return true
    } catch (e) {
      console.error(e)
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
