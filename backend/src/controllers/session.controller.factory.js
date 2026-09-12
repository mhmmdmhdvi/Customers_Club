const { RegistrationError } = require("../utils/registration-error");
const { AuthError } = require("../utils/auth-error");
const { readRefreshCookie, setRefreshCookie, clearRefreshCookie } = require("../utils/session-cookie");
const { sendFailure } = require("../middleware/session-auth");

function createSessionController({ sessionService, getConfig }) {
  function sendSession(res, grant, config, status, message) {
    setRefreshCookie(res, grant.refreshToken, grant.refreshExpiresAt, config);
    return res.status(status).json({
      message, authenticated: true, user: grant.user, tokenType: "Bearer",
      accessToken: grant.accessToken, expiresIn: grant.expiresIn,
      accessExpiresAt: grant.accessExpiresAt,
    });
  }
  function grantHandler(method, status, message) {
    return async (req, res) => {
      res.set("Cache-Control", "no-store");
      let config;
      try {
        config = getConfig();
        const input = method === "refresh" ? readRefreshCookie(req, config) : req.body;
        const grant = await sessionService[method](input);
        return sendSession(res, grant, config, status, message);
      } catch (error) {
        if (method === "refresh" && config && error instanceof AuthError && error.statusCode === 401) {
          clearRefreshCookie(res, config);
        }
        if (error instanceof RegistrationError) {
          return res.status(error.statusCode).json({ message: error.message });
        }
        return sendFailure(res, error);
      }
    };
  }
  async function logout(req, res) {
    res.set("Cache-Control", "no-store");
    try {
      const config = getConfig();
      await sessionService.logout(readRefreshCookie(req, config));
      clearRefreshCookie(res, config);
      return res.status(204).end();
    } catch (error) { return sendFailure(res, error); }
  }
  function me(req, res) {
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ user: req.auth.user });
  }
  return {
    register: grantHandler("register", 201, "Registration completed"),
    login: grantHandler("login", 200, "Logged in"),
    refresh: grantHandler("refresh", 200, "Session refreshed"),
    logout, me,
  };
}
module.exports = { createSessionController };
