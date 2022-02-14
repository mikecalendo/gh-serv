const app = require("./app.js");
const config = require("./config.js");
const logger = require("winston");

if (require.main == module) {
  app(config).listen(config.serverPort, function () {
    logger.info({
      key: "start-server",
      port: config.serverPort,
      logvel: config.logLevel,
      gitRoot: config.gitRoot
    });
  });
}
