const _ = require('lodash');
const chai = require('chai');
const mkdirp = require('mkdirp').sync;
const os = require('os');
const path = require('path');
const util = require('util');
const {rm, test} = require('shelljs');
const execp = util.promisify(require('child_process').exec);
const request = require('supertest');
const appServer = require('../src/app.js');
const config = require('../src/config.js');
const helpers = require('../src/helpers.js');

chai.should();

describe('app', function() {
  const PORT = (20000 + (new Date().getTime() % 10000)) | 0;
  const REPO = `testrepo-${new Date().getTime()}`;
  const REPO_URL = `http://localhost:${PORT}/git/${REPO}`;
  const TMP_DIR = path.join(
    os.tmpdir(),
    `git-server-test-${new Date().getTime()}`
  );
  const GIT_ROOT = path.join(TMP_DIR, 'gitRoot');
  const SOURCE = helpers.repoPath(GIT_ROOT, REPO);
  const CONFIG = _.defaults({
    gitRoot: GIT_ROOT,
    publicHost: `http://localhost:${PORT}`,
  }, config);

  let app = null;


let server = null;

  before(async function() {
    mkdirp(GIT_ROOT);
    mkdirp(SOURCE);
  });

  before(function() {
    app = appServer(CONFIG);
    server = app.listen(PORT);
  });

  it('mounts a git server at the correct path', async function() {
    await execp(`cd ${SOURCE} && git init --bare`);
    await execp(`cd ${TMP_DIR} && git clone ${REPO_URL}`);
    rm('-rf', path.join(TMP_DIR, REPO));
  });

  it('mounts the repository REST API', function() {
    return request(app)
      .get(`/repositories/${REPO}`)
      .auth('admin', CONFIG.adminKey)
      .expect(200)
      .expect(function(resp) {
        resp.body.id.should.equal(REPO);
      });
  });

  it('does a health check', function() {
    test('-f', path.join(GIT_ROOT, '.healthy')).should.be.false;
    return request(app)
      .get('/health-check/')
      .expect(200)
      .expect('OK')
      .expect(function(_) {
        test('-f', path.join(GIT_ROOT, '.healthy')).should.be.true;
      });
  });

  it('fails a health check with unwritable git root', function() {
    let gitRoot = '/root/repositories/';
    let failingApp = appServer(_.defaults({
      gitRoot: gitRoot,
    }, CONFIG));
    test('-f', path.join(gitRoot, '.healthy')).should.be.false;
    return request(failingApp)
      .get('/health-check/')
      .expect(507)
      .expect(`File system unhealthy.`)
      .expect(function(_) {
        test('-f', path.join(gitRoot, '.healthy')).should.be.false;
      });
  });

  it('root path works as a health-check', function() {
    return request(app)
      .get('/')
      .expect(200)
      .expect('OK');
  });

  it('responds to an options request from localhost', function() {
    return request(app)
      .options('/')
      .expect(204);
  });

  it('fails options request from google.com', function() {
    return request(app)
      .options('/')
      .set('Origin', 'google.com')
      .expect(401);
  });

  [
    'x.hackerrank.com',
    'x.hackerrank.net',
    'https://x.hackerrank.com',
    'https://x.hackerrank.net',
    'localhost',
    'localhost:8000',
    'http://localhost',
    'http://localhost:8000',
    '127.0.0.1',
  ].forEach(function(origin) {
    it(`sets CORS header for ${origin}`, function() {
      return request(app)
        .options('/')
        .set('Origin', origin)
        .expect(204)
        .then((res) => {
          let headers = res.headers;
          headers['access-control-allow-origin'].should.equal(origin);
          headers['access-control-allow-headers'].should.equal('content-type');
          headers['vary'].should.equal('Origin');
        });
    });
  });

  [
    'google.com',
    'malicioushackerrank.net',
    'malicioushackerrank.com',
    'hackerrank.net.malicious',
    'hackerrank.com.malicious',
    'x.hackerrank.net.malicious',
    'x.hackerrank.com.malicious',
    'localhost.malicious.com',
    'http://maliciouslocalhost',
    'maliciouslocalhost',
  ].forEach(function(origin) {
    it(`fails to set CORS header for ${origin}`, function() {
      return request(app)
        .get('/')
        .set('Origin', origin)
        .expect(200)
        .then((res) => {
          chai.assert.isNotOk('access-control-allow-origin' in res.headers);
          chai.assert.isNotOk('access-control-allow-headers' in res.headers);
        });
    });
  });

  after(() => server.close());
  after(() => rm('-rf', TMP_DIR));
});
