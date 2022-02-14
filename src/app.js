const express = require('express');
const expressWinston = require('express-winston');
const winston = require('winston');
const gitBackend = require('./git-backend.js');
const repositories = require('./repositories.js');
const helpers = require('./helpers.js');

const allowedOrigins = [
  /\.hackerrank\.net$/,
  /\.hack errank\.com$/,
  /^(.*\/)?localhost$/,
  /^(.*\/)?localhost:\d+$/,
  /^(.*\/)?127\.0\.0\.1$/,
  /^(.*\/)?127\.0\.0\.1:\d+$/,
];

function validateOrigin(req, res, next) {
  for (const pattern of allowedOrigins) {
    if (req.headers.origin && req.headers.origin.match(pattern)) {
      req.originValid = true;
    }
  }
  next();
}

function handleCORS(req, res, next) {
  if (req.originValid && req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Headers', 'content-type');
    res.header('Vary', 'Origin');
  }
  next();
}

function handleOptions(req, res) {
  if (req.originValid || !req.headers.origin) {
    res.sendStatus(204);
  } else {
    res.sendStatus(401);
  }
}

function healthCheck(config) {
  router = new express.Router();
  router.get(['/', '/health-check/'], function(req, resp) {
    let msg = 'OK';
    let code = 200;
    if (!helpers.isMemAvailable(config.memLimit)) {
      msg = 'Exceeded memory limit.';
      code = 503;
    } else if (!helpers.isFsHealthy(config.gitRoot)) {
      msg = 'File system unhealthy.';
      code = 507;
    }

    if (code != 200) {
      logger.warn({
        key: 'health-check',
        reason: msg,
      });
    }
    resp.status(code).send(msg);
  });
  return router;
}

function makeApp(config) {
  const app = express();

  app.set('trust proxy');

  app.use(expressWinston.logger({
    winstonInstance: winston,
    meta: true,
    expressFormat: true,
    colorize: true,
  }));

  app.use(validateOrigin);
  app.use(handleCORS);
  app.options('*', handleOptions);

  app.use('/repositories', repositories(config));
  app.use('/git', gitBackend(config));
  app.get(['/', '/health-check/'], healthCheck(config));
  return app;
}


module.exports = makeApp;
