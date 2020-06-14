'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var http2 = _interopDefault(require('http2'));
var fs = _interopDefault(require('fs'));

class Server {
  constructor() {
    const server = http2.createSecureServer({
      key: fs.readFileSync("localhost-privkey.pem"),
      cert: fs.readFileSync("localhost-cert.pem")
    });
    server.on("error", err => console.error(err));
    server.on("stream", (stream, headers) => {
      // stream is a Duplex
      stream.respond({
        "content-type": "text/html",
        ":status": 200
      });
      stream.end("<h1>Hello World</h1>");
    });
    server.listen(8443);
  }

}

exports.Server = Server;
