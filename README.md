# Git Server
This is the RBA Git Server

[![Build Status](https://travis-ci.com/interviewstreet/git-server.svg?token=GLzo73FiycySq8xypVsi&branch=master)](https://travis-ci.com/interviewstreet/git-server)
[![Maintainability](https://api.codeclimate.com/v1/badges/1565a6f02014132e84de/maintainability)](https://codeclimate.com/repos/5b9fbbe0807a8b024000b9f6/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/1565a6f02014132e84de/test_coverage)](https://codeclimate.com/repos/5b9fbbe0807a8b024000b9f6/test_coverage)

## Usage
### Admin
The admin key is hard-coded, which is:
`uw2Giequaroodec5Oonguu9Quua9pax0`. This key is required for all the
administration routes, which are under `/repositories/`.

Auth:

- Username: `admin`
- Password: `uw2Giequaroodec5Oonguu9Quua9pax0`

### Create Repository
`POST /repositories/`

Params:

 - `zip_url` or `git_url`
   The `zip_url` should point to a zip file which has a valid project
   definition through a `hackerrank.yml` file in the top level
   directory.
 - `max_size` (optional)
   The maximum allowable size of the repository in KB. If this is not
   present, the size is assumed to me 20480 KB (20 MB).

```bash
$ export ADMIN_KEY=uw2Giequaroodec5Oonguu9Quua9pax0
$ curl -sX POST https://admin:$ADMIN_KEY@git-rba-dev.hackerrank.net/repositories/ -d 'zip_url=https://hrx-projects.s3.amazonaws.com/fullstack/sample_projects/v1.0/python_django/project.zip'
{
  "id": "59cc44b0-59dd-4c11-98a5-646cc5675d73",
  "created": true,
  "active": true,
  "size": 120,
  "key": "9bc8fe12c16faf5ff8fe7d251e984b62b7b85d52",
  "url": "https://git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73"
}
```

### Update repository
`PUT /repositories/<repo-id>`

#### Mark as inactive:

Params:
  - `active`: `false`


```bash
$ curl -sX PUT https://admin:$ADMIN_KEY@git-rba-dev.hackerrank.net/repositories/59cc44b0-59dd-4c11-98a5-646cc5675d73 -d 'active=false'
{
  "id": "59cc44b0-59dd-4c11-98a5-646cc5675d73",
  "created": true,
  "active": false,
  "size": 120,
  "key": "9bc8fe12c16faf5ff8fe7d251e984b62b7b85d52",
  "url": "https://git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73"
}
```

#### Mark as active:

Params:
  - `active`: `false`

```bash
$ curl -sX PUT https://admin:$ADMIN_KEY@git-rba-dev.hackerrank.net/repositories/59cc44b0-59dd-4c11-98a5-646cc5675d73 -d 'active=true'
{
  "id": "59cc44b0-59dd-4c11-98a5-646cc5675d73",
  "created": true,
  "active": true,
  "size": 120,
  "key": "9bc8fe12c16faf5ff8fe7d251e984b62b7b85d52",
  "url": "https://git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73"
}
```

#### Change max size:

Params:
  - `max_size`: `10240`
    Set max repository size to 10240 KB (10 MB).

```bash
$ curl -sX PUT https://admin:$ADMIN_KEY@git-rba-dev.hackerrank.net/repositories/59cc44b0-59dd-4c11-98a5-646cc5675d73 -d 'max_size=10240'
{
  "id": "59cc44b0-59dd-4c11-98a5-646cc5675d73",
  "created": true,
  "active": true,
  "size": 124,
  "key": "9bc8fe12c16faf5ff8fe7d251e984b62b7b85d52",
  "url": "https://git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73"
}
```

#### Cloning (Manager)

The `key` in the repo create response
(`9bc8fe12c16faf5ff8fe7d251e984b62b7b85d52` for above repo) is the
manager key. This is to allow git operations even when the repository
is inactive.

```bash
$ export MANAGER_KEY=9bc8fe12c16faf5ff8fe7d251e984b62b7b85d52
git clone https://manager:$MANAGER_KEY@git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73
Cloning into '59cc44b0-59dd-4c11-98a5-646cc5675d73'...
remote: Counting objects: 21, done.
remote: Compressing objects: 100% (19/19), done.
remote: Total 21 (delta 2), reused 0 (delta 0)
Unpacking objects: 100% (21/21), done.
$ cd 59cc44b0-59dd-4c11-98a5-646cc5675d73
$ git remote get-url --all origin 
https://manager:9bc8fe12c16faf5ff8fe7d251e984b62b7b85d52@git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73
```

### Candidate
#### Cloning

When the repository is active, no key is required. Candidate can
simply use the repository URL to access the repository via git.
```bash
$ git clone https://git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73
Cloning into '59cc44b0-59dd-4c11-98a5-646cc5675d73'...
remote: Counting objects: 21, done.
remote: Compressing objects: 100% (19/19), done.
remote: Total 21 (delta 2), reused 0 (delta 0)
Unpacking objects: 100% (21/21), done.
```

#### History
The git history can be accessed by the candidate when the repository
is active.
```bash
$ curl -s  https://git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73/history
[
  {
    "id": "883fa2249c05e59cb46394fdb0d1d294327a909d",
    "date": "2018-09-06T04:47:52.000Z",
    "message": "Add initial repository",
    "author": "Git Server Admin <admin@git-server>",
    "commiter": "Git Server Admin <admin@git-server>"
  }
]
```

When inactive though, candidate won't be able to access the git
history:
```bash
$ curl -s  https://git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73/history
Authorization required.
```

A manager will be able to access the history even when inactive:
```bash
$ curl -s  https://manager:$MANAGER_KEY@git-rba-dev.hackerrank.net/git/59cc44b0-59dd-4c11-98a5-646cc5675d73/history
[
  {
    "id": "883fa2249c05e59cb46394fdb0d1d294327a909d",
    "date": "2018-09-06T04:47:52.000Z",
    "message": "Add initial repository",
    "author": "Git Server Admin <admin@git-server>",
    "commiter": "Git Server Admin <admin@git-server>"
  }
]
```

## Development

### Setup
```bash
$ npm install
```

### Starting the server
Start the server in development mode with:

```bash
$ npm start
```

To get auto-reload, use `nodemon` and run the server:

```bash
$ npn install -g nodemon
DEBUG=gs:* nodemon npm start
```

### Running Test
Run tests with:
```bash
$ npm test
```

## Deployment

Configure authentication for gcloud
```bash
$ gcloud auth configure-docker
```

### Build and push the image to gcr
```bash
$ export IMAGE_TAG=10
$ docker build -t git-server .
$ docker tag git-server:latest gcr.io/che-fullstack/git-server:$IMAGE_TAG
$ docker push gcr.io/che-fullstack/git-server:$IMAGE_TAG
```

### Local Kubernetes
```bash
## Persistant volume. Simply a directory for local setup.
$ kubectl create -f deploy/local/pv.yml

# Persistant volume claim.
$ kubectl create -f deploy/local/pvc.yml

# The deployment configuration
$ kubectl create -f deploy/local/git-server.yml
$ kubectl create -f deploy/local/git-list.yml

# The services and ingress
$ kubectl create -f deploy/local/ingress.yml

# Check if the service is up.
$ curl http://localhost/health-check/
OK
```

### Dev kubernetes
Get gcloud credentials locally, so that kubectl can access it.
```bash
$ gcloud --project=git-server-dev container clusters get-credentials git-server-dev --zone us-central1-a
```
```bash
## Change the nfs IP address to your NFS deployment
$ $EDITOR deploy/dev/pv.yml

## Persistant volume. In case of production, it is NFS.
$ kubectl create -f deploy/dev/pv.yml

# Persistant volume claim.
$ kubectl create -f deploy/dev/pvc.yml

# The deployment configuration
$ kubectl create -f deploy/dev/git-server.yml
$ kubectl create -f deploy/dev/git-list.yml

# The services and ingress
$ kubectl create -f deploy/dev/ingress.yml

# Check if the service is up.
$ curl https://git-rba-dev.hackerrank.net
OK
```
