import { Http2SessionDaemon } from '../shared'
import { SplashdbStorageClient } from '../shared/StorageClient'
import { BootBuffer } from 'bootbuffer'
import { v1 as uuidv1 } from 'uuid'
import BSON from 'bson'
import {
  MongoRawDocument,
  MongoDocument,
  MongoCommandOutput,
  MongoCommandFindOutput,
  MongoCommandUpdateOption,
  MongoCommandUpdateOutput,
  MongoCommandFindAndModifyOption,
  MongoCommandFindAndModifyOutput,
  MongoCommandFindOption,
  MongoCommandInsertOption,
  MongoCommandInsertOutput,
  MongoFilter,
  MongoValueType,
  MongoCommandOption,
  MongoCommandDeleteOption,
  MongoCommandDeleteOutput,
} from '../shared/MongoTypes'
import { PDClient } from '../shared/PDClient'
import { MongoOptions } from './MongoOptions'

export function uuidV1Compare(a: string, b: string): -1 | 0 | 1 {
  a = a.replace(/^(.{8})-(.{4})-(.{4})/, '$3-$2-$1')
  b = b.replace(/^(.{8})-(.{4})-(.{4})/, '$3-$2-$1')
  return a < b ? -1 : a > b ? 1 : 0
}

function stringToRegExp(str: string): RegExp {
  let str2 = str
  while (str2.startsWith('/')) {
    str2 = str2.substr(1)
  }
  while (str2.endsWith('/')) {
    str2 = str2.substr(0, str2.length - 1)
  }
  return new RegExp(str2)
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

export class MongoCommandHandler {
  pdClient: PDClient
  options: MongoOptions
  basicClient: SplashdbStorageClient
  sessionDaemon: Http2SessionDaemon

  constructor(options: MongoOptions) {
    this.options = options
    this.pdClient = new PDClient(options)
    this.sessionDaemon = new Http2SessionDaemon(this.pdClient, this.options)
    this.basicClient = new SplashdbStorageClient(this.sessionDaemon, options)
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
          `document(${entry.key}) parsed with BSON failed because ${error.message}, fallback to BootBuffer`
        )
      try {
        for (const bbEntry of BootBuffer.readSync(entry.value)) {
          doc[bbEntry.key] = bbEntry.value
        }
        console.log('fallback to bootbuffer success', doc)
        error = null
      } catch (e) {
        error = e
        if (this.options.debug) {
          console.warn(
            `[client-mongo] document(${entry.key}) parsed faield because ${e.message}, maybe broken or not encoded with bootbuffer`,
            entry.value
          )
        }
      }
    }

    return doc
  }

  async runCommand<T>(
    db: string,
    option: MongoCommandFindOption<T>
  ): Promise<MongoCommandFindOutput<T>>

  async runCommand<T>(
    db: string,
    option: MongoCommandInsertOption<T>
  ): Promise<MongoCommandInsertOutput>

  async runCommand<T>(
    db: string,
    option: MongoCommandFindAndModifyOption<T>
  ): Promise<MongoCommandFindAndModifyOutput<T>>

  async runCommand<T>(
    db: string,
    option: MongoCommandDeleteOption
  ): Promise<MongoCommandDeleteOutput>

  async runCommand<T>(
    db: string,
    option: MongoCommandUpdateOption<T>
  ): Promise<MongoCommandUpdateOutput<T>>

  async runCommand<T extends MongoRawDocument>(
    db: string,
    options: MongoCommandOption<T>
  ): Promise<MongoCommandOutput<T & { _id: string }>> {
    if ('find' in options) {
      const data = await this.find<T & { _id: string }>(db, options)
      return {
        _data: BSON.serialize(data),
        cursor: {
          toArray: async (): Promise<(T & { _id: string })[]> => {
            return Promise.resolve(data)
          },
        },
        n: data.length,
        ok: 1,
      }
    } else if ('insert' in options) {
      return await this.insert<T>(db, options)
    } else if ('delete' in options) {
      return await this.delete(db, options)
    } else if ('update' in options && 'updates' in options) {
      return await this.update(db, options)
    } else if ('findAndModify' in options) {
      return await this.findAndModify<T>(db, options)
    }
    throw new Error('Unknown command')
  }

  async findAndModify<T extends MongoRawDocument>(
    db: string,
    option: MongoCommandFindAndModifyOption<T>
  ): Promise<MongoCommandFindAndModifyOutput<T & { _id: string }>> {
    const {
      findAndModify: collection,
      query,
      update,
      sort,
      new: optionNew = false,
      upsert = false,
      remove = false,
    } = option
    let value = {} as T & { _id: string }
    // Although the query may match multiple documents,
    // findAndModify will only select one document to modify.
    const results = !query
      ? []
      : await this.find(db, {
          find: collection,
          filter: query,
          sort,
          limit: 1,
        })
    const result = results[0]
    let shouldUpsert = false
    let shouldRemove = false
    let shouldUpdate = false
    if (!result) {
      if (upsert) shouldUpsert = true
    } else {
      if (remove) {
        shouldRemove = true
      } else {
        shouldUpdate = true
      }
    }
    if (shouldUpsert) {
      const id = typeof update._id === 'string' ? update._id : uuidv1()
      delete update._id
      value = await this.insertById<T>(db, collection, id, update)
    } else {
      const oldDoc = result as T & { _id: string }
      const { _id: id, ...doc } = oldDoc
      const key = `${collection}/${id}`
      if (shouldRemove) {
        await this.basicClient.del(db, key)
        value = oldDoc
      } else if (shouldUpdate) {
        const newdoc = {
          ...doc,
          ...update,
        }
        await this.basicClient.put(db, key, BSON.serialize(newdoc))
        value = optionNew ? { ...newdoc, _id: id } : oldDoc
      }
    }

    return {
      ok: 1,
      value,
    }
  }

  async *tableIterator<T extends MongoRawDocument>(
    db: string,
    collection: string,
    afterId?: string
  ): AsyncIterableIterator<T & { _id: string }> {
    const options = {
      start: `${collection}/${afterId || ''}`,
    }
    for await (const entry of this.basicClient.iterator(db, options)) {
      const key = `${entry.key}`
      if (!key.startsWith(options.start)) break
      if (key === options.start) continue
      const id = key.substr(`${collection}/`.length)
      const doc: MongoDocument = {
        _id: id,
      }
      Object.assign(doc, this.parseRawDocument(entry))
      yield doc as T & { _id: string }
    }
  }

  async insertById<T extends MongoRawDocument>(
    db: string,
    collection: string,
    id: string,
    doc: T
  ): Promise<T & { _id: string }> {
    const key = `${collection}/${id}`
    const doc2 = { _id: id, ...doc } as T & { _id: string }
    await this.basicClient.put(db, key, BSON.serialize(doc))
    return doc2
  }

  async insert<T extends MongoRawDocument>(
    db: string,
    option: MongoCommandInsertOption<T>
  ): Promise<MongoCommandInsertOutput> {
    const { insert: document, documents } = option
    if (documents && documents.length > 0) {
      const results = await Promise.all(
        documents.map(async (doc) => {
          const id = doc._id || uuidv1()
          delete doc._id
          const key = `${document}/${id}`
          const doc2 = { _id: id, ...doc }
          await this.basicClient.put(db, key, BSON.serialize(doc))
          return doc2
        })
      )
      return { n: results.length, ok: 1 }
    }
    return { n: 0, ok: 1 }
  }

  async getById<T extends MongoDocument>(
    db: string,
    collection: string,
    id: string
  ): Promise<T | void> {
    const key = `${collection}/${id}`
    const value = await this.basicClient.get(db, key)
    if (!value) return

    const rawdoc = this.parseRawDocument({ key, value: Buffer.from(value) })
    const doc: MongoDocument = {
      _id: id,
      ...rawdoc,
    }
    return doc as T
  }

  async update<T extends MongoRawDocument>(
    db: string,
    option: MongoCommandUpdateOption<T>
  ): Promise<MongoCommandUpdateOutput<T>> {
    const { update: collection, updates } = option
    let n = 0
    const upserted: (T & { _id: string })[] = []
    if (updates && updates.length > 0) {
      for await (const state of updates) {
        const { upsert = false, multi = false } = state
        const results = await this.find(db, {
          find: collection,
          limit: multi ? 0 : 1,
          filter: state.q,
        })
        let shouldUpsert = false
        let shouldUpdate = false
        if (results.length === 0) {
          if (upsert) {
            shouldUpdate = false
            shouldUpsert = true
          }
        } else {
          shouldUpsert = false
          shouldUpdate = true
        }
        if (shouldUpdate) {
          for (const item of results) {
            const key = `${collection}/${item._id}`
            delete state.u._id
            const newdoc = Object.assign({}, item, cleanDocument(state.u))
            await this.basicClient.put(db, key, BSON.serialize(newdoc))
            n += 1
          }
        } else if (shouldUpsert) {
          const id = typeof state.u._id === 'string' ? state.u._id : uuidv1()
          const key = `${collection}/${id}`
          const newdoc = cleanDocument(state.u)
          await this.basicClient.put(db, key, BSON.serialize(newdoc))
          upserted.push({ ...newdoc, _id: id })
          n += 1
        }
      }
    }
    return { ok: 1, n, upserted }
  }

  async delete(
    db: string,
    options: MongoCommandDeleteOption
  ): Promise<MongoCommandDeleteOutput> {
    const { delete: collection, deletes } = options
    let n = 0
    if (deletes && deletes.length > 0) {
      for await (const state of deletes) {
        const results = await this.find(db, {
          find: collection,
          filter: state.q,
          limit: state.limit,
        })

        for (const item of results) {
          const key = `${collection}/${item._id}`
          await this.basicClient.del(db, key)
          n += 1
        }
      }
    }

    return { ok: 1, n }
  }

  match<T extends MongoDocument>(
    filter: MongoFilter,
    doc: T,
    fieldValue?: MongoValueType
  ): boolean {
    const operator = filter
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
    } else if (operator['$regex']) {
      let regex = operator.$regex as RegExp
      if (typeof operator.$regex === 'string') {
        regex = stringToRegExp(operator.$regex)
      }
      if (typeof fieldValue === 'string') {
        return regex.test(fieldValue)
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
    option: MongoCommandFindOption<T>
  ): Promise<T[]> {
    const results: T[] = []
    const { find: collection, limit = 10, skip = 0 } = option
    if (option.filter && typeof option.filter._id === 'string') {
      const doc = await this.getById(db, collection, option.filter._id)
      if (doc) return [doc] as T[]
      return []
    }
    for await (const doc of this.tableIterator<T>(db, collection)) {
      // if (option.$defaultFields) {
      //   Object.assign(doc, option.$defaultFields, { ...doc }, { ID: doc._id })
      // }
      if (option.filter) {
        if (!this.match<T>(option.filter, doc)) {
          continue
        }
      }
      results.push(doc)
      // limit === 0 means no limit
      if (!option.sort && results.length >= limit && limit > 0) break
    }

    if (option.sort) {
      const orderby = Object.keys(option.sort)[0]
      const isASC = option.sort[orderby] === 1
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

    // limit === 0 means no limit
    if (limit === 0) {
      return results.splice(skip) as T[]
    }
    return results.splice(skip, limit) as T[]
  }
}
