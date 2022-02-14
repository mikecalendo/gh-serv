const path = require('path');
const chai = require('chai');
const config = require('../src/config');
const helpers = require('../src/helpers');
const mockery = require('mockery');

chai.should();

describe('repoPath', function() {
  const repoPath = helpers.repoPath;
  const gitRoot = 'gitRoot';
  const testId = '063d530b-624d-4655-a902-5ec875f214e7';
  const testIdSplit = '06/3d/530b-624d-4655-a902-5ec875f214e7';

  it('splits a repo id in subdirectories', function() {
    repoPath(gitRoot, testId)
      .should.equal(path.join(gitRoot, testIdSplit));
  });

  it('works with empty git root', function() {
    repoPath('', testId)
      .should.equal(testIdSplit);
  });

  it('works with small_ids', function() {
    repoPath(gitRoot, 't')
      .should.equal(path.join(gitRoot, 't'));

    repoPath(gitRoot, 'tes')
      .should.equal(path.join(gitRoot, 'te/s'));

    repoPath(gitRoot, 'test')
      .should.equal(path.join(gitRoot, 'te/st'));
  });
});


describe('repoURL', function() {
  it('should generate correct URL based on host', function() {
    helpers.repoURL('test-repo', 'git-server', false).
      should.equal('http://git-server/git/test-repo');
  });

  it('should respect secure requests', function() {
    helpers.repoURL('test-repo', 'git-server', true).
      should.equal('https://git-server/git/test-repo');
  });
});


describe('isAdmin', function() {
  const repo = 'test-repo';
  const adminKey = config.adminKey;
  const key = helpers.repoManagerKey(repo, config);

  function genAuthReq(user, pass) {
    const authStr = Buffer.from(`${user}:${pass}`).toString('base64');
    return {
      headers: {
        authorization: `Basic ${authStr}`,
      },
    };
  }

  it('should validate admins', function() {
    helpers.isAdmin(genAuthReq('admin', adminKey), config).should.be.true;
  });

  it('should validate managers', function() {
    key.length.should.equal(40);
    helpers.isAdmin(genAuthReq('manager', key), config, repo).should.be.true;
  });

  it('require repo name to validate managers', function() {
    helpers.isAdmin(genAuthReq('manager', key), config).should.be.false;
  });

  it('should not validate other repo\'s managers', function() {
    const key2 = helpers.repoManagerKey('another-test-repo', config);
    key2.length.should.equal(40);
    helpers.isAdmin(genAuthReq('manager', key2), config, repo).should.be.false;
  });
});

describe('isMemAvailable', function() {
  function enableMocks(rssMock) {
    mockery.enable({
      useCleanCache: true,
      warnOnUnregistered: false,
      warnOnReplace: false,
    });

    const process = require('process');
    let processMock = Object.assign({}, process);
    processMock.memoryUsage = () => {
      return {
        rss: rssMock,
      };
    };

    mockery.registerMock('process', processMock);
  }

  function disableMocks() {
    mockery.disable();
  }

  it('should return true if rss is less than 200MB ' +
     '(default threshold)', function() {
    enableMocks(1);
    require('../src/helpers').isMemAvailable(1).should.be.true;
    disableMocks();
  });

  it('should return false if rss is at least 200MB ' +
     '(default threshold)', function() {
    enableMocks(209715200);
    require('../src/helpers').isMemAvailable(1).should.be.false;
    disableMocks();
  });
});
