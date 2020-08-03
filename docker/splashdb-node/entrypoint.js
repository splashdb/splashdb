const cp = require('child_process')

const NODE_PROF = process.env.NODE_PROF

if (NODE_PROF === 'true') {
  console.log('Run in prof mode')
  cp.execSync(`node --prof index.js`)
} else {
  console.log('Run in no-prof mode')
  cp.execSync(`node index.js`)
}
