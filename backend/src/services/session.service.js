require("../config/env");
const prisma = require("../config/database");
const { readAuthConfig } = require("../config/auth");
const { createAccessTokens } = require("../utils/access-token");
const { createSessionService } = require("./session.service.factory");

// Credentials are validated before work, not synthesized or defaulted. Keeping
// initialization lazy lets /health and input validation work before local setup.
function service() {
  const config = readAuthConfig();
  return createSessionService(prisma, { tokens: createAccessTokens(config) });
}
module.exports = {
  register: (input) => service().register(input),
  login: (input) => service().login(input),
  refresh: (token) => service().refresh(token),
  logout: (token) => service().logout(token),
  authenticate: (token) => service().authenticate(token),
};
