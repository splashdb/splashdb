import fs from 'fs'
import path from 'path'
import { SplashdbClient } from '../src'

global.TextEncoder = require('util').TextEncoder
global.TextDecoder = require('util').TextDecoder

jest.setTimeout(60000 * 10)

describe('Call methods', () => {
  test('find', async (done) => {
    const uri = await fs.promises.readFile(
      path.resolve(__dirname, '../../../mocks/mongo-node-url.txt'),
      'utf8'
    )
    const client = new SplashdbClient(uri)
    try {
      console.time('find')
      const results = await client.runCommand({
        find: 'user',
        filter: {},
      })
      const data = await results.cursor.toArray()
      console.timeEnd('find')
      // const results2 = await client.runCommand({
      //   insert: 'user',
      //   documents: [
      //     {
      //       username: 'apple',
      //       password: '123456',
      //     },
      //   ],
      // })
      // console.log(results2)
      // const results3 = await client.runCommand({
      //   find: 'user',
      //   filter: {},
      // })
      // console.log(results3)
    } catch (e) {
      console.error(e)
      throw e
    } finally {
      await client.destroy()
      done()
    }
  })
})
