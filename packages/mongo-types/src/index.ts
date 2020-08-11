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

export interface MongoOption {
  $collection: string
  $query: MongoOperator
  $limit?: number
  // see ParsedOrder
  $orderby?: MongoOrder
  $skip?: number
  //
  $defaultFields?: {
    [x: string]: MongoValueType
  }
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
  $where?: <T extends MongoDocument>(doc: T) => boolean
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

export interface MongoOperator extends MongoExpression, MongoComparison {
  [x: string]: MongoValueType
}

export type MongoCommand = 'query' | 'update' | 'insert' | 'remove'
