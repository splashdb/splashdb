import path from 'path'
import { Database } from 'rippledb'
import { StorageOptions } from './StorageOptions'

export class StorageDBManager {
  constructor(options: Required<StorageOptions>) {
    this.options = options
    this.dbCache = new Map<string, Database>()
  }

  options: Required<StorageOptions>

  dbCache: Map<string, Database>

  getDB(name: string): Database {
    if (!this.dbCache.has(name)) {
      const db = new Database(
        path.resolve(process.cwd(), this.options.dbpath, `./${name}`)
      )
      this.dbCache.set(name, db)
    }
    return this.dbCache.get(name) as Database // make lint happy
  }

  async destroy(): Promise<void> {
    for (const entry of this.dbCache) {
      await entry[1]?.close()
    }
  }
}
