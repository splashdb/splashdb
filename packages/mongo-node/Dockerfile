FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb-mongo-node

COPY index.js  /usr/local/splashdb-mongo-node/index.js

WORKDIR /usr/local/splashdb-mongo-node

EXPOSE 8743

CMD [ "node", "index.js" ]