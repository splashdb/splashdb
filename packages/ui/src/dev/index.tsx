import React from 'react'
import ReactDOM from 'react-dom'
import { App } from '..'

const root = document.createElement('div')
ReactDOM.render(<App></App>, root)
document.body.style.margin = '0px'
document.body.appendChild(root)
