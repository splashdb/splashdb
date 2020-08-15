import React from 'react'
import * as BSON from 'bson'
import { Buffer } from 'buffer'
import { CommandInput } from './CommandInput'
import { DataTable } from './DataTable'
import { SpalashDBUIFetcher, devFetcher } from './fetcher'

export function App(props: { fetcher?: SpalashDBUIFetcher }) {
  const [inited, setInited] = React.useState(false)
  const { fetcher = devFetcher } = props

  const runCommand = React.useCallback(async (commandOption: any) => {
    const res = await fetcher(BSON.serialize(commandOption))

    if (!res.ok) {
      throw new Error(await res.text())
    }

    const data = await res.arrayBuffer()
    try {
      const output = BSON.deserialize(Buffer.from(data))
      console.log('output', output)
      if (commandOption.find) {
        output.cursor.toArray = async () => {
          const parsed = BSON.deserialize(output._data.buffer)
          return Object.values(parsed)
        }
      }
      return output
    } catch (e) {
      const output = new TextDecoder().decode(data)
      console.log('output', output)
      return output
    }
  }, [])

  const listUsers = React.useCallback(async () => {
    const output = await runCommand({
      find: 'user',
      filter: {},
    })
    if (output.ok) {
      console.log('toArray', await output.cursor.toArray())
    }
  }, [])

  React.useEffect(() => {
    if (inited) return
    setInited(true)
    listUsers()
  }, [inited, listUsers])

  return (
    <div>
      <CommandInput fetcher={fetcher}></CommandInput>
      <DataTable></DataTable>
    </div>
  )
}
