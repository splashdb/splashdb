import fs from 'fs'
import path from 'path'
import { SplashdbClient } from '../src'

global.TextEncoder = require('util').TextEncoder
global.TextDecoder = require('util').TextDecoder

jest.setTimeout(60000 * 10)

describe('Call methods', () => {
  test('put/get/del/iterator', async (done) => {
    const uri = await fs.promises.readFile(
      path.resolve(__dirname, '../../../mocks/mongo-node-url.txt'),
      'utf8'
    )
    const client = new SplashdbClient(uri)
    try {
      const promise = client.find({
        $collection: 'user',
        $query: {},
      })

      const results = await promise
      console.log(results)
    } catch (e) {
      console.error(e)
      throw e
    } finally {
      await client.destroy()
      done()
    }
  })
})
