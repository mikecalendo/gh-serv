const express = require('express');
const Git = require('node-git-server');
const helpers = require('./helpers.js');
const logger = require('winston');

const middleware = {
  repo: function repoMiddleware(req, res, next) {
    req.url = req.url.replace('.git', '');

    const repoId = req.path.split('/')[1];
    const repoPath = helpers.repoPath(req.config.gitRoot, repoId);

    req.repoId = repoId;
    req.repoPath = repoPath;
    req.repoIsActive = helpers.isActive(repoPath);

    if (!helpers.isRepo(repoPath)) {
      res.status(404)
        .send('Not found.');
      logger.warn({
        key: 'repo-not-found',
        repoId: repoId,
      });
      return;
    }

    next();
  },

  permission: function permissionMiddleware(req, res, next) {
    if (!(req.repoIsActive || helpers.isAdmin(req, req.config, req.repoId))) {
      // Request the git client for credentials.
      res.status(401)
        .header('WWW-Authenticate', 'Basic realm="Git Server"')
        .send('Authorization required.');
      logger.warn({
        key: 'authorization-required',
        repoId: req.repoId,
      });
      return;
    }

    next();
  },

  gitWrapper: function gitWrapperMiddleware(req, res) {
    // NOTE: Hack around `node-git-backend` to follow our repoPath template.
    //
    // Converts /repository-name to /re/po/sitory-name, which is what we follow
    // on the disk storage.
    req.url = req.url
      .replace(req.repoId, helpers.repoPath('', req.repoId));

    req.git.handle(req, res);
  },
};

function gitHandler(config) {
  const git = new Git(config.gitRoot);

  git.on('push', function(push) {
    logger.debug({
      key: 'repo-push',
      repoId: push.repo.replace(/\//g, ''),
      branch: push.branch,
      previousCommit: push.last,
      commit: push.commit,
    });
    push.accept();
  });

  git.on('fetch', function(fetch) {
    logger.debug({
      key: 'repo-fetch',
      repoId: fetch.repo.replace(/\//g, ''),
      branch: fetch.branch,
    });
    fetch.accept();
  });

  return git;
}

function gitBackend(config) {
  const router = new express.Router();
  const git = gitHandler(config);

  router.use(function(req, res, next) {
    config.host = req.headers.host;
    config.secure = req.secure || req.headers['x-forwarded-proto'] == 'https';
    req.config = config;
    req.git = git;
    next();
  });

  router.use(middleware.repo);
  router.use(middleware.permission);
  router.get('/:id/history', async function(req, res) {
    res.send(await helpers.repoHistory(req.repoPath));
  });
  router.get('/:id/diff', function(req, res) {
    helpers.gitDiff(req.repoPath).then(function(output) {
      res.send(output);
    });
  });
  router.get('/:id/source.zip', async function(req, res) {
    zip = helpers.zipRepo(req.repoPath);
    res.header('Content-Type', 'application/zip');
    res.header(
      'Content-disposition',
      `attachment; filename=${req.repoId}.zip`
    );
    zip.stdout.pipe(res);
  });
  router.use(middleware.gitWrapper);

  return router;
}

module.exports = gitBackend;
