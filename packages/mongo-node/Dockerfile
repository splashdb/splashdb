FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb-mongo

COPY index.js  /usr/local/splashdb-mongo/index.js

WORKDIR /usr/local/splashdb-mongo

EXPOSE 8743

CMD [ "node", "index.js" ]