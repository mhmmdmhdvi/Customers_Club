const { AuthConfigurationError } = require("../utils/auth-error");

function readAuthConfig(env = process.env) {
  const invalid = () => { throw new AuthConfigurationError(); };
  if (!["development", "test", "production"].includes(env.NODE_ENV)) invalid();
  if (typeof env.ACCESS_TOKEN_SECRET !== "string" || !/^[a-f0-9]{64}$/i.test(env.ACCESS_TOKEN_SECRET)) invalid();
  for (const key of ["JWT_ISSUER", "JWT_AUDIENCE"]) {
    if (typeof env[key] !== "string" || !/^[\x21-\x7e]{1,128}$/.test(env[key])) invalid();
  }
  if (typeof env.AUTH_ALLOWED_ORIGINS !== "string" || !env.AUTH_ALLOWED_ORIGINS) invalid();
  const allowedOrigins = env.AUTH_ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  for (const origin of allowedOrigins) {
    let url;
    try { url = new URL(origin); } catch { invalid(); }
    const localHttp = env.NODE_ENV !== "production" && url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.origin !== origin || url.username || url.password) invalid();
  }
  const secure = env.NODE_ENV === "production";
  return {
    secret: Buffer.from(env.ACCESS_TOKEN_SECRET, "hex"),
    issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE,
    accessTtlSeconds: 15 * 60,
    allowedOrigins: [...new Set(allowedOrigins)],
    cookie: { name: secure ? "__Host-club_refresh" : "club_refresh", secure },
  };
}

// Missing auth configuration never opens credentialed CORS to arbitrary origins.
// Read per request so explicit test-process configuration takes effect before use.
function createSessionCorsOptions(getConfig = readAuthConfig) {
  return function sessionCorsOptions(req, callback) {
    let allowedOrigins = [];
    try { allowedOrigins = getConfig().allowedOrigins; } catch { /* fail closed */ }
    const origin = req.headers.origin;
    callback(null, {
      origin: typeof origin === "string" && allowedOrigins.includes(origin) ? origin : false,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Protection"],
      maxAge: 600,
    });
  };
}
const sessionCorsOptions = createSessionCorsOptions();
module.exports = { readAuthConfig, sessionCorsOptions, createSessionCorsOptions };
