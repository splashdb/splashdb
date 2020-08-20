import { Buffer } from 'buffer'

export type SpalashDBUIFetcher = (buf: Buffer) => Promise<Response>

export function createFetcherFromUrl(url: string): SpalashDBUIFetcher {
  return function (body: Buffer): Promise<Response> {
    const parsed = new URL(url)
    const basic = Buffer.from(`${parsed.username}:${parsed.password}`).toString(
      'base64'
    )
    const dbname = parsed.pathname.split('/').find((item) => !!item) || 'system'
    const headers: HeadersInit = {
      Authorization: `Basic ${basic}`,
      'x-splashdb-db': dbname,
      'x-splashdb-protocol': 'mongo',
      'x-splashdb-version': '1.0',
    }
    if (parsed.searchParams.has('authority')) {
      headers['x-splashdb-dev-authority'] = parsed.searchParams.get(
        'authority'
      ) as string
    }
    return fetch(`${parsed.protocol}//${parsed.host}`, {
      method: 'POST',
      headers,
      body,
    })
  }
}

export const devFetcher = createFetcherFromUrl(
  localStorage.SPLASHDB_FETCHER_URL ||
    'http://admin:IAiyZ9i3azdUFzX93f4oPlVfHgvitcKP7FUH9h346LTMoi@127.0.0.1:8000?authority=http%3A%2F%2F127.0.0.1%3A8543'
)
