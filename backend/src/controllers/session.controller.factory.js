const {
  RegistrationError,
} = require(
  "../utils/registration-error",
);

const {
  AuthError,
} = require(
  "../utils/auth-error",
);

const {
  readRefreshCookie,
  setRefreshCookie,
  clearRefreshCookie,
} = require(
  "../utils/session-cookie",
);

const {
  sendFailure,
} = require(
  "../middleware/session-auth",
);

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

    Promise.resolve(pending).catch(
      () => {
        console.error(
          "Security event recording failed",
        );
      },
    );
  } catch {
    console.error(
      "Security event recording failed",
    );
  }
}

function createSessionController({
  sessionService,
  getConfig,
  securityEventService,
}) {
  function sendSession(
    res,
    grant,
    config,
    status,
    message,
  ) {
    setRefreshCookie(
      res,
      grant.refreshToken,
      grant.refreshExpiresAt,
      config,
    );

    return res.status(status).json({
      message,
      authenticated: true,
      user: grant.user,
      tokenType: "Bearer",
      accessToken:
        grant.accessToken,
      expiresIn:
        grant.expiresIn,
      accessExpiresAt:
        grant.accessExpiresAt,
    });
  }

  function grantHandler(
    method,
    status,
    message,
  ) {
    return async (req, res) => {
      res.set(
        "Cache-Control",
        "no-store",
      );

      let config;

      try {
        config = getConfig();

        const input =
          method === "refresh"
            ? readRefreshCookie(
              req,
              config,
            )
            : req.body;

        const grant =
          await sessionService[
            method
          ](input);

        if (
          method === "login" &&
          grant?.mfaRequired === true
        ) {
          return res
            .status(200)
            .json({
              message:
                "MFA required",

              authenticated: false,

              mfaRequired: true,

              mfaChallengeToken:
                grant.mfaChallengeToken,

              mfaExpiresAt:
                grant.mfaExpiresAt,
            });
        }

        if (
          method === "login" &&
          grant.user?.role ===
          "ADMIN"
        ) {
          recordSecurityEvent(
            securityEventService,
            {
              eventType:
                "ADMIN_LOGIN",

              outcome:
                "SUCCESS",

              actorUserId:
                grant.user.id,

              requestId:
                req.requestId,

              route:
                requestRoute(req),

              statusCode: 200,
            },
          );
        }

        return sendSession(
          res,
          grant,
          config,
          status,
          message,
        );
      } catch (error) {
        if (
          method === "refresh" &&
          config &&
          error instanceof
          AuthError &&
          error.statusCode === 401
        ) {
          clearRefreshCookie(
            res,
            config,
          );
        }

        if (
          error instanceof
          RegistrationError
        ) {
          return res
            .status(
              error.statusCode,
            )
            .json({
              message:
                error.message,
            });
        }

        return sendFailure(
          res,
          error,
        );
      }
    };
  }

  async function completeAdminMfa(
    req,
    res,
  ) {
    try {
      const config =
        getConfig();

      const grant =
        await sessionService
          .completeAdminMfa(
            req.body,
          );

      if (
        grant.user?.role ===
        "ADMIN" &&
        securityEventService &&
        typeof securityEventService.record ===
        "function"
      ) {
        try {
          await securityEventService.record({
            eventType:
              "ADMIN_LOGIN",

            outcome:
              "SUCCESS",

            actorUserId:
              grant.user.id,

            requestId:
              req.requestId,

            route:
              (
                req.originalUrl ||
                req.url ||
                ""
              ).split("?")[0],

            statusCode: 200,
          });
        } catch (error) {
          console.error(
            "Failed to record ADMIN_LOGIN security event",
            error,
          );
        }
      }

      return sendSession(
        res,
        grant,
        config,
        200,
        "Logged in",
      );
    } catch (error) {
      return sendFailure(
        res,
        error,
      );
    }
  }

  async function logout(
    req,
    res,
  ) {
    res.set(
      "Cache-Control",
      "no-store",
    );

    try {
      const config =
        getConfig();

      await sessionService.logout(
        readRefreshCookie(
          req,
          config,
        ),
      );

      clearRefreshCookie(
        res,
        config,
      );

      return res
        .status(204)
        .end();
    } catch (error) {
      return sendFailure(
        res,
        error,
      );
    }
  }

  function me(req, res) {
    res.set(
      "Cache-Control",
      "no-store",
    );

    return res
      .status(200)
      .json({
        user: req.auth.user,
      });
  }

  return {
    register:
      grantHandler(
        "register",
        201,
        "Registration completed",
      ),

    login:
      grantHandler(
        "login",
        200,
        "Logged in",
      ),

    completeAdminMfa,

    refresh:
      grantHandler(
        "refresh",
        200,
        "Session refreshed",
      ),

    logout,
    me,
  };
}

module.exports = {
  createSessionController,
};