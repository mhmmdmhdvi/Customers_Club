class AuthError extends Error {
  constructor(message = "Invalid or expired session", statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}
class AuthConfigurationError extends Error {
  constructor() { super("Authentication configuration is incomplete or invalid"); this.name = "AuthConfigurationError"; }
}
module.exports = { AuthError, AuthConfigurationError };
