const { AuthError, AuthConfigurationError } = require("../utils/auth-error");

function sendFailure(res, error) {
  res.set("Cache-Control", "no-store");
  if (error instanceof AuthError) return res.status(error.statusCode).json({ message: error.message });
  if (error instanceof AuthConfigurationError) return res.status(503).json({ message: "Authentication unavailable" });
  // Never log headers, bearer/refresh credentials or database exceptions.
  console.error("Authentication operation failed");
  return res.status(500).json({ message: "Internal server error" });
}

function createSessionGuard(getConfig) {
  return function sessionGuard(req, res, next) {
    res.set("Cache-Control", "no-store");
    try {
      const config = getConfig();
      const origin = req.get("Origin");
      if (origin !== undefined && (typeof origin !== "string" || !config.allowedOrigins.includes(origin))) {
        throw new AuthError("Request origin is not allowed", 403);
      }
      if (req.get("X-CSRF-Protection") !== "1") throw new AuthError("CSRF protection header required", 403);
      if (!req.is("application/json")) throw new AuthError("JSON request required", 415);
      next();
    } catch (error) { return sendFailure(res, error); }
  };
}

function createAuthentication(service) {
  return async function authenticate(req, res, next) {
    res.set("Cache-Control", "no-store");
    const header = req.headers.authorization;
    if (typeof header !== "string" || header.length > 4103 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(header)) {
      return sendFailure(res, new AuthError());
    }
    try {
      req.auth = await service.authenticate(header.slice(7));
      next();
    } catch (error) { return sendFailure(res, error); }
  };
}

function requireRole(...roles) {
  if (roles.length === 0 || roles.some((role) => !["MEMBER", "ADMIN"].includes(role))) {
    throw new TypeError("Explicit MEMBER or ADMIN roles are required");
  }
  return (req, res, next) => {
    if (!req.auth?.user) return sendFailure(res, new AuthError());
    if (!roles.includes(req.auth.user.role)) return sendFailure(res, new AuthError("Forbidden", 403));
    next();
  };
}
module.exports = { createSessionGuard, createAuthentication, requireRole, sendFailure };
