const { AuthError } = require("./auth-error");
const tokenPattern = /^[a-f0-9]{64}$/;

function options(config) {
  return { httpOnly: true, secure: config.cookie.secure, sameSite: "strict", path: "/" };
}
function readRefreshCookie(req, config) {
  const raw = req.headers.cookie;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.length > 8192) throw new AuthError();
  const values = raw.split(";").map((part) => part.trim()).filter((part) =>
    part.slice(0, part.indexOf("=")) === config.cookie.name
  ).map((part) => part.slice(part.indexOf("=") + 1));
  if (values.length === 0) return undefined;
  // Our cookie uses raw hexadecimal only; reject duplicate/encoded credentials.
  if (values.length !== 1 || !tokenPattern.test(values[0])) throw new AuthError();
  return values[0];
}
function setRefreshCookie(res, token, expiresAt, config) {
  if (typeof token !== "string" || !tokenPattern.test(token)) throw new Error("Invalid internal refresh credential");
  const expiry = new Date(expiresAt).getTime();
  const maxAge = expiry - Date.now();
  if (!Number.isFinite(expiry) || maxAge <= 0) throw new AuthError();
  res.cookie(config.cookie.name, token, { ...options(config), maxAge });
}
function clearRefreshCookie(res, config) { res.clearCookie(config.cookie.name, options(config)); }
module.exports = { readRefreshCookie, setRefreshCookie, clearRefreshCookie };
