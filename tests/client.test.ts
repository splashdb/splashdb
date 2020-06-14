import localNode from '../fixtures/local-node'
import { SplashdbSampleClient } from '../fixtures/SampleClient'

global.TextEncoder = require('util').TextEncoder
global.TextDecoder = require('util').TextDecoder

jest.setTimeout(60000 * 10)

let unloadNode = (): void => {
  return
}

afterAll(() => {
  unloadNode()
})

describe('Post Endpoints', () => {
  it('should create a new post', async (done) => {
    unloadNode = await localNode()
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const client = new SplashdbSampleClient()
    await client.ok()
    const getresult = await client.get('key')
    console.log(`[test] result`, getresult, new TextDecoder().decode(getresult))
    client.destroy()
    done()
  })
})
