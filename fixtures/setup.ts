import fs from 'fs'
import dotenv from 'dotenv'
import util from 'util'

global.TextEncoder = util.TextEncoder
global.TextDecoder = util.TextDecoder

export function setup(): void {
  const envConfig = dotenv.parse(fs.readFileSync('.env.development'))

  for (const k in envConfig) {
    process.env[k] = envConfig[k]
  }
}
