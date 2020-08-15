import React from 'react'
import { SpalashDBUIFetcher, devFetcher } from './fetcher'
import AceEditor from 'react-ace'
import ace from 'ace-builds'
import 'ace-builds/src-noconflict/mode-json'
import 'ace-builds/src-noconflict/theme-github'
import 'ace-builds/src-noconflict/ext-language_tools'

ace.config.set(
  'basePath',
  'https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/'
)

export function CommandInput(props: { fetcher: SpalashDBUIFetcher }) {
  const [code, setCode] = React.useState('{}')
  return (
    <div>
      <AceEditor
        width={`${window.innerWidth - 40}px`}
        height={`${window.innerHeight / 4}px`}
        mode="json"
        theme="github"
        onChange={setCode}
        showGutter={false}
        name="UNIQUE_ID_OF_DIV"
        value={code}
        editorProps={{ $blockScrolling: true }}
        setOptions={{
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true,
          enableSnippets: true,
          showLineNumbers: false,
          tabSize: 2,
        }}
      />
    </div>
  )
}
