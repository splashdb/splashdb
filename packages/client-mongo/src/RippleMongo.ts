import { SplashdbClient } from '@splashdb/client'
import { EntryValueType, BootBuffer } from 'bootbuffer'
import { v1 as uuidv1 } from 'uuid'

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

export const symbolKey = Symbol('key')
export const symbolId = Symbol('id')

export interface RawDocument {
  [x: string]: EntryValueType
}

export interface Document extends RawDocument {
  [symbolKey]: string
  [symbolId]: string
}

interface MongoOrder {
  [x: string]: 1 | -1
}

type MongoOrderById = {
  [symbolId]: 1 | -1
}

interface MongoOption {
  $collection: string
  $query: MongoOperator
  $limit?: number
  // see ParsedOrder
  $orderby?: MongoOrder | MongoOrderById
  $skip?: number
  //
  $defaultFields?: {
    [x: string]: EntryValueType
  }
}

interface MongoComparison {
  // Comparison Query Operators
  $eq?: EntryValueType
  $gt?: EntryValueType
  $gte?: EntryValueType
  $lt?: EntryValueType
  $lte?: EntryValueType
  $ne?: EntryValueType
  $in?: EntryValueType[]
  $nin?: EntryValueType[]
}

interface MongoArrayOperator {
  $all?: EntryValueType[]
  $elemMatch?: MongoComparison
  $size?: number
}

interface MongoEvaluation {
  // Evaluation Query Operators
  $where?: <T extends Document>(doc: T) => boolean
  $regex?: RegExp
}

interface MongoLogical {
  // Logical Query Operators
  $and?: MongoOperator[]
  $not?: MongoComparison | RegExp
  $nor?: MongoOperator[]
  $or?: MongoOperator[]
}

// interface MongoGeospatial {}
// interface MongoBitwise {}

interface MongoExpression
  extends MongoLogical,
    MongoComparison,
    MongoArrayOperator,
    MongoEvaluation {}

interface MongoOperator extends MongoExpression {
  [x: string]: any
}

export type ValuesOf<T extends any[]> = T[number]

export class SplashdbClientMogno extends SplashdbClient {
  parseRawDocument(docBuf: Buffer): RawDocument {
    const doc: RawDocument = {}
    try {
      for (const bbEntry of BootBuffer.readSync(docBuf)) {
        doc[bbEntry.key] = bbEntry.value
      }
    } catch (e) {
      if (this.options.debug) {
        console.warn(
          '[client-mongo] document parsed with error, maybe broken or not encoded with bootbuffer'
        )
      }
    }
    return doc
  }

  async *tableIterator<T extends Document>(
    tableName: string,
    afterId?: string
  ): AsyncIterableIterator<T> {
    const options = {
      start: `${tableName}/${afterId || ''}`,
    }
    for await (const entry of this.iterator(options)) {
      const key = `${entry.key}`
      if (!key.startsWith(options.start)) break
      if (key === options.start) continue
      const id = key.substr(`${tableName}/`.length)
      const doc: Document = {
        [symbolId]: id,
        [symbolKey]: key,
      }
      Object.assign(doc, this.parseRawDocument(entry.value))
      yield doc as T
    }
  }

  async insertById<T extends Document>(
    tableName: string,
    id: string,
    doc: Omit<T, typeof symbolId | typeof symbolKey>
  ): Promise<T> {
    const key = `${tableName}/${id}`
    const doc2 = { [symbolId]: id, [symbolKey]: key, ...doc } as T
    const bb = new BootBuffer()
    for (const name in doc) {
      bb.add(name, doc[name])
    }
    await this.put(key, bb.buffer)
    return doc2
  }

  async insert<T extends Document>(
    tableName: string,
    doc: RawDocument
  ): Promise<T> {
    const id = uuidv1()
    const key = `${tableName}/${id}`
    const doc2 = { [symbolId]: id, [symbolKey]: key, ...doc } as T
    const bb = new BootBuffer()
    for (const name in doc) {
      bb.add(name, doc[name])
    }
    await this.put(key, bb.buffer)
    return doc2
  }

  async getById<T extends Document>(
    tableName: string,
    id: string
  ): Promise<T | void> {
    const key = `${tableName}/${id}`
    const value = await this.get(key)
    if (!value) return

    const rawdoc = this.parseRawDocument(Buffer.from(value))
    const doc: Document = {
      [symbolId]: id,
      [symbolKey]: key,
      ...rawdoc,
    }
    return doc as T
  }

  async update<T extends Document>(
    tableName: string,
    id: string,
    doc: RawDocument
  ): Promise<T> {
    const key = `${tableName}/${id}`
    const value = await this.get(key)
    if (!value) throw new Error('Not found')
    const rawdoc = this.parseRawDocument(Buffer.from(value))
    Object.assign(rawdoc, cleanDocument(doc))
    const bb = new BootBuffer()
    for (const name in rawdoc) {
      if (typeof rawdoc[name] !== 'undefined') {
        bb.add(name, rawdoc[name])
      }
    }
    await this.put(key, bb.buffer)
    const newdoc: Document = {
      [symbolId]: id,
      [symbolKey]: key,
      ...rawdoc,
    }
    return newdoc as T
  }

  async remove(tableName: string, id: string): Promise<void> {
    const key = `${tableName}/${id}`
    await this.del(key)
  }

  match<T extends Document>(
    operator: MongoOperator | MongoComparison,
    doc: T,
    fieldValue?: EntryValueType
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
      return fieldValue !== operator.$eq
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

  async find<T extends Document>(option: MongoOption): Promise<T[]> {
    const results: T[] = []
    const { $collection, $limit = 10 } = option
    for await (const doc of this.tableIterator<T>($collection)) {
      if (option.$defaultFields) {
        Object.assign(
          doc,
          option.$defaultFields,
          { ...doc },
          { ID: doc[symbolId] }
        )
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
        const leftFieldValue = left[orderby === '_id' ? symbolId : orderby]
        const rightFieldValue = right[orderby === '_id' ? symbolId : orderby]
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
