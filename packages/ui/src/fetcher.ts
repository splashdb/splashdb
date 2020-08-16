import { Buffer } from 'buffer'

export type SpalashDBUIFetcher = (buf: Buffer) => Promise<Response>

export function devFetcher(body: Buffer): Promise<Response> {
  const basic = Buffer.from(
    `admin:IAiyZ9i3azdUFzX93f4oPlVfHgvitcKP7FUH9h346LTMoi`
  ).toString('base64')

  return fetch('http://127.0.0.1:8000/', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'x-splashdb-db': 'system',
      'x-splashdb-protocol': 'mongo',
      'x-splashdb-version': '1.0',
    },
    body,
  })
}
