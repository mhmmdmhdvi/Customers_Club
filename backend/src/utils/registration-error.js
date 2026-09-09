class RegistrationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "RegistrationError";
    this.statusCode = statusCode;
  }
}
module.exports = { RegistrationError };
