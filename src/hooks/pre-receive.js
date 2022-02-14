#!/usr/bin/env node

const fs = require('fs');
const util = require('util');
const execp = util.promisify(require('child_process').exec);
const defaults = require(`${__dirname}/../defaults.json`);

const nullHash = '0000000000000000000000000000000000000000';

let [oldHash, newHash] = fs.readFileSync(0)
  .toString()
  .split(/\s+/);

let hrConf;
let maxSize;

try {
  maxSize = JSON.parse(fs.readFileSync('max_size'));
} catch (e) {
  maxSize = defaults.maxSize;
}

try {
  hrConf = JSON.parse(fs.readFileSync('hackerrank.json')).configuration;
} catch (e) {
  hrConf = {};
}

async function getRepoSize() {
  return parseInt((await execp(`du -sk`)).stdout.split(/\s+/)[0], 10);
}

class ValidationError extends Error {
  constructor(...params) {
    super(...params);
    this.name = 'ValidationError';
  }
};

async function validateHash() {
  let badObjectErr = `bad object ${nullHash}`;

  try {
    await execp(`git show --oneline -q ${newHash}`);
  } catch (e) {
    /* istanbul ignore else */
    if (e.stderr.indexOf(badObjectErr) != -1) {
      throw new ValidationError(
        'Deletion of branches is not allowed.'
      );
    } else {
      throw e;
    }
  }
}

async function processSize() {
  const size = await getRepoSize();
  if (size > maxSize) {
    throw new ValidationError(
      `Repo (${size} KB) too large. Maximum allowed: ${maxSize} KB.`
    );
  }

  return true;
}

function stringsToRegExps(strings) {
  return strings.map(function(pattern) {
    try {
      return new RegExp(pattern);
    } catch (_) {
      // Bad regexp pattern.
      return null;
    }
  }).filter((pattern) => pattern);
}

async function processReadOnly() {
  if (oldHash === nullHash) {
    oldHash = (await execp(
      `git rev-list --max-parents=0 --first-parent master`
    )).stdout.trim();
  }
  const files = (await execp(`git diff ${oldHash} ${newHash} --name-only`,
                            {maxBuffer: 1024 * 1024 * 5}))
    .stdout
    .split('\s+')
    .map((s) => s.trim());

  const patterns = stringsToRegExps(hrConf.readonly_paths || []);

  const matches = files.filter(function(file) {
    for (let pattern of patterns) {
      if (file.match(pattern)) {
        return true;
      }
    }
  });

  if (matches.length !== 0) {
    throw new ValidationError(
      `Attempting to modify read only files: \n\t${matches.join('\n\t')}`
    );
  }
}

function ansiColorize(str, color) {
  const ansiColorCodes = {
    'red': 31,
    'green': 32,
  };
  const code = ansiColorCodes[color];
  /* istanbul ignore else */
  if (code) {
    str = `\x1b[${code}m${str}\x1b[0m`;
  }
  return str;
}

async function renderStatus() {
  let maxSizeMB = maxSize / 1024;
  let repoSizeMB = await getRepoSize() / 1024;
  const percentage = Math.round(repoSizeMB / maxSizeMB * 100);

  // round to one decimal place
  maxSizeMB = Math.round(maxSizeMB * 10) / 10;
  repoSizeMB = Math.round(repoSizeMB * 10) / 10;

  const barLen = 32;
  const progress = Math.round(barLen * percentage / 100);
  const progressBar = '#'.repeat(progress) + '-'.repeat(barLen - progress);

  process.stdout.write(ansiColorize(
    'Pushed to HackerRank Git Server',
    'green') + '\n');
  process.stdout.write(ansiColorize(
    `[${progressBar}] Using ${repoSizeMB} / ${maxSizeMB}MB (${percentage}%)`,
    'green'));
}

function renderError(msg) {
  let error = [
    '_______________________________________________________________________',
    ' ___  __   __   __   __',
    '|__  |__) |__) /  \\ |__)',
    '|___ |  \\ |  \\ \\__/ |  \\',
    '',
    `${msg}`,
    '_______________________________________________________________________',
  ].join('\n');
  process.stdout.write(ansiColorize(`${error}`, 'red'));
}

validateHash().
  then(processSize).
  then(processReadOnly).
  then(function() {
    Promise.resolve(renderStatus());
  })
  .catch(function(e) {
    if (e.name === 'ValidationError') {
      renderError(e.message);
    } else {
      // TODO: Change this to send an alert to our systems.
      renderError(`Unknown server error occured: ${e.name} => ${e.message}`);
    }
    process.exit(1);
  });
