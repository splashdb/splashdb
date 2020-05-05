# RippleMongo


## Usage

```ts
import path from 'path'
import { Database } from 'rippledb'
import { RippleMongo } from 'ripplemongo'

async function main(){
  const db = new Database(path.resolve(__dirname, './db'))
  const mongo = new RippleMongo(db)

  const results = await mongo.find({
    $collection: 'fruit',
    $skip: 10, 
    $orderby: { count: 1 },
    $query: {
      $and: [
        {
          count: { $gt: 1 }
        },
        {
          category: {
            $in: ["apple", "banana"]
          }
        }
      ]
    }
  }
}

main()

```