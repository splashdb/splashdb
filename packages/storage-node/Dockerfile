FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb-storage-node

COPY index.js  /usr/local/splashdb-storage-node/index.js

WORKDIR /usr/local/splashdb-storage-node

EXPOSE 8443

CMD [ "node", "index.js" ]