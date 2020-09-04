import { argv } from 'yargs'
import fs from 'fs'
import path from 'path'
import semver from 'semver'
import glob from 'glob'

function version(inputVersion: string): void {
  if (semver.valid(inputVersion)) {
    console.log(`Upgrade version to ${inputVersion}`)
  } else {
    console.error(`Invalid version ${inputVersion}`)
    return
  }

  const pkgs = glob.sync('./*/package.json').concat(['./package.json'])
  for (const pkg of pkgs) {
    const fullpath = path.resolve(process.cwd(), pkg)
    const text = fs.readFileSync(fullpath, 'utf8')
    const json = JSON.parse(text)
    json.version = inputVersion
    fs.writeFileSync(fullpath, JSON.stringify(json, null, 2), 'utf8')
  }
}

const inputVersion = argv._[0]
version(inputVersion)
