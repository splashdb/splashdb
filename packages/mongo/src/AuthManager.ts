import { BootBuffer } from 'bootbuffer'
import { SplashDBMongoOptions } from './SplashDBMongoOptions'
import { SplashdbClientMogno } from './SplashDBMongoClient'

type SplashRoleName = 'admin' | 'read' | 'readWrite'

type SplashRole = {
  db: string
  role: SplashRoleName
}

type SplashAuthData = {
  user: string
  password: string
}

const methodsRequireWritePermission = ['update', 'insert', 'remove']

export class AuthManager {
  constructor(
    options: Pick<SplashDBMongoOptions, 'adminPassword'>,
    client: SplashdbClientMogno
  ) {
    this.db = 'system'
    this.client = client
    this.options = options
    this.roleCache = new Map<string, SplashRole>()
  }

  db: string
  client: SplashdbClientMogno
  options: Pick<SplashDBMongoOptions, 'adminPassword'>
  roleCache: Map<string, SplashRole>

  async can(
    authorization?: string,
    method?: string | string[],
    dbname?: string | string[]
  ): Promise<boolean> {
    try {
      if (!authorization) return false
      if (typeof method !== 'string') return false
      if (typeof dbname !== 'string') return false
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
        const record = await this.client.getById(
          this.db,
          'user',
          `${dbname}/${parsedAuthorization.user}`
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
