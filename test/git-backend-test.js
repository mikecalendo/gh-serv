const _ = require('lodash');
const chai = require('chai');
const express = require('express');
const mkdirp = require('mkdirp').sync;
const os = require('os');
const path = require('path');
const supertest = require('supertest');
const util = require('util');
const {rm} = require('shelljs');
const execp = util.promisify(require('child_process').exec);
const gitBackend = require('../src/git-backend.js');
const helpers = require('../src/helpers.js');
const config = require('../src/config.js');

chai.should();

describe('git-backend', function() {
  const PORT = (20000 + (new Date().getTime() % 10000)) | 0;
  const REPO = `testrepo-${new Date().getTime()}`;
  const BASE_URL = `http://localhost:${PORT}`;
  const REPO_URL = `${BASE_URL}/${REPO}`;
  const TMP_DIR = path.join(
    os.tmpdir(), `git-backend-test-${new Date().getTime()}`
  );
  const GIT_ROOT = path.join(TMP_DIR, 'gitRoot');
  const CLONES_DIR = path.join(TMP_DIR, 'clones');
  const SOURCE_REPO = helpers.repoPath(GIT_ROOT, REPO);
  const WORK_REPO = path.join(CLONES_DIR, REPO);

  const CONFIG = _.defaults({
    gitRoot: GIT_ROOT,
    publicHost: `http://localhost:${PORT}`,
  }, config);

  let app = null;
  let server = null;

  before(function() {
    mkdirp(GIT_ROOT);
    mkdirp(SOURCE_REPO);
    mkdirp(CLONES_DIR);
  });

  before(function() {
    app = express();
    app.use(gitBackend(CONFIG));
    server = app.listen(PORT);
  });

  before(async function() {
    await execp(`cd ${SOURCE_REPO} && git init --bare`);
  });

  it('clones an empty repository', async function() {
    const {stdout, stderr} = await execp([
      `cd ${CLONES_DIR}`,
      `git clone ${REPO_URL}`,
      `cd ${REPO}`,
      'git config credential.helper ""',
    ].join(' && '));

    stdout.should.equal('');
    stderr.should.have.string(`Cloning into '${REPO}'...`);
    stderr.should.have.string(
      'warning: You appear to have cloned an empty repository.'
    );
  });

  it('clones an empty repository with .git suffix.', async function() {
    const {stdout, stderr} = await execp(
      `cd ${CLONES_DIR} && git clone ${REPO_URL}.git ${REPO}.git`
    );
    stdout.should.equal('');
    stderr.should.have.string(`Cloning into '${REPO}.git'...`);
    stderr.should.have.string(
      'warning: You appear to have cloned an empty repository.'
    );
  });

  it('pushes refs', async function() {
    const pushResponse = await execp([
      `cd ${WORK_REPO}`,
      'echo "Hello World" > hello.txt',
      'git add hello.txt',
      'git commit -am "First Commit" -q',
      'git push origin master',
      'echo "File to check for Diff" > checkdiff.txt',
      'git add -A',
      'git commit -m "Test git diff" -q',
      'git push origin master',
    ].join(' && '));

    pushResponse.stdout.should.equal('');
    pushResponse.stderr.should.have.string(REPO_URL);
    pushResponse.stderr.should.have.string('new branch');
    pushResponse.stderr.should.have.string('master -> master');

    const lsTreeResponse = await execp(
      `cd ${SOURCE_REPO} && git ls-tree -l HEAD`
    );

    lsTreeResponse.stdout.should.have.string('blob');
    lsTreeResponse.stdout.should.have.string('hello.txt');
    lsTreeResponse.stderr.should.equal('');
  });

  it('fetches updates', async function() {
    let {stdout, stderr} = await execp(`cd ${WORK_REPO}.git && git pull`);

    stdout.should.equal('');
    stderr.should.have.string(REPO_URL);
    stderr.should.have.string('new branch');
    stderr.should.have.string('origin/master');
  });

  it('clones a non empty repository', async function() {
    const {stdout, stderr} = await execp(
      `cd ${CLONES_DIR} && git clone ${REPO_URL} ${REPO}-2`
    );
    stdout.should.equal('');
    stderr.should.equal(`Cloning into '${REPO}-2'...\n`);
  });

  it('clone of a non existant repo fails', async function() {
    try {
      await execp(`cd ${CLONES_DIR} && git clone ${BASE_URL}/invalid-repo`);
      chai.assert(false, 'Clone of a non existant repo should fail.');
    } catch (e) {
      if (!_.isNumber(e.code)) {
        throw e;
      }
      e.code.should.equal(128);
      e.stderr.should.have.string('not found');
    }
  });

  it('clone of an inactive repo fails', async function() {
    helpers.isActive(SOURCE_REPO, false);

    try {
      await execp(`cd ${CLONES_DIR} && \
        GIT_TERMINAL_PROMPT=0 git clone ${REPO_URL} ${REPO}-3`);
      chai.assert(false, 'Clone of an inactive repo should fail.');
    } catch (e) {
      if (!_.isNumber(e.code)) {
        throw e;
      }
      e.code.should.equal(128);
      e.stderr.should.have.string('fatal:');
    }
  });

  it('fetch in an inactive repo fails', async function() {
    helpers.isActive(SOURCE_REPO, false);

    try {
      await execp(`cd ${WORK_REPO} && GIT_TERMINAL_PROMPT=0 git fetch`);
      chai.assert(false, 'fetch in an inactive repo should fail.');
    } catch (e) {
      if (!_.isNumber(e.code)) {
        throw e;
      }
      e.code.should.equal(128);
      e.stderr.should.have.string('fatal:');
    }
  });

  it('push in an inactive repo fails', async function() {
    helpers.isActive(SOURCE_REPO, false);

    try {
      await execp([
        `cd ${WORK_REPO}`,
        'echo "Another Hello" >> hello.txt',
        'git commit -am "Another Hello" -q',
        'GIT_TERMINAL_PROMPT=0 git push origin master',
      ].join(' && '));
      chai.assert(false, 'push in an inactive repo should fail.');
    } catch (e) {
      if (!_.isNumber(e.code)) {
        throw e;
      }
      e.code.should.equal(128);
      e.stderr.should.have.string('fatal:');
    }
  });

  it('clone of an inactive repo succeed for admin', async function() {
    // NOTE: This should always be after the active repo tests, because the git
    // client stores the credentials after this.
    helpers.isActive(SOURCE_REPO, false);

    const adminRepoUrl = REPO_URL.replace('://', `://admin:${CONFIG.adminKey}@`);
    const {stdout, stderr} = await execp(
      `cd ${CLONES_DIR} && git clone "${adminRepoUrl}" ${REPO}-4`
    );
    stdout.should.equal('');
    stderr.should.equal(`Cloning into '${REPO}-4'...\n`);
  });

  it('provides repository history', async function() {
    await supertest.agent(server)
      .get(`/${REPO}/history`)
      .auth('admin', CONFIG.adminKey)
      .expect(200)
      .expect(function(resp) {
        resp.body.length.should.equal(2);

        const commit = resp.body[1];
        commit.id.length.should.equal(40);
        commit.message.should.equal('First Commit');
      });
  });

  it('provides repository diff for admin', async function() {
    await supertest.agent(server)
      .get(`/${REPO}/diff`)
      .auth('admin', CONFIG.adminKey)
      .expect(200)
      .expect(function(resp) {
        output = resp.text.split('\n');
        output[0].should.equal('diff --git a/checkdiff.txt b/checkdiff.txt');
        output[6].should.equal('+File to check for Diff');
      });
  });

  it('provides repository diff for manager', async function() {
    let managerKey = helpers.repoManagerKey(REPO, config);
    await supertest.agent(server)
      .get(`/${REPO}/diff`)
      .auth('manager', managerKey)
      .expect(200)
      .expect(function(resp) {
        output = resp.text.split('\n');
        output[0].should.equal('diff --git a/checkdiff.txt b/checkdiff.txt');
        output[6].should.equal('+File to check for Diff');
      });
  });

  it('generates repository zip', async function() {
    let managerKey = helpers.repoManagerKey(REPO, config);
    await supertest.agent(server)
      .get(`/${REPO}/source.zip`)
      .auth('manager', managerKey)
      .expect(200)
      .expect(function(resp) {
        resp.headers['content-type'].should.equal('application/zip');
        resp.headers['content-disposition'].
          should.equal(`attachment; filename=${REPO}.zip`);
        resp.text.slice(0, 4).should.equal('PK\u0003\u0004');
        resp.text.should.have.string('hello.txt');
        resp.text.should.have.string('checkdiff.txt');
        resp.text.should.have.string('Hello World');
      });
  });


  after(() => server.close());
  after(() => rm('-rf', TMP_DIR));
});
