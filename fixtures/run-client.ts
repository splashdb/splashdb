import { SplashdbSampleClient } from '../fixtures/SampleClient'

async function main(): Promise<void> {
  try {
    console.log('main ')
    const client = new SplashdbSampleClient()
    await client.ok()
    const getresult = await client.get('key')
    console.log(new TextDecoder().decode(getresult))
    client.destroy()
  } catch (e) {
    console.error(e)
  }
}

main()
