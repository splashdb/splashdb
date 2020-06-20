export type SplashDBServerOptions = {
  debug?: boolean
  secure?: boolean
  secureKey?: string | Buffer
  secureCert?: string | Buffer
  adminPassword?: string
  port?: number
  dbpath?: string
}
