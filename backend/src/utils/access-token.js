const { AuthError, AuthConfigurationError } = require("./auth-error");
const sessionIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function createAccessTokens(config, jwt = require("jsonwebtoken")) {
  if (!Buffer.isBuffer(config.secret) || config.secret.length !== 32 ||
      typeof config.issuer !== "string" || !config.issuer ||
      typeof config.audience !== "string" || !config.audience ||
      !Number.isInteger(config.accessTtlSeconds) || config.accessTtlSeconds < 1 || config.accessTtlSeconds > 900) {
    throw new AuthConfigurationError();
  }
  function issue(userId, sessionId, sessionExpiresAt) {
    if (!Number.isSafeInteger(userId) || userId < 1 || !sessionIdPattern.test(sessionId)) throw new AuthError();
    const now = Math.floor(Date.now() / 1000);
    const exp = Math.min(now + config.accessTtlSeconds, Math.floor(new Date(sessionExpiresAt).getTime() / 1000));
    if (!Number.isSafeInteger(exp) || exp <= now) throw new AuthError();
    const accessToken = jwt.sign({ sid: sessionId, tokenUse: "access", iat: now, exp }, config.secret, {
      algorithm: "HS256", issuer: config.issuer, audience: config.audience,
      subject: String(userId), header: { typ: "JWT" },
    });
    return { accessToken, expiresIn: exp - now, accessExpiresAt: new Date(exp * 1000).toISOString() };
  }
  function verify(rawToken) {
    try {
      if (typeof rawToken !== "string" || rawToken.length > 4096 || !rawToken) throw new AuthError();
      const now = Math.floor(Date.now() / 1000);
      const result = jwt.verify(rawToken, config.secret, {
        algorithms: ["HS256"], issuer: config.issuer, audience: config.audience,
        clockTimestamp: now, clockTolerance: 0, complete: true,
      });
      const p = result.payload;
      if (result.header.alg !== "HS256" || result.header.typ !== "JWT" ||
          !p || typeof p !== "object" || p.tokenUse !== "access" ||
          p.iss !== config.issuer || p.aud !== config.audience ||
          typeof p.sub !== "string" || !/^[1-9]\d{0,15}$/.test(p.sub) ||
          !Number.isSafeInteger(Number(p.sub)) || !sessionIdPattern.test(p.sid) ||
          !Number.isSafeInteger(p.iat) || !Number.isSafeInteger(p.exp) ||
          p.iat > now || p.exp <= now || p.exp <= p.iat || p.exp - p.iat > config.accessTtlSeconds) {
        throw new AuthError();
      }
      return { userId: Number(p.sub), sessionId: p.sid };
    } catch { throw new AuthError(); }
  }
  return { issue, verify };
}
module.exports = { createAccessTokens };
