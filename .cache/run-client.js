'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var http2 = _interopDefault(require('http2'));
var fs = _interopDefault(require('fs'));
var path = _interopDefault(require('path'));

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

class SplashdbSampleClient {
  constructor() {
    _defineProperty(this, "authorization", void 0);

    _defineProperty(this, "session", void 0);

    _defineProperty(this, "connectingPromise", void 0);

    this.authorization = 'Basic YWRtaW46YWRtaW4=';
    const ca = fs.readFileSync(path.resolve(process.cwd(), process.env.SPLASHDB_SECURE_CERT));
    this.session = http2.connect('https://localhost:8443', {
      ca
    });
    this.connectingPromise = new Promise((resolve, reject) => {
      this.session.once('connect', () => {
        console.log('connected to server');
        resolve();
      });
      this.session.once('error', err => {
        console.error('SplashdbSampleClientGotError: ', err);
        reject(err);
      });
    });
  }

  async ok() {
    await this.connectingPromise;
    console.log('ok');
  }

  async get(key) {
    return await new Promise((resolve, reject) => {
      if (this.session.connecting) return reject(new Error('NOT_CONNECTED'));
      const cache = [];
      const req = this.session.request({
        ':method': 'POST',
        authorization: this.authorization,
        'x-splashdb-method': 'get',
        'content-type': 'application/octet-stream'
      }); // req.on('response', (headers, flags) => {
      //   for (const name in headers) {
      //     console.log(`${name}: ${headers[name]}`)
      //   }
      // })
      // req.on('data', (chunk) => {
      //   console.log(typeof chunk)
      //   if (typeof chunk === 'string') {
      //     cache.push(new TextEncoder().encode(chunk))
      //   } else {
      //     cache.push(chunk)
      //   }
      // })

      req.on('end', () => {
        console.log('client end');
        const totalLength = cache.reduce((total, chunk) => {
          total += chunk.byteLength;
          return total;
        }, 0);
        const result = new Uint8Array(totalLength);
        let prevChunkSize = 0;

        for (const chunk of cache) {
          result.set(new Uint8Array(chunk), prevChunkSize);
          prevChunkSize = chunk.byteLength;
        }

        resolve(result);
      });
      console.log('req', req.sentHeaders);
      console.log('session.connecting=', this.session.connecting);
      req.write(Buffer.from([])); // req.write(typeof key === 'string' ? new TextEncoder().encode(key) : key)

      req.end();
    });
  }

  async put(key) {
    return;
  }

  async del(key) {
    return;
  }

  async *iterator() {
    yield {
      key: new Uint8Array(),
      value: new Uint8Array()
    };
  }

  destroy() {
    this.session.close();
  }

}

async function main() {
  try {
    console.log('main ');
    const client = new SplashdbSampleClient();
    await client.ok();
    const getresult = await client.get('key');
    console.log(new TextDecoder().decode(getresult));
    client.destroy();
  } catch (e) {
    console.error(e);
  }
}

main();
