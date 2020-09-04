FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb/mongo-node

COPY docker/index.js  /usr/local/splashdb/mongo-node/index.js
COPY package.json  /usr/local/splashdb/mongo-node/package.json
COPY package-lock.json  /usr/local/splashdb/mongo-node/package-lock.json

WORKDIR /usr/local/splashdb/mongo-node

RUN npm install --only=production

EXPOSE 8743

CMD [ "node", "index.js" ]