import { setup } from './setup'
import { SplashdbSampleClient } from '../fixtures/SampleClient'

async function main(): Promise<void> {
  try {
    console.log('')
    const client = new SplashdbSampleClient()
    // await client.del('key')
    // const getresult = await client.get('key')
    // console.log(`[run-client] getresult`, getresult)
    await client.put('key', 'value')
    await client.put('key1', 'value')
    await client.put('key2', 'value')
    await client.put('key3', 'value')
    await client.put('key4', 'value')
    await client.put('key5', 'value')
    await client.put('key6', 'value')
    await client.put('key7', 'value')
    // const getresult2 = await client.get('key')
    // console.log(`[run-client] getresult2`, getresult2)
    // console.time(`[client] each iterator`)
    for await (const entry of client.iterator({
      reverse: false,
    })) {
      console.log(
        `[client] iteraotr: `,
        new TextDecoder().decode(entry.key),
        new TextDecoder().decode(entry.value)
      )
      console.timeEnd(`[client] each iterator`)
      console.time(`[client] each iterator`)

      // console.log(
      //   `[run-client] got entry: key=${new TextDecoder().decode(
      //     entry.key
      //   )} value=${new TextDecoder().decode(entry.value)} `
      // )
    }
    console.timeEnd(`[client] each iterator`)

    // const iterator = client.iterator({ reverse: false })
    // while (true) {
    //   const result = await iterator.next()
    //   console.log(result)
    //   if (result.done) {
    //     break
    //   }
    // }
    await client.destroy()
  } catch (e) {
    console.error('[client] error', e)
  } finally {
    console.log('------------------------------')
  }
}

setup()
main()
