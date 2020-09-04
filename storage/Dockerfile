FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb/storage-node

COPY docker/index.js  /usr/local/splashdb/storage-node/index.js
COPY package.json  /usr/local/splashdb/storage-node/package.json
COPY package-lock.json  /usr/local/splashdb/storage-node/package-lock.json

WORKDIR /usr/local/splashdb/storage-node

RUN npm install --only=production

EXPOSE 8443

CMD [ "node", "index.js" ]