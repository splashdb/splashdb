import { setup } from './setup'
import { SplashdbSampleClient } from '../fixtures/SampleClient'

async function main(): Promise<void> {
  console.log('main')
  let client: SplashdbSampleClient
  try {
    client = new SplashdbSampleClient()
  } catch (e) {
    console.log(`client init error`, e)
  }
  console.log('client created')

  try {
    const result = await client.get('key')
    console.log(`result of get:`, new TextDecoder().decode(result) || '<void>')
    await client.put('key', 'value')
    await client.put('key1', 'value1')
    await client.put('key2', 'value2')
    await client.put('key3', 'value3')
    await client.put('key4', 'value4')
    await client.put('key5', 'value5')
    await client.put('key6', 'value6')
    await client.put('key7', 'value7')
    console.log(`put done`)
    await client.get('key')
    console.log(`result of get:`, new TextDecoder().decode(result) || '<void>')

    for await (const entry of client.iterator({
      reverse: false,
    })) {
      console.log(
        'result:',
        new TextDecoder().decode(entry.key) || '<void>',
        new TextDecoder().decode(entry.value) || '<void>'
      )
    }

    await client.destroy()
    console.log('END\n')
  } catch (e) {
    console.error('[client] error', e)
  }
}

setup()
main()
