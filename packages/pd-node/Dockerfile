FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb/pd-node

COPY build/index.js  /usr/local/splashdb/pd-node/index.js
COPY package.json  /usr/local/splashdb/pd-node/package.json
COPY package-lock.json  /usr/local/splashdb/pd-node/package-lock.json

WORKDIR /usr/local/splashdb/pd-node

RUN npm install --only=production

EXPOSE 8543

CMD [ "node", "build/index.js" ]