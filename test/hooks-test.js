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
const makeApp = require('../src/app.js');
const helpers = require('../src/helpers.js');
const config = require('../src/config.js');

chai.should();

describe('pre-receive', function() {
  const PORT = (20000 + (new Date().getTime() % 10000)) | 0;
  const TMP_DIR = path.join(
    os.tmpdir(), `git-repos-test-${new Date().getTime()}`
  );
  const GIT_ROOT = path.join(TMP_DIR, 'gitRoot');
  const CLONE_DIR = path.join(TMP_DIR, 'test-clone');
  const CONFIG = _.defaults({
    gitRoot: GIT_ROOT,
    publicHost: `http://localhost:${PORT}`,
  }, config);

  let app;
  let server;
  let repoDetails;
  let repoPath;


  before(function() {
    mkdirp(GIT_ROOT);
  });

  before(function() {
    app = makeApp(CONFIG);
    app.use('/data', express.static('./test/data/'));

    server = app.listen(PORT);
  });

  before(async function() {
    const zipUrl = `http://127.0.0.1:${PORT}/data/weather-api.zip`;

    await supertest.agent(server)
      .post('/repositories')
      .auth('admin', CONFIG.adminKey)
      .type('form')
      .send({
        zip_url: zipUrl,
      })
      .expect(200)
      .expect(function(resp) {
        repoDetails = resp.body;
        repoPath = helpers.repoPath(GIT_ROOT, repoDetails.id);
      });

    await execp([
      `cd ${TMP_DIR}`,
      `git clone ${repoDetails.url} test-clone`,
    ].join(' && '));
  });

  it('allows legal modifications', async function() {
    let out = await execp([
      `cd ${CLONE_DIR}`,
      'echo "Test Valid Change" > README.txt',
      'git add README.txt',
      'git commit -m "A Valid Change"',
      'git push origin master',
    ].join(' && '));
    out.stderr.should.have.string('Pushed to HackerRank Git Server');
    out.stderr.should.match(
      /\[#*-*\] Using [0-9\.]+ \/ [0-9\.]+MB \([0-9]+%\)/);
  });

  it('allows branch creation', async function() {
    const newBr = 'new_br';
    const out = await execp([
      `cd ${CLONE_DIR}`,
      `git branch ${newBr}`,
      `git push -u origin ${newBr}`,
    ].join(' && '));
    out.stdout.should.have.string(
      `Branch '${newBr}' set up to track remote branch '${newBr}'` +
      ` from 'origin'`
    );
  });

  it('disllows branch deletion', async function() {
    try {
      await execp([
        `cd ${CLONE_DIR}`,
        'git push origin --delete master',
      ].join(' && '));
      chai.assert(false, 'Push should be rejected by the pre-commit hook.');
    } catch (e) {
      e.code.should.equal(1);
      e.stderr.should.have.string('pre-receive hook declined');
      e.stderr.should.have.string(
        'Deletion of branches is not allowed.'
      );
    }
  });

  it('disllows modification of read-only files', async function() {
    try {
      let testPath = 'WeatherApi/src/test/resources/testcases/description.txt';
      await execp([
        `cd ${CLONE_DIR}`,
        `echo "Test Change" >> ${testPath}`,
        'git commit -am "Modify a Readonly File"',
        'git push origin master',
      ].join(' && '));
      chai.assert(false, 'Push should be rejected by the pre-commit hook.');
    } catch (e) {
      e.code.should.equal(1);
      e.stderr.should.have.string('pre-receive hook declined');
      e.stderr.should.have.string(
        'Attempting to modify read only files'
      );
      e.stderr.should.have.string(
        'WeatherApi/src/test/resources/testcases/description.txt'
      );
    }

    const {stdout, stderr} = await execp([
      `cd ${CLONE_DIR}`,
      'git reset --hard origin/master',
    ].join(' && '));
    stderr.should.be.equal('');
    stdout.should.have.string('A Valid Change');
  });

  it('disllows large pushes', async function() {
    try {
      await execp([
        `echo 2048 > ${repoPath}/max_size`,
        `cd ${CLONE_DIR}`,
        `dd if=/dev/urandom of=random.txt count=2 bs=${1024 * 1024}`,
        'git add random.txt',
        'git commit -m "A large random file."',
        'git push origin master',
      ].join(' && '));
      chai.assert(false, 'Push should be rejected by the pre-commit hook.');
    } catch (e) {
      e.code.should.equal(1);
      e.stderr.should.have.string('too large. Maximum allowed: 2048 KB');
      e.stderr.should.have.string('pre-receive hook declined');
    }

    const {stdout, stderr} = await execp([
      `cd ${CLONE_DIR}`,
      'git reset --hard origin/master',
    ].join(' && '));
    stderr.should.be.equal('');
    stdout.should.have.string('A Valid Change');
  });

  it('fails for invalid hooks config', async function() {
    const hrConfPath = `${repoPath}/hackerrank.json`;


    const validConfig = JSON.parse(await helpers.readFile(hrConfPath));


    const invalidConfig = _.defaultsDeep({
      configuration: {
        readonly_paths: 1, // This isn't a list of path strings.
      },
    }, validConfig);

    try {
      await execp([
        `echo '${JSON.stringify(invalidConfig)}' > ${hrConfPath}`,
        `cd ${CLONE_DIR}`,
        'echo "Another Valid Change" >> README.txt',
        'git add README.txt',
        'git commit -m "Another Valid Change"',
        'git push origin master',
      ].join(' && '));

      chai.assert(false, 'Push should be rejected by the pre-commit hook.');
    } catch (e) {
      e.code.should.equal(1);
      e.stderr.should.have.string('pre-receive hook declined');
      e.stderr.should.have.string('Unknown server error occured: TypeError');
    }

    const {stdout, stderr} = await execp([
      `cd ${CLONE_DIR}`,
      'git reset --hard origin/master',
      `echo ${JSON.stringify(validConfig)} > ${hrConfPath}`,
    ].join(' && '));
    stderr.should.be.equal('');
    stdout.should.have.string('A Valid Change');
  });

  it('forgives missing hackerrank.json', async function() {
    await execp([
      `mv ${repoPath}/hackerrank.json ${repoPath}/hackerrank.json.bk`,
      `cd ${CLONE_DIR}`,
      'echo "Test Valid Change" >> README.txt',
      'git add README.txt',
      'git commit -m "A Valid Change"',
      'git push origin master',
      `mv ${repoPath}/hackerrank.json.bk ${repoPath}/hackerrank.json`,
      `cd ${CLONE_DIR}`,
      'git reset --hard origin/master',
    ].join(' && '));
  });

  it('allows git diff --name-only for changes < 5MB', async function() {
    let dirPattern = 'lots-of-files';
    let filePattern = 'dummy-file-eePh4aewaeyoosahTh4sei2roecha8';

    await execp([
      `cd ${CLONE_DIR}`,
      `bash -c 'mkdir -p ${dirPattern}/{a..m}'`,
      `bash -c 'ls ${dirPattern} | \
        while read d; do \
          touch ${dirPattern}/$d/${filePattern}-{000..400}.txt; \
        done'`,
      `git add .`,
      `git commit -m "Large no. of files added to repo"`,
      `git show HEAD --name-only > /tmp/name-only.output`,
      `git push origin master`,
    ].join(' && '), {
      maxBuffer: 1024 * 1024 * 10,
    });
  });

  after(() => rm('-rf', TMP_DIR));
  after(() => server.close());
});
