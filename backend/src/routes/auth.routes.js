const express = require("express");
const authController = require("../controllers/auth.controller");
const sessionController = require("../controllers/session.controller");
const sessionService = require("../services/session.service");
const { readAuthConfig } = require("../config/auth");
const { createSessionRoutes } = require("./session.routes.factory");
const router = express.Router();

router.post("/request-code", authController.requestCode);
router.post("/verify-code", authController.verifyCode);
router.use(createSessionRoutes({ controller: sessionController, sessionService, getConfig: readAuthConfig }));

module.exports = router;
