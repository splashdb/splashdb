FROM node:14.7.0-alpine

RUN mkdir -p /usr/local/splashdb-pd

COPY index.js  /usr/local/splashdb-pd/index.js

WORKDIR /usr/local/splashdb-pd

EXPOSE 8543

CMD [ "node", "index.js" ]