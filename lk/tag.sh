#!/usr/bin/env bash

if [[ $# -lt 3 ]]; then
    echo "arguments: GC_PROJECT IMAGE TAG1 [TAG2] [TAG3] ..." >&2; exit 1
fi

PROJECT=$1
IMAGE=$2

docker build -t $IMAGE .

shift; shift
for TAG in "$@"; do
    docker tag $IMAGE:latest gcr.io/$PROJECT/$IMAGE:$TAG
    docker push gcr.io/$PROJECT/$IMAGE:$TAG
done