#!/usr/bin/env bash

set -e

if [[ $# -ne 1 ]]; then
    echo "error: Invalid number of arguments" >&2; exit 1
fi

URL=$1

clone_repo() { # $1 = git url
    echo -n "Testing repo cloning... "

    git clone -q $1

    echo "OK"
}

update_push() { # $1 = repo id
    echo -n "Testing update and push... "

    cd $1
    dd if=/dev/urandom of=test count=1 bs=1024 2> /dev/null
    git add test
    git commit -qam "test"
    git push 2> /dev/null
    cd ..

    echo "OK"
}

delete_branch() { # $1 = repo id
    echo -n "Testing inability to delete branch... "

    cd $1
    set +e
    git push --delete origin master 2> /dev/null
    if [[ $? -eq 0 ]]; then
        echo "error: Was able to delete origin branch"; exit 1
    fi
    set -e
    cd ..

    echo "OK"
}

push_large_file() { # $1 = repo id, $2 = max size (kb)
    echo -n "Testing inability to exceed max repo size... "

    cd $1
    dd if=/dev/urandom of=large count=$2 bs=1024 2> /dev/null
    git add large
    git commit -qam "large"
    set +e
    git push 2> /dev/null
    if [[ $? -eq 0 ]]; then
        echo "error: Was able to exceed max repo size"; exit 1
    fi
    set -e
    cd ..

    echo "OK"
}

test() { # $1 = git url, $2 = repo id, $3 = max size (kb)
    clone_repo $1
    update_push $2
    delete_branch $2
    push_large_file $2 $3
}

create_repo() { # $1 = arguments to curl
    echo -n "Testing repo creation... "

    json=$(curl -sX POST $URL/repositories/ $1)

    repo_id=$(echo $json | jq -r .id)
    git_url=$(echo $json | jq -r .url)

    echo "OK"
}

echo "Running git-server sanity tests on $URL"

max_kb_size=1024
zip_url="https://hrx-projects.s3.amazonaws.com/fullstack/sample_projects/v1.0/python_django/project.zip"

TEST_DIR="/tmp/git-server-sanity/repositories"
mkdir -p $TEST_DIR
cd $TEST_DIR

echo "Creating and testing repo from Zip URL $zip_url"
create_repo "-d zip_url=$zip_url -d max_size=$max_kb_size" # sets $git_url $repo_id
test $git_url $repo_id $max_kb_size
rm -rf $repo_id

echo ""

echo "Creating and testing repo from Git URL $git_url"
create_repo "-d git_url=$git_url -d max_size=$max_kb_size"
test $git_url $repo_id $max_kb_size
rm -rf $repo_id