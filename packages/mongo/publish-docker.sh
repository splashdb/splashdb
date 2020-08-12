#!/bin/sh

export IMAGE_VERSION=$(node -p "require('./package.json').version")
echo $IMAGE_VERSION
docker build -t splashdb/mongo-node:${IMAGE_VERSION}
docker push splashdb/mongo-node:${IMAGE_VERSION}