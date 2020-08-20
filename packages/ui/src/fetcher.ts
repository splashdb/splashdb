import { Buffer } from 'buffer'

export type SpalashDBUIFetcher = (buf: Buffer) => Promise<Response>

export function createFetcherFromUrl(url: string): SpalashDBUIFetcher {
  return function (body: Buffer): Promise<Response> {
    const parsed = new URL(url)
    const basic = Buffer.from(`${parsed.username}:${parsed.password}`).toString(
      'base64'
    )
    const dbname = parsed.pathname.split('/').find((item) => !!item) || 'system'
    return fetch(`${parsed.protocol}//${parsed.host}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'x-splashdb-db': dbname,
        'x-splashdb-protocol': 'mongo',
        'x-splashdb-version': '1.0',
      },
      body,
    })
  }
}

export const devFetcher = createFetcherFromUrl(
  localStorage.SPLASHDB_FETCHER_URL ||
    'http://admin:IAiyZ9i3azdUFzX93f4oPlVfHgvitcKP7FUH9h346LTMoi@127.0.0.1:8000'
)
