const { AuthError, AuthConfigurationError } = require("../utils/auth-error");

function requestRoute(req) {
  const originalUrl =
    typeof req.originalUrl === "string"
      ? req.originalUrl
      : "";

  return (
    originalUrl.split("?")[0] ||
    req.path ||
    "/"
  );
}

function recordSecurityEvent(
  securityEventService,
  event,
) {
  if (
    !securityEventService ||
    typeof securityEventService.record !==
    "function"
  ) {
    return;
  }

  try {
    const pending =
      securityEventService.record(event);

    Promise.resolve(pending).catch(() => {
      console.error(
        "Security event recording failed",
      );
    });
  } catch {
    console.error(
      "Security event recording failed",
    );
  }
}

function sendFailure(res, error) {
  res.set("Cache-Control", "no-store");
  if (error instanceof AuthError) return res.status(error.statusCode).json({ message: error.message });
  if (error instanceof AuthConfigurationError) return res.status(503).json({ message: "Authentication unavailable" });
  // Never log headers, bearer/refresh credentials or database exceptions.
  console.error("Authentication operation failed");
  return res.status(500).json({ message: "Internal server error" });
}

function createSessionGuard(
  getConfig,
  {
    securityEventService,
  } = {},
) {
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
    } catch (error) {
      let eventType =
        "REQUEST_SECURITY_REJECTED";

      let reason =
        "SECURITY_POLICY_REJECTED";

      if (
        error instanceof AuthError &&
        error.message ===
        "CSRF protection header required"
      ) {
        eventType = "CSRF_REJECTED";
        reason =
          "MISSING_OR_INVALID_CSRF_HEADER";
      } else if (
        error instanceof AuthError &&
        error.message ===
        "Request origin is not allowed"
      ) {
        eventType = "ORIGIN_REJECTED";
        reason = "UNTRUSTED_ORIGIN";
      } else if (
        error instanceof AuthError &&
        error.statusCode === 415
      ) {
        eventType =
          "CONTENT_TYPE_REJECTED";
        reason = "NON_JSON_REQUEST";
      }

      recordSecurityEvent(
        securityEventService,
        {
          eventType,
          outcome: "FAILURE",
          actorUserId:
            req.auth?.user?.id ?? null,
          requestId: req.requestId,
          route: requestRoute(req),
          statusCode:
            error.statusCode ?? 403,
          details: {
            reason,
          },
        },
      );

      return sendFailure(res, error);
    }
  };
}

function createAuthentication(
  service,
  {
    securityEventService,
  } = {},
) {
  return async function authenticate(
    req,
    res,
    next,
  ) {
    res.set(
      "Cache-Control",
      "no-store",
    );

    const header =
      req.headers.authorization;

    if (
      typeof header !== "string" ||
      header.length > 4103 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(
        header,
      )
    ) {
      recordSecurityEvent(
        securityEventService,
        {
          eventType:
            "AUTHENTICATION_REJECTED",
          outcome: "FAILURE",
          actorUserId: null,
          requestId:
            req.requestId,
          route:
            requestRoute(req),
          statusCode: 401,
          details: {
            reason:
              "INVALID_AUTHORIZATION_HEADER",
          },
        },
      );

      return sendFailure(
        res,
        new AuthError(),
      );
    }

    try {
      req.auth =
        await service.authenticate(
          header.slice(7),
        );

      next();
    } catch (error) {
      recordSecurityEvent(
        securityEventService,
        {
          eventType:
            "AUTHENTICATION_REJECTED",
          outcome: "FAILURE",
          actorUserId: null,
          requestId:
            req.requestId,
          route:
            requestRoute(req),
          statusCode:
            error instanceof AuthError
              ? error.statusCode
              : 500,
          details: {
            reason:
              "INVALID_OR_EXPIRED_SESSION",
          },
        },
      );

      return sendFailure(
        res,
        error,
      );
    }
  };
}

function requireRole(...input) {
  let options = {};

  const last =
    input[input.length - 1];

  if (
    last &&
    typeof last === "object" &&
    !Array.isArray(last)
  ) {
    options = input.pop();
  }

  const roles = input;

  if (
    roles.length === 0 ||
    roles.some(
      (role) =>
        ![
          "MEMBER",
          "ADMIN",
        ].includes(role),
    )
  ) {
    throw new TypeError(
      "Explicit MEMBER or ADMIN roles are required",
    );
  }

  return (req, res, next) => {
    if (!req.auth?.user) {
      return sendFailure(
        res,
        new AuthError(),
      );
    }

    if (
      !roles.includes(
        req.auth.user.role,
      )
    ) {
      recordSecurityEvent(
        options.securityEventService,
        {
          eventType:
            "AUTHORIZATION_REJECTED",
          outcome: "FAILURE",
          actorUserId:
            req.auth.user.id,
          requestId:
            req.requestId,
          route:
            requestRoute(req),
          statusCode: 403,
          details: {
            requiredRoles:
              roles,
          },
        },
      );

      return sendFailure(
        res,
        new AuthError(
          "Forbidden",
          403,
        ),
      );
    }

    next();
  };
}
module.exports = { createSessionGuard, createAuthentication, requireRole, sendFailure };
