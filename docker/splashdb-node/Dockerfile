FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb

COPY index.js  /usr/local/splashdb/index.js
COPY entrypoint.js  /usr/local/splashdb/entrypoint.js

WORKDIR /usr/local/splashdb

EXPOSE 8443

CMD [ "node", "entrypoint.js" ]