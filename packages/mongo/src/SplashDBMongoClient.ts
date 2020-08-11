import { SplashdbBasicClient, Http2SessionDaemon } from '@splashdb/shared'
import { BootBuffer } from 'bootbuffer'
import { v1 as uuidv1 } from 'uuid'
import BSON from 'bson'
import {
  MongoRawDocument,
  MongoDocument,
  MongoOperator,
  MongoOption,
  MongoValueType,
} from '@splashdb/mongo-types'
import { PDClient } from './PDClient'
import { SplashDBMongoOptions } from './SplashDBMongoOptions'

function uuidV1Compare(a: string, b: string): -1 | 0 | 1 {
  a = a.replace(/^(.{8})-(.{4})-(.{4})/, '$3-$2-$1')
  b = b.replace(/^(.{8})-(.{4})-(.{4})/, '$3-$2-$1')
  return a < b ? -1 : a > b ? 1 : 0
}

export function cleanDocument<T extends { [x: string]: unknown }>(obj: T): T {
  const propNames = Object.getOwnPropertyNames(obj)
  for (let i = 0; i < propNames.length; i++) {
    const propName = propNames[i]
    if (obj[propName] === null || obj[propName] === undefined) {
      delete obj[propName]
    }
  }
  return obj
}

export class SplashdbClientMogno {
  pdClient: PDClient
  options: SplashDBMongoOptions
  basicClient: SplashdbBasicClient
  sessionDaemon: Http2SessionDaemon

  constructor(options: SplashDBMongoOptions) {
    this.options = options
    this.pdClient = new PDClient(options)
    this.sessionDaemon = new Http2SessionDaemon(this.pdClient, this.options)
    this.basicClient = new SplashdbBasicClient(this.sessionDaemon, options)
  }

  parseRawDocument(entry: { key: any; value: Buffer }): MongoRawDocument {
    let doc: MongoRawDocument = {}
    let error = null
    try {
      doc = BSON.deserialize(entry.value)
    } catch (e) {
      error = e
    }
    if (error) {
      if (this.options.debug)
        console.log(
          `[client-mongo] Deserialize with BSON failed, fallback to BootBuffer`
        )
      try {
        for (const bbEntry of BootBuffer.readSync(entry.value)) {
          doc[bbEntry.key] = bbEntry.value
        }
        error = null
      } catch (e) {
        error = e
        if (this.options.debug) {
          console.warn(
            `[client-mongo] document(key=${entry.key}) parsed with error, maybe broken or not encoded with bootbuffer`
          )
        }
      }
    }

    return doc
  }

  async *tableIterator<T extends MongoDocument>(
    db: string,
    tableName: string,
    afterId?: string
  ): AsyncIterableIterator<T> {
    const options = {
      start: `${tableName}/${afterId || ''}`,
    }
    for await (const entry of this.basicClient.iterator(db, options)) {
      const key = `${entry.key}`
      if (!key.startsWith(options.start)) break
      if (key === options.start) continue
      const id = key.substr(`${tableName}/`.length)
      const doc: MongoDocument = {
        _id: id,
      }
      Object.assign(doc, this.parseRawDocument(entry))
      yield doc as T
    }
  }

  async insertById<T extends MongoDocument>(
    db: string,
    tableName: string,
    id: string,
    doc: Omit<T, '_id'>
  ): Promise<T> {
    const key = `${tableName}/${id}`
    const doc2 = { _id: id, ...doc } as T
    await this.basicClient.put(db, key, BSON.serialize(doc))
    return doc2
  }

  async insert<T extends MongoDocument>(
    db: string,
    tableName: string,
    doc: MongoRawDocument
  ): Promise<T> {
    const id = uuidv1()
    const key = `${tableName}/${id}`
    const doc2 = { _id: id, ...doc } as T
    await this.basicClient.put(db, key, BSON.serialize(doc))

    return doc2
  }

  async getById<T extends MongoDocument>(
    db: string,
    tableName: string,
    id: string
  ): Promise<T | void> {
    const key = `${tableName}/${id}`
    const value = await this.basicClient.get(db, key)
    if (!value) return

    const rawdoc = this.parseRawDocument({ key, value: Buffer.from(value) })
    const doc: MongoDocument = {
      _id: id,
      ...rawdoc,
    }
    return doc as T
  }

  async update<T extends MongoDocument>(
    db: string,
    tableName: string,
    id: string,
    doc: MongoRawDocument
  ): Promise<T> {
    const key = `${tableName}/${id}`
    const value = await this.basicClient.get(db, key)
    if (!value) throw new Error('Not found')
    const rawdoc = this.parseRawDocument({ key, value: Buffer.from(value) })
    Object.assign(rawdoc, cleanDocument(doc))
    await this.basicClient.put(db, key, BSON.serialize(rawdoc))

    const newdoc: MongoDocument = {
      _id: id,
      ...rawdoc,
    }
    return newdoc as T
  }

  async remove(db: string, tableName: string, id: string): Promise<void> {
    const key = `${tableName}/${id}`
    await this.basicClient.del(db, key)
  }

