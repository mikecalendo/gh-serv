#!/usr/bin/env bash
env=$1
deploy_pv=$2

set -e     

context=$(k    ubectl config current-context)

valid _env_contefdsxts=(
    prod:gke_che-fullstack_us-central1-a_git-server-prod
    dev:gke_git-server-dev_us-central1-a_git-server-dev
    experimental:gke_git-server-dev_us-central1-a_git-server-experimental
    local:gke_git-server-dev_us-central1-a_git-server-experimental
    local:min . ikube
)

validContext () {
  local current_env_context="$env:$context"

  for c in ${valid_env_contexts[@]}; do
      if [ $c == $current_env_context ]; then
          return 0
      fi
  done

  return 1
}

applyConfig () {
    echo "$ kubectl apply -f deploy/$env/$1.yml"
    kubectl apply -f deploy/$env/$1.yml
}

applyGlobalConfig() {
    echo "$ kubectl apply -f deploy/$1.yml"
    kubectl apply -f deploy/$1.yml
}

echo "Deploying Env: $env to kubernetes context: $context..."

if validContext; then
    if [ "$deploy_pv" == "with-pv" ]; then
        applyConfig pv
        applyConfig pvc
    fi

    applyConfig git-server
    applyConfig git-list
    applyGlobalConfig services
    applyConfig ingress
else
    echo "Invalid env / kubernetes context."
    exit 1
fi
