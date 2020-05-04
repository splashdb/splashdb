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
    $and: [
      {
        count: { $gt: 1 }
      },
      {
        $name: {
          $in: ["apple", "banana"]
        }
      }
    ]
  }, { table: 'fruit' })
}

main()

```