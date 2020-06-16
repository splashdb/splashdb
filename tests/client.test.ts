import localNode from '../fixtures/local-node'
import { SplashdbSampleClient } from '../fixtures/SampleClient'

global.TextEncoder = require('util').TextEncoder
global.TextDecoder = require('util').TextDecoder

jest.setTimeout(60000 * 10)

let unloadNode = async (): Promise<void> => {
  return
}

beforeAll(async () => {
  unloadNode = await localNode()
})

afterAll(async () => {
  await unloadNode()
})

describe('Call methods', () => {
  test('put/get/del/iterator', async (done) => {
    const client = new SplashdbSampleClient()
    const getresult = await client.get('key')
    expect(getresult).toEqual(null)
    await client.put('key', 'value')
    const getresult1 = await client.get('key')
    expect(getresult1).toEqual(new TextEncoder().encode('value'))
    await client.del('key')
    const getresult2 = await client.get('key')
    expect(getresult2).toEqual(null)
    for await (const entry of client.iterator({ reverse: false })) {
      // console.log(`[test] `, entry)
    }
    await client.destroy()
    done()
  })
})
