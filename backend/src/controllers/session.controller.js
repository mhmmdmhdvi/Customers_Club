const sessionService = require("../services/session.service");
const { readAuthConfig } = require("../config/auth");
const { createSessionController } = require("./session.controller.factory");

module.exports = createSessionController({ sessionService, getConfig: readAuthConfig });
