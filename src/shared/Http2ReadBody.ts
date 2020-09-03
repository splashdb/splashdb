import type * as http2 from 'http2'
import { Http2StreamIterator } from './Http2StreamIterator'

export async function readBody(
  stream: http2.ServerHttp2Stream
): Promise<Uint8Array> {
  const cache: ArrayBuffer[] = []
  let totalLength = 0
  for await (const { chunk } of new Http2StreamIterator(stream).iterator()) {
    const buf =
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    totalLength += buf.length
    cache.push(buf)
  }

  const reqdata = new Uint8Array(totalLength)
  if ((totalLength = 0)) return reqdata

  let prevChunkSize = 0
  for (const chunk of cache) {
    reqdata.set(new Uint8Array(chunk), prevChunkSize)
    prevChunkSize += chunk.byteLength
  }

  return reqdata
}
