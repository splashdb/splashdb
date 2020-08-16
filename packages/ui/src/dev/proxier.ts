import http from 'http'
import http2 from 'http2'
import { Http2SessionDaemon } from '@splashdb/shared'

function getHeaders(req: http.IncomingMessage): http2.OutgoingHttpHeaders {
  const newHeaders: http2.OutgoingHttpHeaders = {}
  newHeaders[':method'] = req.method
  newHeaders['Authorization'] = req.headers.authorization
  for (const key in req.headers) {
    if (key.startsWith('x-splashdb')) {
      newHeaders[key] = req.headers[key]
    }
  }
  return newHeaders
}

function cors(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, ININ-Client-Path, x-splashdb-db, x-splashdb-protocol, x-splashdb-version'
  )
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST')
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Cache-Control', 'max-age=3600')
}

const server = http.createServer()

const sessionDaemon = new Http2SessionDaemon({
  getAuthority: () => Promise.resolve('http://127.0.0.1:8543/'),
  getOptions: () => Promise.resolve({}),
})

server.on(
  'request',
  async (req: http.IncomingMessage, res: http.ServerResponse) => {
    cors(req, res)
    if (req.method === 'OPTIONS') {
      res.end()
      return
    }

    const session = await sessionDaemon.getSession()
    const headers = getHeaders(req)
    const req2 = session.request(headers)

    req.on('data', (data) => {
      req2.write(data)
    })
    req.on('end', () => {
      req2.end()
    })

    req2.on('headers', (headers: http2.IncomingHttpHeaders) => {
      for (const key in headers) {
        const value = headers[key]
        if (typeof value === 'string') {
          res.setHeader(key, value)
        }
      }
    })

    req2.on('data', (data) => {
      res.write(data)
    })

    req2.on('end', () => {
      res.end()
    })
  }
)

server.listen(8000)
