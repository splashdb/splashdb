import React from 'react'
import AceEditor from 'react-ace'
import ace from 'ace-builds'
import 'ace-builds/src-noconflict/mode-json'
import 'ace-builds/src-noconflict/theme-github'
import 'ace-builds/src-noconflict/ext-language_tools'

ace.config.set(
  'basePath',
  'https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/'
)

export function CommandInput(props: {
  width: number
  height: number
  loading?: boolean
  error?: Error | null
  value: string
  onChange: (command: string) => void
}): React.ReactElement {
  const { value, onChange, width, height, loading } = props

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        boxSizing: 'border-box',
        width,
        height,
        overflow: 'hidden',
      }}
    >
      <AceEditor
        width={`${width}px`}
        height={`${height}px`}
        mode="json"
        theme="github"
        onChange={onChange}
        showGutter={true}
        name="UNIQUE_ID_OF_DIV"
        value={value}
        editorProps={{ $blockScrolling: true }}
        setOptions={{
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true,
          enableSnippets: true,
          showLineNumbers: true,
          tabSize: 2,
        }}
      />
    </div>
  )
}
