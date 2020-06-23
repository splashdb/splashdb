FROM node:14.4.0-alpine

RUN mkdir -p /usr/local/splashdb

COPY index.js  /usr/local/splashdb/index.js

WORKDIR /usr/local/splashdb

EXPOSE 8443

CMD [ "node", "entrypoint.js" ]