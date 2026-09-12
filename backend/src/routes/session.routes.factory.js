const express = require("express");
const { createSessionGuard, createAuthentication } = require("../middleware/session-auth");

function createSessionRoutes({ controller, sessionService, getConfig }) {
  const router = express.Router();
  const sessionRequest = createSessionGuard(getConfig);
  router.post("/register", sessionRequest, controller.register);
  router.post("/login", sessionRequest, controller.login);
  router.post("/refresh", sessionRequest, controller.refresh);
  router.post("/logout", sessionRequest, controller.logout);
  router.get("/me", createAuthentication(sessionService), controller.me);
  return router;
}
module.exports = { createSessionRoutes };
