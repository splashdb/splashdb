import crypto from 'crypto'

export default function random(): string {
  return crypto.randomBytes(16).toString('hex')
}
