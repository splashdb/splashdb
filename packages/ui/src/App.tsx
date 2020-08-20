import React from 'react'
import * as BSON from 'bson'
import { Buffer } from 'buffer'
import { CommandInput } from './CommandInput'
import { DataTable } from './DataTable'
import { SpalashDBUIFetcher, devFetcher } from './fetcher'
import { calculateColumns } from './calculateColumns'
import { Button } from './Button'
import { SplashUILogo } from './SplashUILogo'
import JSON5 from 'json5'

export function App(props: {
  width?: number
  height?: number
  fetcher?: SpalashDBUIFetcher
}): React.ReactElement {
  const { fetcher = devFetcher, width = 800, height = 600 } = props
  const [inited, setInited] = React.useState(false)
  const [error, setError] = React.useState<Error>()
  const [data, setData] = React.useState<any[]>([])
  const [columns, setColumns] = React.useState<any[]>([])
  const [code, setCode] = React.useState(
    localStorage['SplashUILatestCommand'] || '{}'
  )
  const [loading, setLoading] = React.useState(false)
  const [inputWidth, setInputWidth] = React.useState(width / 2)
  const [dataWidth, setDataWidth] = React.useState(width / 2)

  const runCommand = React.useCallback(
    async (commandOption: any) => {
      const res = await fetcher(BSON.serialize(commandOption))

      if (!res.ok) {
        throw new Error(await res.text())
      }

      const data = await res.arrayBuffer()
      try {
        const output = BSON.deserialize(Buffer.from(data))
        console.log('output', output)
        if (commandOption.find) {
          output.cursor.toArray = async (): Promise<any[]> => {
            const parsed = BSON.deserialize(output._data.buffer)
            return Object.values(parsed)
          }
        }
        return output
      } catch (e) {
        setColumns([])
        setData([])
        const output = new TextDecoder().decode(data)
        console.log('output', output)
        return output
      }
    },
    [fetcher]
  )

  const runCommandAndUpdate = React.useCallback(
    async (command: any) => {
      setLoading(true)
      try {
        const output = await runCommand(command)
        if (!output.ok) {
          throw new Error('Run command failed')
        }
        let data: any[] = []
        if (command.find) {
          data = await output.cursor.toArray()
        }

        setData(data)
        setColumns(calculateColumns(data))
      } catch (e) {
        setError(e)
      } finally {
        setLoading(false)
      }
    },
    [runCommand]
  )

  const handleRunCommand = React.useCallback(
    (command: string) => {
      try {
        const commandOption = JSON5.parse(command)
        runCommandAndUpdate(commandOption)
      } catch (e) {
        console.error(e)
        setError(e)
      }
    },
    [runCommandAndUpdate]
  )

  const handleClickCommand = React.useCallback(() => {
    handleRunCommand(code)
    localStorage['SplashUILatestCommand'] = code
  }, [handleRunCommand, code])

  React.useEffect(() => {
    if (inited) return
    setInited(true)
  }, [inited])

  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 40,
          backgroundColor: '#f0f0f0',
          alignItems: 'center',
        }}
      >
        <SplashUILogo />
        <Button loading={loading} shape="circle" onClick={handleClickCommand} />
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          width,
          height: height - 40,
        }}
      >
        <CommandInput
          error={error}
          value={code}
          width={inputWidth}
          height={height - 40}
          onChange={setCode}
        ></CommandInput>
        <DataTable
          width={inputWidth}
          height={height - 40}
          columns={columns}
          data={data}
        ></DataTable>
      </div>
    </div>
  )
}
