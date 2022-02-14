const _ = require('lodash');
const chai = require('chai');
const express = require('express');
const mkdirp = require('mkdirp').sync;
const os = require('os');
const path = require('path');
const supertest = require('supertest');
const util = require('util');
const yaml = require('js-yaml');
const {rm, test, cat} = require('shelljs');
const execp = util.promisify(require('child_process').exec);
const repositories = require('../src/repositories.js');
const helpers = require('../src/helpers.js');
const config = require('../src/config.js');

chai.should();

describe('repositories', function() {
  const PORT = (20000 + (new Date().getTime() % 10000)) | 0;
  const TMP_DIR = path.join(
    os.tmpdir(), `git-repos-test-${new Date().getTime()}`
  );
  const GIT_ROOT = path.join(TMP_DIR, 'gitRoot');
  const PUBLIC_HOST = `http://127.0.0.1:${PORT}`;

  CONFIG = _.defaults({
    gitRoot: GIT_ROOT,
  }, config);

  let app;
  let server;
  let repoDetails;
  let repoPath;
  let cloneRepoPath;

  before(function() {
    mkdirp(GIT_ROOT);
  });

  before(function() {
    app = express();
    app.use('/data', express.static('./test/data/'));
    app.use('/repositories', repositories(CONFIG));

    server = app.listen(PORT);
  });

  it('creates repositories with a zip URL', async function() {
    const zipUrl = `${PUBLIC_HOST}/data/angular-with-node-modules.zip`;


    const maxSize = 1024 * 10; // 10 MB

    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        zip_url: zipUrl,
        max_size: maxSize,
      })
      .expect(200)
      .expect(function(resp) {
        repoDetails = resp.body;
        resp.body.id.length
          .should.equal(36);
        resp.body.url
          .should.equal(`${PUBLIC_HOST}/git/${repoDetails.id}`);
        resp.body.active.should.be.true;
        resp.body.created.should.be.true;
        resp.body.size.should.be.a('number');
        resp.body.key.should.equal(
          helpers.repoManagerKey(resp.body.id, config)
        );
      });

    repoPath = helpers.repoPath(GIT_ROOT, repoDetails.id);

    const lsRepo = await execp(`ls ${repoPath}`);
    lsRepo.stderr.should.equal('');
    lsRepo.stdout.should.have.string('hackerrank.yml');
    lsRepo.stdout.should.have.string('hackerrank.json');

    [
      'HEAD', 'config', 'description', 'hooks', 'info', 'objects', 'refs',
      'packed-refs',
    ].forEach(function(fileName) {
      lsRepo.stdout.should.have.string(fileName);
    });


    const relevantFiles = [
      'angular-cli.json',
      'src/app/app.component.ts',
      '.dot-dir/',
      '.bin/',
    ];
    const repoTree = await execp(
      `cd ${repoPath} && git ls-tree -r master ${relevantFiles.join(' ')}`
    );
    repoTree.stderr.should.equal('');
    const stdout = repoTree.stdout;
    stdout.should.have.string('angular-cli.json');
    stdout.should.have.string('.dot-dir');
    stdout.should.have.string('.dot-dir/README.md');
    stdout.split('\n').find(function(line) {
      return line.includes('.bin/test');
    }).should.have.string('100755 blob');

    const repoLog = await execp(`cd ${repoPath} && git log master`);
    repoLog.stderr.should.equal('');
    repoLog.stdout.should.have.string('Add initial repository');

    const hookPath = path.join(repoPath, 'hooks', 'pre-receive');
    const sourceHookPath = path.join(
      __dirname, '..', 'src', 'hooks', 'pre-receive.js'
    );

    test('-L', hookPath).should.be.true;
    test('-e', hookPath).should.be.true;

    cat(hookPath).toString()
      .should.deep.equal(cat(sourceHookPath).toString());

    JSON.parse(cat(path.join(repoPath, 'hackerrank.json')))
      .should.deep.equal(
        yaml.safeLoad(cat(path.join(repoPath, 'hackerrank.yml')))
      );

    cat(path.join(repoPath, 'max_size')).trim()
      .should.be.equal(maxSize.toString());

    const output = await execp([
      `cd ${repoPath}`,
      `git config receive.denyDeletes`,
    ].join(' && '));
    output['stdout'] = output['stdout'].replace(/(\r\n|\n|\r)/gm, '');
    output['stdout'].should.be.equal('true');
  });

  it('gets the details of a repository', async function() {
    await supertest.agent(server)
      .get(`/repositories/${repoDetails.id}`)
      .auth('admin', CONFIG.adminKey)
      .expect(200)
      .expect(function(resp) {
        resp.body.should.deep.equal(repoDetails);
      });
  });

  it('GET 404s for non existant repositories', async function() {
    await supertest.agent(server)
      .get('/repositories/invalid-repo/')
      .auth('admin', CONFIG.adminKey)
      .expect(404)
      .expect('Not found.');
  });

  it('creates a repository from a git repo', async function() {
    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        git_url: repoDetails.url,
      })
      .expect(200)
      .expect(function(resp) {
        resp.body.id.length
          .should.equal(36);
        resp.body.url
          .should.equal(`${PUBLIC_HOST}/git/${resp.body.id}`);
        resp.body.active.should.be.true;
        resp.body.created.should.be.true;

        cloneRepoPath = helpers.repoPath(GIT_ROOT, resp.body.id);

        helpers.isRepo(cloneRepoPath).should.be.true;

        cat(`${cloneRepoPath}/hooks/pre-receive`).trim()
          .should.equal(cat(`${__dirname}/../src/hooks/pre-receive.js`).trim());

        cat(`${cloneRepoPath}/hackerrank.yml`).trim()
          .should.equal(cat(`${repoPath}/hackerrank.yml`).trim());

        cat(`${cloneRepoPath}/hackerrank.json`).trim()
          .should.equal(cat(`${repoPath}/hackerrank.json`).trim());
      });

      const output = await execp([
        `cd ${cloneRepoPath}`,
        `git config receive.denyDeletes`,
      ].join(' && '));
      output['stdout'] = output['stdout'].replace(/(\r\n|\n|\r)/gm, '');
      output['stdout'].should.be.equal('true');
  });

  it('doesn\'t create a repo from absentlocal git repo', async function() {
    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        git_url: `${PUBLIC_HOST}/git/invalid-repo`,
      })
      .expect(404)
      .expect('Source Repo Not Found.');
  });

  it('requires zip or git url', async function() {
    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .expect(400)
      .expect('Source URL is required.');
  });

  it('400s when given an invalid zip URL host', async function() {
    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        zip_url: 'http://localhost:11111/data/weather-api.zip',
      })
      .expect(400);
  });

  it('400s when given a non-existant zip\'s URL', async function() {
    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        zip_url: `http://localhost:${PORT}/data/invalid.zip`,
      })
      .expect(400)
      .expect('Failed to get the specified ZIP file.');
  });

  it('400s when to trying to create with a large zip', async function() {
    const zipUrl = `${PUBLIC_HOST}/data/large.zip`;

    const maxSize = 1024 * 2;

    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        zip_url: zipUrl,
        max_size: maxSize,
      })
      .expect(400)
      .expect('Extracted size too large.');
  });

  it('400s when given zip without hackerrank.yml', async function() {
    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        zip_url: `http://localhost:${PORT}/data/weather-api-without-hackerrank-yml.zip`,
      })
      .expect(400)
      .expect('Unable to read the hackerrank.yml');
  });

  it('no params to put is a noop', async function() {
    const inactiveLock = path.join(repoPath, 'inactive.lock');

    await supertest.agent(server)
      .put(`/repositories/${repoDetails.id}`)
      .auth('admin', CONFIG.adminKey)
      .expect(200)
      .expect(function(resp) {
        resp.body.should.deep.equal(repoDetails);
      });

    test('-f', inactiveLock).should.be.false;
  });


  it('marks repository as inactive', function() {
    const inactiveLock = path.join(repoPath, 'inactive.lock');

    return supertest.agent(server)
      .put(`/repositories/${repoDetails.id}`)
      .auth('manager', repoDetails.key)
      .type('form')
      .send({
        active: false,
      })
      .expect(200)
      .expect(function(resp) {
        resp.body.should.deep.equal(_.defaults({
          active: false,
        }, repoDetails));
        test('-f', inactiveLock).should.be.true;
      });
  });

  it('marks repository as active', function() {
    const inactiveLock = path.join(repoPath, 'inactive.lock');

    return supertest.agent(server)
      .put(`/repositories/${repoDetails.id}`)
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        active: true,
      })
      .expect(200)
      .expect(function(resp) {
        resp.body.should.deep.equal(repoDetails);
        test('-f', inactiveLock).should.be.false;
      });
  });

  it('sets repository max size', function() {
    return supertest.agent(server)
      .put(`/repositories/${repoDetails.id}`)
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        max_size: 4096,
      })
      .expect(200)
      .expect(function(resp) {
        cat(path.join(repoPath, 'max_size')).trim()
          .should.be.equal('4096');
      });
  });

  it('PUT 404s for non existant repositories', async function() {
    await supertest.agent(server)
      .put('/repositories/invalid-repo/')
      .auth('admin', CONFIG.adminKey)
      .expect(404)
      .expect('Not found.');
  });


  describe('doesn\'t allow non-admins to', async function() {
    it('create repo with git url', function() {
      return supertest.agent(server)
        .post('/repositories')
        .type('form')
        .send({
          git_url: repoDetails.url,
        })
        .expect(403);
    });

    it('get details', function() {
      return supertest.agent(server)
        .get(`/repositories/${repoDetails.id}`)
        .expect(403);
    });

    it('modification to the repo state', function() {
      return supertest.agent(server)
        .put(`/repositories/${repoDetails.id}`)
        .type('form')
        .send({
          active: true,
        })
        .expect(403);
    });
  });

  after(() => rm('-rf', TMP_DIR));
  after(() => server.close());
});
