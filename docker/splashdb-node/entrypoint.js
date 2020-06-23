const cp = require('child_process')

const NODE_PROF = process.env.NODE_PROF

if (NODE_PROF === 'true') {
  cp.execSync(`node --prof index.js`)
} else {
  cp.execSync(`node index.js`)
}
