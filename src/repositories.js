const bodyParser = require('body-parser');
  express = require('express'),
  path = require('path'),
  uuid = require('uuid/v4'),
  util = require('util'),
  execp = util.promisify(require('child_process').exec),
  yaml = require('js-yaml'),
  logger = require('winston'),
  _ = require('lodash');
const helpers = require('./helpers.js');
const chain = helpers.chain;
const GitServerError = helpers.GitServerError;
const defaults = require('./defaults.json');

class Repository {
  constructor(config, id) {
    this.config = config;
    this.gitRoot = config.gitRoot;

    if (!id) {
      id = uuid();
    }

    this.id = id;
  }

  async asObject() {
    return {
      id: this.id,
      created: true,
      active: this.active,
      size: await this.size,
      key: this.key(this.config),
      url: helpers.repoURL(this.id, this.config.host, this.config.secure),
    };
  }

  key(config) {
    return helpers.repoManagerKey(this.id, config);
  }

  get exists() {
    return helpers.isRepo(this.fsPath);
  }

  get fsPath() {
    return helpers.repoPath(this.gitRoot, this.id);
  }

  get active() {
    return helpers.isActive(this.fsPath);
  }

  set active(val) {
    return helpers.isActive(this.fsPath, val);
  }

  get size() {
    return helpers.repoSize(this.fsPath);
  }

  async setMaxSize(size) {
    const maxSize = parseInt(size, 10);
    if (!_.isNaN(maxSize)) {
      await execp(`echo ${size} > ${path.join(this.fsPath, 'max_size')}`);
    }
  }

  async createFromZip(zipUrl, maxSize) {
    let fsPath = this.fsPath;
    let sourcePath = path.join(fsPath, 'source');

    try {
      await helpers.unzipUrl(zipUrl, sourcePath, maxSize || defaults.maxSize);
      await helpers.hrConfigToJson(sourcePath);
    } catch (e) {
      throw new GitServerError(e.message, 400);
    }

    await chain(
      `cd ${fsPath}`,
      'mv source/hackerrank.yml . ',
      'mv source/hackerrank.json . ',
      'cd source',
      'git init',
      'git add .',
      'git commit -am "Add initial repository"',
      'cd ..',
      'git clone --bare source repo',
      'mv repo/* .',
      'rm hooks/*',
      'rm -r source repo',
      `ln -sf ${__dirname}/hooks/pre-receive.js ${fsPath}/hooks/pre-receive`,
      `git config receive.denyDeletes true`
    );

    await this.setMaxSize(maxSize);

    return true;
  }

  async createFromGit(gitUrl, maxSize) {
    const sourceRepo = new Repository(this.config, gitUrl.split('/').pop());
    const fsPath = this.fsPath;

    if (!sourceRepo.exists) {
      throw new GitServerError('Source Repo Not Found.', 404);
    }

    await chain(
      `git clone --bare ${sourceRepo.fsPath} ${fsPath}`,
      `cp ${sourceRepo.fsPath}/hackerrank.yml ${fsPath}/`,
      `cp ${sourceRepo.fsPath}/hackerrank.json ${fsPath}/`,
      `ln -sf ${__dirname}/hooks/pre-receive.js ${fsPath}/hooks/pre-receive`,
      `cd ${fsPath}`,
      `git config receive.denyDeletes true`
    );
    this.setMaxSize(maxSize);
  }
}

const handlers = {
  get: async function getRepo(req, res) {
    res.send(await req.repo.asObject());
  },

  create: async function createRepo(req, res) {
    const repo = new Repository(req.config);
    const maxSize = req.body.max_size;

    try {
      if (req.body.zip_url) {
        await repo.createFromZip(req.body.zip_url, maxSize);
      } else if (req.body.git_url) {
        await repo.createFromGit(req.body.git_url, maxSize);
      } else {
        throw new GitServerError('Source URL is required.', 400);
      }
      res.send(await repo.asObject());
    } catch (e) {
      logger.warn({
        repoId: repo.id,
        params: req.body,
        key: 'create-repo-failed',
        reason: e.message,
      });
      res.status(_.get(e, 'code', 500)).send(e.message);
    }
  },

  update: async function updateRepo(req, res) {
    if ('active' in req.body) {
      req.repo.active = req.body.active === 'true';
    }
    req.repo.setMaxSize(req.body.max_size);
    res.send(await req.repo.asObject());
  },
};

const middleware = {
  permission: function permissionMiddleware(req, res, next) {
    let repoId = req.repo ? req.repo.id : null;
    if (!helpers.isAdmin(req, req.config, repoId)) {
      res.status(403)
        .send('Permission denied.');
      return;
    }
    next();
  },

  repoId: function repoIdMiddleware(req, res, next) {
    repo = new Repository(req.config, req.params.id);
    req.repo = repo;

    if (!repo.exists) {
      logger.debug({
        key: 'repo-not-found',
        repoId: repo.id,
        namespace: 'get-repo',
      });
      res.status(404)
        .send('Not found.');
      return;
    }

    req.repo = repo;
    next();
  },
};


function repositories(config) {
  router = new express.Router();

  router.use(bodyParser.urlencoded({extended: true}));
  router.use(function(req, res, next) {
    config.host = req.headers.host;
    config.secure = req.secure || req.headers['x-forwarded-proto'] == 'https';
    req.config = config;
    next();
  });
  router.use('/:id', middleware.repoId);
  router.use(middleware.permission);

  router.post('/', handlers.create);
  router.get('/:id', handlers.get);
  router.put('/:id', handlers.update);

  return router;
}


module.exports = repositories;
