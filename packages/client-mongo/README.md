# @splashdb/client-mongo

**Experimental Mongo-style wrapper for Splashdb Client**

Never use it in production.



## Usage

```ts
import { SplashdbClientMongo } from '@splashdb/client-mongo'

async function main(){
  const mongo = new SplashdbClientMongo({ uri: "https://username:passwordlocalhost:8443/system" })

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