  match<T extends MongoDocument>(
    operator: MongoOperator,
    doc: T,
    fieldValue?: MongoValueType
  ): boolean {
    if ('$and' in operator) {
      if (!Array.isArray(operator.$and)) {
        throw new Error('Invalid value for operator $and')
      }
      for (let i = 0; i < operator.$and.length; i++) {
        const exp = operator.$and[i]
        if (!this.match(exp, doc, fieldValue)) {
          return false
        }
      }
      return true
    } else if ('$or' in operator) {
      if (!Array.isArray(operator.$or)) {
        throw new Error('Invalid value for operator $and')
      }
      for (let i = 0; i < operator.$or.length; i++) {
        const exp = operator.$or[i]

        if (this.match(exp, doc, fieldValue)) {
          return true
        }
      }
      return false
    } else if ('$nor' in operator) {
      if (!Array.isArray(operator.$nor)) {
        throw new Error('Invalid value for operator $and')
      }
      for (let i = 0; i < operator.$nor.length; i++) {
        const exp = operator.$nor[i]

        if (this.match(exp, doc, fieldValue)) {
          return false
        }
      }
      return true
    } else if ('$ne' in operator) {
      if (typeof operator.$ne === 'object') {
        return JSON.stringify(fieldValue) !== JSON.stringify(operator.$ne)
      }
      return fieldValue !== operator.$ne
    } else if ('$gt' in operator) {
      return fieldValue > operator.$gt
    } else if ('$gte' in operator) {
      return fieldValue >= operator.$gte
    } else if ('$lt' in operator) {
      return fieldValue < operator.$lt
    } else if ('$lte' in operator) {
      return fieldValue <= operator.$lte
    } else if ('$in' in operator) {
      if (!Array.isArray(operator.$in)) {
        throw new Error('Invalid value for $in')
      }
      return operator.$in.includes(fieldValue)
    } else if ('$nin' in operator) {
      if (!Array.isArray(operator.$nin)) {
        throw new Error('Invalid value for $in')
      }
      return !operator.$nin.includes(fieldValue)
    } else if ('$where' in operator) {
      if (typeof operator.$where !== 'function') {
        throw new Error('Invalid value for $where')
      }
      return operator.$where(doc)
    } else if ('$regex' in operator) {
      if (!(operator.$regex instanceof RegExp)) {
        throw new Error('Invalid value for $regex')
      }
      if (typeof fieldValue === 'string') {
        return operator.$regex.test(fieldValue)
      }
      return false
    } else if ('$size' in operator) {
      if (Array.isArray(fieldValue)) {
        return operator.$size === fieldValue.length
      }
      return false
    } else if ('$all' in operator) {
      if (Array.isArray(fieldValue) && Array.isArray(operator.$all)) {
        for (const value of operator.$all) {
          if (!fieldValue.includes(value)) return false
        }
        return true
      }
      return false
    } else if ('$eq' in operator) {
      const $eqValue = operator.$eq
      if (Array.isArray($eqValue)) {
        if (Array.isArray(fieldValue)) {
          if (fieldValue.includes($eqValue)) return true
          for (const value of $eqValue) {
            if (fieldValue.includes(value)) return true
          }
          return false
        } else {
          return false
        }
      } else if (typeof $eqValue === 'object') {
        return JSON.stringify(fieldValue) === JSON.stringify($eqValue)
      }
      return fieldValue === operator.$eq
    } else {
      const operatorKey = Object.keys(operator)[0]
      if (!operatorKey) return true
      if (operatorKey.startsWith('$')) {
        throw new Error(`Unknown operator ${operatorKey}`)
      }
      const fieldChildValue = (fieldValue || doc)[operatorKey]
      const childOperator = operator[operatorKey]
      if (typeof childOperator === 'object' && !Array.isArray(childOperator)) {
        return this.match(childOperator, doc, fieldChildValue)
      }

      const childOperator2 = { $eq: childOperator }
      return this.match(childOperator2, doc, fieldChildValue)
    }
  }

  async find<T extends MongoDocument>(
    db: string,
    option: MongoOption
  ): Promise<T[]> {
    const results: T[] = []
    const { $collection, $limit = 10 } = option
    for await (const doc of this.tableIterator<T>(db, $collection)) {
      if (option.$defaultFields) {
        Object.assign(doc, option.$defaultFields, { ...doc }, { ID: doc._id })
      }
      if (!this.match<T>(option.$query, doc)) {
        continue
      }
      results.push(doc)
      if (!option.$orderby && results.length >= $limit) break
    }

    if (option.$orderby) {
      const orderby = Object.keys(option.$orderby)[0]
      const isASC = option.$orderby[orderby] === 1
      const sortReturnLeft = isASC ? -1 : 1
      const sortReturnRight = isASC ? 1 : -1

      results.sort((left: T, right: T): 1 | -1 | 0 => {
        const leftFieldValue = left[orderby]
        const rightFieldValue = right[orderby]
        if (orderby === '_id') {
          return uuidV1Compare(
            leftFieldValue as string,
            rightFieldValue as string
          )
        } else {
          return leftFieldValue < rightFieldValue
            ? sortReturnLeft
            : sortReturnRight
        }
      })
    }
    results.splice(0, option.$skip)
    return results.splice(0, $limit)
  }
}
