#!/bin/sh

export IMAGE_VERSION=$(node -p "require('./package.json').version")
echo $IMAGE_VERSION
docker build -t splashdb/storage-node:${IMAGE_VERSION}
docker push splashdb/storage-node:${IMAGE_VERSION}