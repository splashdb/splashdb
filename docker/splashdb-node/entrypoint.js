const cp = require('child_process')

const NODE_PROF = process.env.NODE_PROF

if (NODE_PROF === 'true') {
  cp.execSync(`node index.js --prof`)
} else {
  cp.execSync(`node index.js`)
}
