/**
 * Copyright (c) 2018-present, heineiuo.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Database, IteratorOptions } from 'node-level'
import { EntryValueType, BootBuffer } from 'bootbuffer'
import uuid from 'uuid'

export const symbolKey = Symbol('key')
export const symbolId = Symbol('id')

interface RawDocument {
  [x: string]: EntryValueType
}

interface Document extends RawDocument {
  [symbolKey]: string
  [symbolId]: string
}

interface Filter {
  where?: Condition
  table: string
  limit?: number
}

type ConditionType = 'binary_expr' | 'column_ref' | 'string'
type Operator = 'AND' | 'OR' | 'NOT'

interface Condition {
  type: ConditionType
  operator: Operator
  left: string
  right: EntryValueType
}

export async function parseRawDocument(docBuf: Buffer): Promise<RawDocument> {
  const doc: RawDocument = {}
  for await (const bbEntry of BootBuffer.read(docBuf)) {
    doc[bbEntry.key] = bbEntry.value
  }
  return doc
}

export async function* tableIterator(
  db: Database,
  tableName: string,
  afterId?: string
): AsyncIterableIterator<Document> {
  const options = new IteratorOptions()
  options.start = `${tableName}/${afterId || ''}`
  for await (const entry of db.iterator(options)) {
    const key = `${entry.key}`
    const id = key.substr(`${tableName}/`.length)
    const doc: Document = {
      [symbolId]: id,
      [symbolKey]: key,
    }
    Object.assign(doc, await parseRawDocument(entry.value))
    yield doc
  }
}

export async function insert(
  db: Database,
  tableName: string,
  doc: RawDocument
): Promise<Document> {
  const id = uuid.v1()
  const key = `${tableName}/${id}`
  const doc2: Document = { [symbolId]: id, [symbolKey]: key, ...doc }
  const bb = new BootBuffer()
  for (const name in doc) {
    bb.add(name, doc[name])
  }
  await db.put(key, bb.buffer)
  return doc2
}

export async function update(
  db: Database,
  tableName: string,
  id: string,
  doc: RawDocument
): Promise<Document> {
  const key = `${tableName}/${id}`
  const value = await db.get(key)
  if (!value) throw new Error('Not found')
  const rawdoc = await parseRawDocument(value)
  Object.assign(rawdoc, doc)
  const bb = new BootBuffer()
  for (const name in rawdoc) {
    bb.add(name, rawdoc[name])
  }
  await db.put(key, bb.buffer)
  const newdoc: Document = {
    [symbolId]: id,
    [symbolKey]: key,
    ...rawdoc,
  }
  return newdoc
}

export async function remove(
  db: Database,
  tableName: string,
  id: string
): Promise<void> {
  const key = `${tableName}/${id}`
  await db.del(key)
}

export async function query(db: Database, filter: Filter): Promise<Document[]> {
  const results: Document[] = []
  const { table, where, limit = 10 } = filter
  const options = new IteratorOptions()
  options.start = `${table}/`
  for await (const doc of tableIterator(db, table)) {
    if (!where) {
      results.push(doc)
    } else {
      const { left, right } = where
      if (doc[left] === right) {
        results.push(doc)
      }
    }
    if (results.length >= limit) break
  }

  return results
}
