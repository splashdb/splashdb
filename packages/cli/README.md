# splashdb/cli


## Usage

```sh
$ npm install @splashdb/cli -g
$ export SPLASHDB_URI=https://admin:admin@localhost:8443/system
$ export SPLASHDB_SECURE_CERT=/PATH/TO/splash_secure_cert.pem # if needed
$ splash dump <dumppath> # to dump a database
$ splash restore <dumppath> # to restore a database. notice: the data in dbpath will be kept.

```

## License

[MIT License](./LICENSE)
