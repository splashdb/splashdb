export type SplashDBServerOptions = {
  debug?: boolean
  secure?: boolean
  secureKey?: string | Buffer
  secureCert?: string | Buffer
  port?: number
  dbpath?: string
}
