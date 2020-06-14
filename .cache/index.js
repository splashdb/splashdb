'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var http2 = _interopDefault(require('http2'));

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

class SplashDBServer {
  constructor(options) {
    _defineProperty(this, "options", void 0);

    _defineProperty(this, "server", void 0);

    _defineProperty(this, "start", () => {
      const server = this.options.secure ? http2.createSecureServer({
        key: this.options.secureKey,
        cert: this.options.secureCert
      }) : http2.createServer();
      server.on('error', err => console.error(err));
      server.on('session', session => {
        console.log('new session', session);
      });
      server.on('stream', (stream, headers) => {
        const authorization = headers.authorization;
        const method = headers['x-splashdb-method'];
        console.log({
          authorization,
          method
        });
        stream.respond({
          'content-type': 'application/octet-stream',
          ':status': 200
        });
        stream.write(new Uint8Array([0, 0, 0, 0, 1, 1, 1, 1]));
        stream.end();
      });
      server.listen(this.options.port);
      console.log(`server listen on port ${this.options.port}`);
      this.server = server;
    });

    _defineProperty(this, "destroy", async () => {
      this.server.removeAllListeners();
      this.server.close();
      return;
    });

    this.options = {
      secure: false,
      port: 8443,
      secureCert: '',
      secureKey: '',
      ...options
    };
    this.start();
  }

}

exports.SplashDBServer = SplashDBServer;
