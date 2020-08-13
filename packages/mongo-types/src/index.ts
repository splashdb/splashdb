type MongoValueType = any

// export type ValuesOf<T extends any[]> = T[number]

export interface MongoRawDocument {
  [x: string]: MongoValueType
}

export interface MongoDocument extends MongoRawDocument {
  _id: string
}

interface MongoOrder {
  [x: string]: 1 | -1
}

interface MongoComparison {
  // Comparison Query Operators
  $eq?: MongoValueType
  $gt?: MongoValueType
  $gte?: MongoValueType
  $lt?: MongoValueType
  $lte?: MongoValueType
  $ne?: MongoValueType
  $in?: MongoValueType[]
  $nin?: MongoValueType[]
}

interface MongoArrayOperator {
  $all?: MongoValueType[]
  $elemMatch?: MongoComparison
  $size?: number
}

interface MongoEvaluation {
  // Evaluation Query Operators
  $where?: <T extends MongoRawDocument & { _id?: string }>(doc: T) => boolean
  $regex?: RegExp
}

interface MongoLogical {
  // Logical Query Operators
  $and?: MongoFilter[]
  $not?: MongoComparison | RegExp
  $nor?: MongoFilter[]
  $or?: MongoFilter[]
}

// interface MongoGeospatial {}
// interface MongoBitwise {}

interface MongoExpression
  extends MongoLogical,
    MongoComparison,
    MongoArrayOperator,
    MongoEvaluation {}

export interface MongoFilter extends MongoExpression, MongoComparison {
  [x: string]: MongoValueType
}

export interface MongoOption {
  $collection: string
  $query: MongoFilter
  $limit?: number
  // see ParsedOrder
  $orderby?: MongoOrder
  $skip?: number
  //
  $defaultFields?: {
    [x: string]: MongoValueType
  }
}

const MongoReadAndRwiteCommands = [
  'delete',
  'find',
  'findAndModify',
  'insert',
  'update',
] as const

export const MongoAggregrationCommands = ['count'] as const

export const MongoCommandNames = [
  ...MongoReadAndRwiteCommands,
  ...MongoAggregrationCommands,
]

export type MongoCommandName = typeof MongoCommandNames[number]

export type MongoCollectionName = string

export type MongoCommandCollection = {
  [x in MongoCommandName]?: MongoCollectionName
}

interface MongoCommandUpdateOption<T extends MongoRawDocument> {
  update: MongoCollectionName
  updates: {
    q?: MongoFilter
    u: T
    upsert?: boolean
    multi?: boolean
  }[]
  ordered?: boolean
}

interface MongoCommandDeleteOption {
  delete: MongoCollectionName
  deletes: {
    q: MongoFilter
    // limit: The number of matching documents to delete. Specify either a 0 to delete all matching documents or 1 to delete a single document.
    limit: 1 | 0
  }[]
  ordered?: boolean
}

interface MongoCommandFindOption<T extends MongoRawDocument> {
  find: MongoCollectionName
  filter?: MongoFilter
  query?: MongoFilter
  skip?: number
  limit?: number
  sort?: {
    [x in keyof T]?: 1 | 0
  }
  projection?: {
    [x in keyof T]?: 1 | 0
  }
}

/**
 * findAndModify will only select one document to modify.
 */
interface MongoCommandFindAndModifyOption<T extends MongoRawDocument> {
  findAndModify: MongoCollectionName
  remove: boolean
  upsert: boolean
  // new: When true, returns the modified document rather than the original. The findAndModify method ignores the new option for remove operations. The default is false.
  new: boolean
  query?: MongoFilter
  skip?: number
  update: T
  sort?: {
    [x in keyof T]?: 1 | 0
  }
  fields?: {
    [x in keyof T]?: 1 | 0
  }
}

interface MongoCommandInsertOption<T extends MongoRawDocument> {
  insert: MongoCollectionName
  documents?: T[]
  ordered?: boolean
}

interface MongoCommandCountOption {
  count: MongoCollectionName
}

export type MongoCommandOption<T extends MongoRawDocument> =
  | MongoCommandUpdateOption<T>
  | MongoCommandFindOption<T>
  | MongoCommandInsertOption<T>
  | MongoCommandFindAndModifyOption<T>
  | MongoCommandDeleteOption
  | MongoCommandCountOption

type MongoCursor<T> = {
  toArray(): Promise<T[]>
}

export interface MongoCommandFindOutput<T> {
  _data?: Buffer
  cursor: MongoCursor<T>
  n: number
  ok: 0 | 1
}

export interface MongoCommandDeleteOutput {
  n: number
  ok: 0 | 1
}

export interface MongoCommandInsertOutput {
  n: number
  ok: 0 | 1
}

export interface MongoCommandUpdateOutput<T> {
  n: number
  ok: 0 | 1
  upserted: (T & { _id: string })[]
}

export interface MongoCommandFindAndModifyOutput<T extends MongoRawDocument> {
  ok: 0 | 1
  value: T & { _id: string }
}

export type MongoCommandOutput<T extends MongoRawDocument> =
  | MongoCommandFindOutput<T & { _id: string }>
  | MongoCommandDeleteOutput
  | MongoCommandFindAndModifyOutput<T>
  | MongoCommandUpdateOutput<T>
  | MongoCommandInsertOutput

// export const exampleOption: MongoCommandOption<{
//   _id: string
//   gender: number
// }> = {
//   find: 'user',
//   filter: {
//     gender: 1,
//   },
//   projection: {
//     _id: 1,
//     gender: 1,
//   },
// }
