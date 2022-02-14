#!/usr/bin/env bash

set -e

PROJECT=git-server-dev
IMAGE=git-server

ADMIN_KEY=uw2Giequaroodec5Oonguu9Quua9pax0
EXPERIMENTAL_URL="https://admin:$ADMIN_KEY@experimental.git-rba-dev.hackerrank.net"
DEV_URL="https://admin:$ADMIN_KEY@git-rba-dev.hackerrank.net"

decrypt_secrets() {
    openssl aes-256-cbc \
        -K $encrypted_e2ad9772da9a_key \
        -iv $encrypted_e2ad9772da9a_iv \
        -in scripts/secrets.tar.enc \
        -out secrets.tar -d
    
    tar xvf secrets.tar
    chmod 600 github_deploy_key cd-111-service-account.json
}

install_gcloud() {
    if [ ! -d "$HOME/google-cloud-sdk/bin" ]; then
        rm -rf $HOME/google-cloud-sdk
        export CLOUDSDK_CORE_DISABLE_PROMPTS=1
        curl https://sdk.cloud.google.com | bash > /dev/null 2> /dev/null
    fi
    source /home/travis/google-cloud-sdk/path.bash.inc
    gcloud -q components update
    gcloud -q components update kubectl

    gcloud -q auth activate-service-account \
        --key-file cd-111-service-account.json

    gcloud -q auth configure-docker
    gcloud -q container clusters get-credentials git-server-experimental \
        --zone us-central1-a --project $PROJECT
    gcloud -q container clusters get-credentials git-server-dev \
        --zone us-central1-a --project $PROJECT
}

get_next_tag() {
    img_meta_json=$(gcloud container images list-tags gcr.io/$PROJECT/$IMAGE \
            --format=json --filter=dev-deployed --sort-by=tags --limit=1)
    
    tag=$(echo $img_meta_json | jq -r .[0].tags[0])

    re='^[0-9]+$'
    if ! [[ $tag =~ $re ]]; then
        echo "error: Numeric tag not present on dev-deployed image" >&2
        exit 1
    fi

    echo $((tag + 1))
}

deploy_experimental() {
    kubectl config use-context gke_git-server-dev_us-central1-a_git-server-experimental

    echo "Deploying to experimental"
    bash scripts/deploy-gke.sh experimental

    # experimental deployment will pull git-server:latest
    kubectl delete pods -l=app=git-server

    # wait for rollout before running sanity
    kubectl rollout status deployment/git-server

    bash scripts/sanity-test.sh $EXPERIMENTAL_URL
}

deploy_dev() { # $1 = new tag
    next_tag=$1
    BRANCH=master

    kubectl config use-context gke_git-server-dev_us-central1-a_git-server-dev

    git checkout $BRANCH

    # update kubernetes deployment to use next tag
    sed -i -r -e "s/git-server:[0-9]+/git-server:$next_tag/" deploy/dev/git-server.yml
    sed -i -r -e "s/git-server:[0-9]+/git-server:$next_tag/" deploy/prod/git-server.yml

    echo "Deploying to dev"
    bash scripts/deploy-gke.sh dev

    # wait for rollout before running sanity
    kubectl rollout status deployment/git-server

    bash scripts/sanity-test.sh $DEV_URL

    # setup github deploy private key
    eval $(ssh-agent -s)
    ssh-add github_deploy_key

    # set up git
    git config user.name "HAL 9000"
    git config user.email "hal9000@imsorrydave.com"
    git remote remove origin
    git remote add origin git@github.com:interviewstreet/git-server.git
    
    git commit -a -m "[skip travis] Update git-server tag to $next_tag"
    git push -u origin $BRANCH
}

check_duplicate_image() {
    docker build -t $IMAGE:latest .
    local_img_id=$(docker image inspect $IMAGE:latest | jq .[0].Id)

    docker pull gcr.io/$PROJECT/$IMAGE:dev-deployed
    gcr_img_id=$(docker image inspect gcr.io/$PROJECT/$IMAGE:dev-deployed | jq .[0].Id)

    if [[ $local_img_id = $gcr_img_id ]]; then
        echo "No change in image. Not deploying."
        exit 0
    fi
}

decrypt_secrets

install_gcloud

check_duplicate_image

bash scripts/tag.sh $PROJECT $IMAGE latest
deploy_experimental

next_tag=$(get_next_tag)
bash scripts/tag.sh $PROJECT $IMAGE $next_tag
deploy_dev $next_tag
bash scripts/tag.sh $PROJECT $IMAGE dev-deployed
